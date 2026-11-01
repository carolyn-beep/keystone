import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  categories,
  learningStreamItems,
  sources,
  user,
} from '@shared/schema';
import { bookmarkResearchItemWithSource } from '../learning-stream';

const TEST_USER_ID = `bookmark-mirror-owner-${Date.now()}`;
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
    name: 'Bookmark Mirror Owner',
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

async function createFixture(label: string) {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: `bookmark-mirror-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Bookmark Mirror ${label}`,
    description: 'Bookmark mirror test fixture',
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

describe('bookmarkResearchItemWithSource — Second Brain v2 enrichment mirror (FR3)', () => {
  it('copies type, facts (keyInsights), time (length), and aiRationale (whyMatters) from LSI into the source row', async () => {
    const { brainlift, category } = await createFixture('full');

    const [item] = await db.insert(learningStreamItems).values({
      brainliftId: brainlift.id,
      type: 'Podcast',
      author: 'Researcher',
      topic: 'Battery Cathode Chemistry Deep Dive',
      time: '48 min',
      facts: 'LFP cathodes have overtaken NMC for mid-range EVs since 2023.',
      aiRationale: 'Directly informs the supply-chain angle the student picked.',
      url: `https://example.com/lsi/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
    }).returning();

    const { item: updatedItem, source } = await bookmarkResearchItemWithSource({
      brainliftId: brainlift.id,
      itemId: item.id,
      categoryId: category.id,
    });

    expect(updatedItem.status).toBe('bookmarked');
    expect(source).toMatchObject({
      brainliftId: brainlift.id,
      title: item.topic,
      url: item.url,
      author: item.author,
      categoryId: category.id,
      learningStreamItemId: item.id,
      type: 'Podcast',
      keyInsights: 'LFP cathodes have overtaken NMC for mid-range EVs since 2023.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });
  });

  it('preserves null on whyMatters when the LSI aiRationale is missing', async () => {
    const { brainlift, category } = await createFixture('partial');

    const [item] = await db.insert(learningStreamItems).values({
      brainliftId: brainlift.id,
      type: 'AcademicPaper',
      author: 'Researcher',
      topic: 'Niche paper without rationale',
      time: '20 min',
      facts: 'Useful background.',
      // aiRationale intentionally omitted -> null
      url: `https://example.com/lsi-partial/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
    }).returning();

    const { source } = await bookmarkResearchItemWithSource({
      brainliftId: brainlift.id,
      itemId: item.id,
      categoryId: category.id,
    });

    expect(source).toMatchObject({
      type: 'AcademicPaper',
      keyInsights: 'Useful background.',
      length: '20 min',
      whyMatters: null,
    });
  });

  it('re-bookmarking an already-mirrored item returns the existing source unchanged (enrichment fields not overwritten)', async () => {
    const { brainlift, category } = await createFixture('idempotent');

    const [item] = await db.insert(learningStreamItems).values({
      brainliftId: brainlift.id,
      type: 'Video',
      author: 'Researcher',
      topic: 'A video to bookmark twice',
      time: '12 min',
      facts: 'Original key insights.',
      aiRationale: 'Original why-matters.',
      url: `https://example.com/lsi-idem/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
    }).returning();

    const first = await bookmarkResearchItemWithSource({
      brainliftId: brainlift.id,
      itemId: item.id,
      categoryId: category.id,
    });

    // Simulate the user editing the saved source between bookmarks.
    await db
      .update(sources)
      .set({
        keyInsights: 'Edited insights I want to keep.',
        whyMatters: 'Edited why-matters I want to keep.',
      })
      .where(inArray(sources.id, [first.source.id]));

    const second = await bookmarkResearchItemWithSource({
      brainliftId: brainlift.id,
      itemId: item.id,
      categoryId: category.id,
    });

    expect(second.source.id).toBe(first.source.id);
    expect(second.source).toMatchObject({
      keyInsights: 'Edited insights I want to keep.',
      whyMatters: 'Edited why-matters I want to keep.',
    });
  });

  // Spec 01 FR2 regression: after the wrapper is refactored to delegate to
  // ensureSourceFromLearningStreamItem, the public shape must remain exactly
  // { source, item } — the `created` flag from the storage helper must NOT
  // leak through the public wrapper, so existing consumers (PATCH
  // /learning-stream/:itemId/bookmark) are byte-compatible.
  it('returns exactly { source, item } — no `created` flag leaks from the storage helper', async () => {
    const { brainlift, category } = await createFixture('shape');

    const [item] = await db.insert(learningStreamItems).values({
      brainliftId: brainlift.id,
      type: 'News',
      author: 'Wire',
      topic: 'Shape stability check',
      time: '3 min',
      facts: 'Just enough for the row.',
      url: `https://example.com/lsi-shape/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
    }).returning();

    const result = await bookmarkResearchItemWithSource({
      brainliftId: brainlift.id,
      itemId: item.id,
      categoryId: category.id,
    });

    expect(Object.keys(result).sort()).toEqual(['item', 'source']);
    expect((result as Record<string, unknown>).created).toBeUndefined();
  });
});
