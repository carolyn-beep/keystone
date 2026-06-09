import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  categories,
  learningStreamItems,
  notes,
  sources,
  user,
} from '@shared/schema';
import {
  ensureCategoryByName,
  ensureSourceFromLearningStreamItem,
} from '../second-brain';
import { BadRequestError, NotFoundError } from '../../middleware/error-handler';

const TEST_USER_ID = `from-reader-owner-${Date.now()}`;
const createdBrainliftIds: number[] = [];

const DEFAULT_SUMMARY = {
  totalFacts: 0,
  meanScore: '0',
  score5Count: 0,
  contradictionCount: 0,
};

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    email: `${TEST_USER_ID}@example.com`,
    name: 'From Reader Owner',
    emailVerified: false,
  });
});

beforeEach(async () => {
  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds));
    createdBrainliftIds.length = 0;
  }
});

afterAll(async () => {
  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds)).catch(() => undefined);
  }
  await db.delete(user).where(inArray(user.id, [TEST_USER_ID])).catch(() => undefined);
});

async function createBrainliftFixture(label: string) {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: `from-reader-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `From Reader ${label}`,
    description: 'From reader test fixture',
    summary: DEFAULT_SUMMARY,
    createdByUserId: TEST_USER_ID,
    phase: 'research',
  }).returning();

  createdBrainliftIds.push(brainlift.id);

  const [category] = await db.insert(categories).values({
    brainliftId: brainlift.id,
    name: `Category ${label}`,
    sortOrder: 1,
  }).returning();

  return { brainlift, category };
}

async function createLearningStreamItemFixture(brainliftId: number, overrides: Partial<{
  type: string;
  author: string;
  topic: string;
  time: string;
  facts: string;
  aiRationale: string | null;
  url: string;
}> = {}) {
  const [item] = await db.insert(learningStreamItems).values({
    brainliftId,
    type: overrides.type ?? 'Podcast',
    author: overrides.author ?? 'Researcher',
    topic: overrides.topic ?? 'A useful source',
    time: overrides.time ?? '30 min',
    facts: overrides.facts ?? 'Useful facts.',
    aiRationale: overrides.aiRationale ?? 'Aligned with the student angle.',
    url: overrides.url ?? `https://example.com/lsi/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'manual',
  }).returning();

  return item;
}

