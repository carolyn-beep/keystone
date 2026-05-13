import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  categories,
  chatConversations,
  learningStreamItems,
  notes,
  sources,
  user,
} from '@shared/schema';
import {
  createNote,
  createSource,
  deleteNoteForBrainlift,
  deleteSourceForBrainlift,
  getNoteForBrainlift,
  getNotesByBrainlift,
  getSourceForBrainlift,
  getSourcesByBrainlift,
  updateNoteForBrainlift,
  updateSourceForBrainlift,
} from '../second-brain';
import { storage } from '../index';

const TEST_USER_ID = `second-brain-owner-${Date.now()}`;
const OTHER_USER_ID = `second-brain-other-${Date.now()}`;
const createdBrainliftIds: number[] = [];

const DEFAULT_SUMMARY = {
  totalFacts: 0,
  meanScore: '0',
  score5Count: 0,
  contradictionCount: 0,
};

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: TEST_USER_ID,
      email: `${TEST_USER_ID}@example.com`,
      name: 'Second Brain Owner',
      emailVerified: false,
    },
    {
      id: OTHER_USER_ID,
      email: `${OTHER_USER_ID}@example.com`,
      name: 'Second Brain Other',
      emailVerified: false,
    },
  ]);
});

beforeEach(async () => {
  await db.delete(chatConversations).where(inArray(chatConversations.userId, [TEST_USER_ID, OTHER_USER_ID]));

  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds));
    createdBrainliftIds.length = 0;
  }
});

afterAll(async () => {
  await db.delete(chatConversations).where(inArray(chatConversations.userId, [TEST_USER_ID, OTHER_USER_ID])).catch(() => undefined);

  if (createdBrainliftIds.length > 0) {
    await db.delete(brainlifts).where(inArray(brainlifts.id, createdBrainliftIds)).catch(() => undefined);
  }

  await db.delete(user).where(inArray(user.id, [TEST_USER_ID, OTHER_USER_ID])).catch(() => undefined);
});