describe('ensureCategoryByName', () => {
  it('returns the existing row when an exact-name category exists, without inserting a duplicate', async () => {
    const { brainlift, category } = await createBrainliftFixture('cat-existing');

    const result = await db.transaction(async (tx) => {
      return ensureCategoryByName(tx, brainlift.id, category.name);
    });

    expect(result).toEqual({ id: category.id, name: category.name });

    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(
        eq(categories.brainliftId, brainlift.id),
        eq(categories.name, category.name),
      ));
    expect(rows).toHaveLength(1);
  });

  it('inserts a new row when no match exists and returns its { id, name }', async () => {
    const { brainlift } = await createBrainliftFixture('cat-insert');
    const name = `Fresh Category ${Date.now()}`;

    const result = await db.transaction(async (tx) => {
      return ensureCategoryByName(tx, brainlift.id, name);
    });

    expect(result.name).toBe(name);
    expect(result.id).toEqual(expect.any(Number));

    const [persisted] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, result.id));
    expect(persisted).toMatchObject({
      brainliftId: brainlift.id,
      name,
    });
  });

  it('treats "AI" and "ai" as distinct categories (exact case-sensitive match)', async () => {
    const { brainlift } = await createBrainliftFixture('cat-case');

    const upper = await db.transaction(async (tx) => ensureCategoryByName(tx, brainlift.id, 'AI'));
    const lower = await db.transaction(async (tx) => ensureCategoryByName(tx, brainlift.id, 'ai'));

    expect(upper.id).not.toBe(lower.id);
    expect(upper.name).toBe('AI');
    expect(lower.name).toBe('ai');
  });

  it('trims whitespace from the input name before matching', async () => {
    const { brainlift, category } = await createBrainliftFixture('cat-trim');

    const result = await db.transaction(async (tx) => {
      return ensureCategoryByName(tx, brainlift.id, `  ${category.name}  `);
    });

    expect(result.id).toBe(category.id);
  });

  it('throws BadRequestError("categoryName cannot be empty") for whitespace-only input', async () => {
    const { brainlift } = await createBrainliftFixture('cat-empty');

    await expect(
      db.transaction(async (tx) => ensureCategoryByName(tx, brainlift.id, '   ')),
    ).rejects.toThrow(BadRequestError);
    await expect(
      db.transaction(async (tx) => ensureCategoryByName(tx, brainlift.id, '   ')),
    ).rejects.toThrow('categoryName cannot be empty');
  });

  it('operates inside the passed tx — a rollback un-creates the inserted row', async () => {
    const { brainlift } = await createBrainliftFixture('cat-rollback');
    const name = `Rollback Category ${Date.now()}`;

    await expect(
      db.transaction(async (tx) => {
        const result = await ensureCategoryByName(tx, brainlift.id, name);
        expect(result.name).toBe(name);
        // Force rollback
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');

    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(
        eq(categories.brainliftId, brainlift.id),
        eq(categories.name, name),
      ));
    expect(rows).toHaveLength(0);
  });

  it('does not match a category with the same name in a different brainlift', async () => {
    const { brainlift: b1 } = await createBrainliftFixture('cat-iso-1');
    const { brainlift: b2 } = await createBrainliftFixture('cat-iso-2');
    const sharedName = `Shared ${Date.now()}`;

    const inB1 = await db.transaction(async (tx) => ensureCategoryByName(tx, b1.id, sharedName));
    const inB2 = await db.transaction(async (tx) => ensureCategoryByName(tx, b2.id, sharedName));

    expect(inB1.id).not.toBe(inB2.id);

    const [persistedB2] = await db
      .select()
      .from(categories)
      .where(eq(categories.id, inB2.id));
    expect(persistedB2.brainliftId).toBe(b2.id);
  });
});

describe('ensureSourceFromLearningStreamItem', () => {
  it('happy path A — mirrors a fresh LSI into a new source row with created=true', async () => {
    const { brainlift, category } = await createBrainliftFixture('ensure-src-fresh');
    const item = await createLearningStreamItemFixture(brainlift.id, {
      type: 'Video',
      topic: 'New mirror target',
      time: '12 min',
      facts: 'Insight X.',
      aiRationale: 'Why it matters Y.',
    });

    const result = await db.transaction(async (tx) => {
      return ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });
    });

    expect(result.created).toBe(true);
    expect(result.source).toMatchObject({
      brainliftId: brainlift.id,
      title: item.topic,
      url: item.url,
      author: item.author,
      categoryId: category.id,
      learningStreamItemId: item.id,
      type: 'Video',
      keyInsights: 'Insight X.',
      length: '12 min',
      whyMatters: 'Why it matters Y.',
    });
    expect(result.item.status).toBe('bookmarked');
  });

  it('happy path B — adopts an existing source for the same URL with created=false and does not overwrite enrichment fields', async () => {
    const { brainlift, category } = await createBrainliftFixture('ensure-src-adopt');
    const item = await createLearningStreamItemFixture(brainlift.id, {
      facts: 'Original insights from LSI.',
      aiRationale: 'Original why-matters from LSI.',
    });

    const first = await db.transaction(async (tx) => {
      return ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });
    });
    expect(first.created).toBe(true);

    // User edits the saved source between mirrors.
    await db
      .update(sources)
      .set({
        keyInsights: 'User-edited insights.',
        whyMatters: 'User-edited why-matters.',
      })
      .where(eq(sources.id, first.source.id));

    const second = await db.transaction(async (tx) => {
      return ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });
    });

    expect(second.created).toBe(false);
    expect(second.source.id).toBe(first.source.id);
    expect(second.source).toMatchObject({
      keyInsights: 'User-edited insights.',
      whyMatters: 'User-edited why-matters.',
    });
  });

  it('throws NotFoundError when learningStreamItemId belongs to a different brainlift', async () => {
    const { brainlift: own, category } = await createBrainliftFixture('ensure-src-foreign-lsi-own');
    const { brainlift: other } = await createBrainliftFixture('ensure-src-foreign-lsi-other');
    const foreignItem = await createLearningStreamItemFixture(other.id);

    await expect(
      db.transaction(async (tx) => {
        return ensureSourceFromLearningStreamItem(tx, {
          brainliftId: own.id,
          itemId: foreignItem.id,
          categoryId: category.id,
        });
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws BadRequestError when categoryId belongs to a different brainlift', async () => {
    const { brainlift: own } = await createBrainliftFixture('ensure-src-foreign-cat-own');
    const { category: foreignCategory } = await createBrainliftFixture('ensure-src-foreign-cat-other');
    const item = await createLearningStreamItemFixture(own.id);

    await expect(
      db.transaction(async (tx) => {
        return ensureSourceFromLearningStreamItem(tx, {
          brainliftId: own.id,
          itemId: item.id,
          categoryId: foreignCategory.id,
        });
      }),
    ).rejects.toThrow(BadRequestError);
    await expect(
      db.transaction(async (tx) => {
        return ensureSourceFromLearningStreamItem(tx, {
          brainliftId: own.id,
          itemId: item.id,
          categoryId: foreignCategory.id,
        });
      }),
    ).rejects.toThrow('Category does not belong to this brainlift');
  });

  it('is idempotent when the LSI is already in status=bookmarked — still returns the existing source with created=false', async () => {
    const { brainlift, category } = await createBrainliftFixture('ensure-src-already-bm');
    const item = await createLearningStreamItemFixture(brainlift.id);

    const first = await db.transaction(async (tx) => {
      return ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });
    });
    expect(first.created).toBe(true);
    expect(first.item.status).toBe('bookmarked');

    const second = await db.transaction(async (tx) => {
      return ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });
    });

    expect(second.created).toBe(false);
    expect(second.item.status).toBe('bookmarked');
    expect(second.source.id).toBe(first.source.id);
  });

  it('operates inside the passed tx — a rollback un-creates both the source row and the LSI status flip', async () => {
    const { brainlift, category } = await createBrainliftFixture('ensure-src-rollback');
    const item = await createLearningStreamItemFixture(brainlift.id);

    await expect(
      db.transaction(async (tx) => {
        const result = await ensureSourceFromLearningStreamItem(tx, {
          brainliftId: brainlift.id,
          itemId: item.id,
          categoryId: category.id,
        });
        expect(result.created).toBe(true);
        throw new Error('intentional rollback');
      }),
    ).rejects.toThrow('intentional rollback');

    const sourceRows = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.brainliftId, brainlift.id));
    expect(sourceRows).toHaveLength(0);

    const [lsiAfter] = await db
      .select({ status: learningStreamItems.status })
      .from(learningStreamItems)
      .where(eq(learningStreamItems.id, item.id));
    expect(lsiAfter.status).toBe('pending');
  });

  it('composes inside a caller-provided tx alongside other writes (no nested transaction)', async () => {
    // Sanity check that the helper accepts a tx and a subsequent insert in the
    // same tx sees the mirrored source row.
    const { brainlift, category } = await createBrainliftFixture('ensure-src-compose');
    const item = await createLearningStreamItemFixture(brainlift.id);

    const result = await db.transaction(async (tx) => {
      const { source } = await ensureSourceFromLearningStreamItem(tx, {
        brainliftId: brainlift.id,
        itemId: item.id,
        categoryId: category.id,
      });

      const [note] = await tx
        .insert(notes)
        .values({
          brainliftId: brainlift.id,
          sourceId: source.id,
          categoryId: category.id,
          content: 'Composed note inside the same tx.',
        })
        .returning();

      return { sourceId: source.id, noteSourceId: note.sourceId };
    });

    expect(result.noteSourceId).toBe(result.sourceId);
  });
});