async function createBrainliftFixture(label: string, userId = TEST_USER_ID) {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: `second-brain-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Second Brain ${label}`,
    description: 'Second brain test fixture',
    summary: DEFAULT_SUMMARY,
    createdByUserId: userId,
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

async function createLearningStreamItemFixture(brainliftId: number) {
  const [item] = await db.insert(learningStreamItems).values({
    brainliftId,
    type: 'Article',
    author: 'Researcher',
    topic: 'A useful source',
    time: '5 min',
    facts: 'Useful facts',
    url: `https://example.com/learning-stream/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'manual',
  }).returning();

  return item;
}

describe('second brain storage', () => {
  it('createSource stores source fields, JSONB content, and learning stream origin (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('source-happy');
    const learningStreamItem = await createLearningStreamItemFixture(brainlift.id);

    const source = await createSource(brainlift.id, {
      title: 'Original Source',
      url: 'https://example.com/source',
      author: 'Ada Lovelace',
      categoryId: category.id,
      extractedContent: { contentType: 'article', markdown: '# Source' },
      learningStreamItemId: learningStreamItem.id,
    });

    expect(source).toMatchObject({
      brainliftId: brainlift.id,
      title: 'Original Source',
      url: 'https://example.com/source',
      author: 'Ada Lovelace',
      categoryId: category.id,
      extractedContent: { contentType: 'article', markdown: '# Source' },
      learningStreamItemId: learningStreamItem.id,
    });
    expect(source.id).toEqual(expect.any(Number));
    expect(source.createdAt).toBeInstanceOf(Date);
  });

  it('createSource rejects cross-brainlift categories and duplicate URLs (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('source-owner');
    const { brainlift: otherBrainlift, category: otherCategory } = await createBrainliftFixture('source-other', OTHER_USER_ID);

    await expect(createSource(brainlift.id, {
      title: 'Wrong category',
      url: 'https://example.com/wrong-category',
      author: 'Researcher',
      categoryId: otherCategory.id,
    })).rejects.toThrow('Category does not belong to this brainlift');

    await createSource(brainlift.id, {
      title: 'Duplicate URL',
      url: 'https://example.com/duplicate',
      author: 'Researcher',
      categoryId: category.id,
    });

    await expect(createSource(brainlift.id, {
      title: 'Duplicate URL again',
      url: 'https://example.com/duplicate',
      author: 'Researcher',
      categoryId: category.id,
    })).rejects.toMatchObject({ cause: { code: '23505' } });

    await expect(createSource(otherBrainlift.id, {
      title: 'Same URL on other brainlift',
      url: 'https://example.com/duplicate',
      author: 'Researcher',
      categoryId: otherCategory.id,
    })).resolves.toMatchObject({ brainliftId: otherBrainlift.id });
  });

  it('source reads, updates, and deletes are brainlift-scoped and include category names (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('source-scope');
    const { brainlift: otherBrainlift } = await createBrainliftFixture('source-scope-other', OTHER_USER_ID);
    const source = await createSource(brainlift.id, {
      title: 'Scoped Source',
      url: 'https://example.com/scoped',
      author: 'Researcher',
      categoryId: category.id,
    });

    await expect(getSourceForBrainlift(source.id, otherBrainlift.id)).resolves.toBeNull();
    await expect(getSourceForBrainlift(999_999_999, brainlift.id)).resolves.toBeNull();

    const listed = await getSourcesByBrainlift(brainlift.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: source.id,
      categoryName: category.name,
    });

    await expect(updateSourceForBrainlift(source.id, otherBrainlift.id, { title: 'Hijacked' }))
      .resolves.toBeNull();

    const updated = await updateSourceForBrainlift(source.id, brainlift.id, { title: 'Updated Source' });
    expect(updated).toMatchObject({ id: source.id, title: 'Updated Source' });

    await expect(deleteSourceForBrainlift(source.id, otherBrainlift.id)).resolves.toBe(false);
    await expect(deleteSourceForBrainlift(source.id, brainlift.id)).resolves.toBe(true);
    await expect(getSourceForBrainlift(source.id, brainlift.id)).resolves.toBeNull();
  });

  it('createNote supports linked and free-floating notes and rejects cross-brainlift source IDs (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('note-owner');
    const { brainlift: otherBrainlift, category: otherCategory } = await createBrainliftFixture('note-other', OTHER_USER_ID);
    const source = await createSource(brainlift.id, {
      title: 'Source for notes',
      url: 'https://example.com/note-source',
      author: 'Researcher',
      categoryId: category.id,
    });
    const otherSource = await createSource(otherBrainlift.id, {
      title: 'Other source',
      url: 'https://example.com/other-note-source',
      author: 'Researcher',
      categoryId: otherCategory.id,
    });

    const linked = await createNote(brainlift.id, {
      sourceId: source.id,
      categoryId: category.id,
      content: 'Student reflection tied to a source',
    });
    const unlinked = await createNote(brainlift.id, {
      sourceId: null,
      categoryId: null,
      content: 'A free-floating student thought',
    });

    expect(linked).toMatchObject({
      brainliftId: brainlift.id,
      sourceId: source.id,
      categoryId: category.id,
    });
    expect(unlinked).toMatchObject({
      brainliftId: brainlift.id,
      sourceId: null,
      categoryId: null,
    });

    await expect(createNote(brainlift.id, {
      sourceId: otherSource.id,
      content: 'Cross-brainlift note',
    })).rejects.toThrow('Source does not belong to this brainlift');
  });

  it('note reads, filters, updates, and deletes are brainlift-scoped (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('note-scope');
    const { brainlift: otherBrainlift } = await createBrainliftFixture('note-scope-other', OTHER_USER_ID);
    const source = await createSource(brainlift.id, {
      title: 'Filter Source',
      url: 'https://example.com/filter-source',
      author: 'Researcher',
      categoryId: category.id,
    });
    const linked = await createNote(brainlift.id, {
      sourceId: source.id,
      content: 'Linked note',
    });
    const unlinked = await createNote(brainlift.id, {
      sourceId: null,
      content: 'Unlinked note',
    });

    await expect(getNotesByBrainlift(brainlift.id, { sourceId: source.id }))
      .resolves.toEqual([expect.objectContaining({ id: linked.id })]);
    await expect(getNotesByBrainlift(brainlift.id, { sourceId: null }))
      .resolves.toEqual([expect.objectContaining({ id: unlinked.id })]);

    await expect(getNoteForBrainlift(linked.id, otherBrainlift.id)).resolves.toBeNull();
    await expect(updateNoteForBrainlift(linked.id, otherBrainlift.id, { content: 'Hijacked' }))
      .resolves.toBeNull();

    const updated = await updateNoteForBrainlift(linked.id, brainlift.id, { content: 'Updated linked note' });
    expect(updated).toMatchObject({ id: linked.id, content: 'Updated linked note' });

    await expect(deleteNoteForBrainlift(linked.id, otherBrainlift.id)).resolves.toBe(false);
    await expect(deleteNoteForBrainlift(linked.id, brainlift.id)).resolves.toBe(true);
    await expect(getNoteForBrainlift(linked.id, brainlift.id)).resolves.toBeNull();
  });

  it('database cascades sources and notes on brainlift delete and restricts source category deletion (FR1)', async () => {
    const { brainlift, category } = await createBrainliftFixture('fk-behavior');
    const [conversation] = await db.insert(chatConversations).values({
      userId: TEST_USER_ID,
      title: 'FK behavior',
      brainliftId: brainlift.id,
    }).returning();
    const source = await createSource(brainlift.id, {
      title: 'Restrict Source',
      url: 'https://example.com/restrict-source',
      author: 'Researcher',
      categoryId: category.id,
    });
    await createNote(brainlift.id, {
      sourceId: source.id,
      content: 'Deleted with brainlift',
    });

    await expect(db.delete(categories).where(eq(categories.id, category.id)))
      .rejects.toMatchObject({ cause: { constraint: 'sources_category_id_fkey' } });

    await db.delete(brainlifts).where(eq(brainlifts.id, brainlift.id));
    createdBrainliftIds.splice(createdBrainliftIds.indexOf(brainlift.id), 1);

    await expect(db.select().from(sources).where(eq(sources.brainliftId, brainlift.id)))
      .resolves.toHaveLength(0);
    await expect(db.select().from(notes).where(eq(notes.brainliftId, brainlift.id)))
      .resolves.toHaveLength(0);

    const [updatedConversation] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversation.id));
    expect(updatedConversation?.brainliftId).toBeNull();
  });

  it('storage facade exposes research-first storage helpers (FR6)', () => {
    expect(storage).toMatchObject({
      createSource: expect.any(Function),
      getSourcesByBrainlift: expect.any(Function),
      getSourceForBrainlift: expect.any(Function),
      updateSourceForBrainlift: expect.any(Function),
      deleteSourceForBrainlift: expect.any(Function),
      createNote: expect.any(Function),
      getNotesByBrainlift: expect.any(Function),
      getNoteForBrainlift: expect.any(Function),
      updateNoteForBrainlift: expect.any(Function),
      deleteNoteForBrainlift: expect.any(Function),
      createBlankBrainlift: expect.any(Function),
      setBrainliftPhase: expect.any(Function),
      setConversationBrainlift: expect.any(Function),
      getConversationBrainlift: expect.any(Function),
    });
  });
});
