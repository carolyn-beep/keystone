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
  bulkDeleteSources,
  bulkUpdateSourceCategories,
  createNote,
  createSource,
  deleteNoteForBrainlift,
  deleteSourceForBrainlift,
  getNoteForBrainlift,
  getNotesByBrainlift,
  getSecondBrainSummary,
  getSourceForBrainlift,
  getSourcesByBrainlift,
  listCategories,
  listNotes,
  listSources,
  updateNoteForBrainlift,
  updateSourceForBrainlift,
  SECOND_BRAIN_LIST_PAGE_SIZE,
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

  it('createSource persists Second Brain v2 enrichment fields and tolerates omission (FR2)', async () => {
    const { brainlift, category } = await createBrainliftFixture('source-enrichment');

    const enriched = await createSource(brainlift.id, {
      title: 'Enriched Source',
      url: 'https://example.com/enriched',
      author: 'Researcher',
      categoryId: category.id,
      type: 'Podcast',
      keyInsights: 'Battery cathode chemistry has shifted toward LFP for mid-range EVs.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });

    expect(enriched).toMatchObject({
      type: 'Podcast',
      keyInsights: 'Battery cathode chemistry has shifted toward LFP for mid-range EVs.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });

    const bare = await createSource(brainlift.id, {
      title: 'Bare Source',
      url: 'https://example.com/bare',
      author: 'Researcher',
      categoryId: category.id,
    });

    expect(bare).toMatchObject({
      type: null,
      keyInsights: null,
      length: null,
      whyMatters: null,
    });

    // Read-back via getSourceForBrainlift carries the enrichment fields too.
    const fetched = await getSourceForBrainlift(enriched.id, brainlift.id);
    expect(fetched).toMatchObject({
      id: enriched.id,
      type: 'Podcast',
      keyInsights: 'Battery cathode chemistry has shifted toward LFP for mid-range EVs.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });
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
      listSources: expect.any(Function),
      listNotes: expect.any(Function),
      listCategories: expect.any(Function),
      getSecondBrainSummary: expect.any(Function),
      createBlankBrainlift: expect.any(Function),
      setBrainliftPhase: expect.any(Function),
      setConversationBrainlift: expect.any(Function),
      getConversationBrainlift: expect.any(Function),
    });
  });

  it('listSources paginates and respects newest-first ordering and q filtering', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-sources');

    const totalSources = SECOND_BRAIN_LIST_PAGE_SIZE + 5;
    for (let i = 0; i < totalSources; i += 1) {
      await createSource(brainlift.id, {
        title: `Source ${i.toString().padStart(2, '0')} Battery`,
        url: `https://example.com/list-sources/${i}`,
        author: `Author ${i}`,
        categoryId: category.id,
      });
    }

    const page1 = await listSources(brainlift.id);
    expect(page1.items).toHaveLength(SECOND_BRAIN_LIST_PAGE_SIZE);
    expect(page1.pagination).toMatchObject({
      page: 1,
      pageSize: SECOND_BRAIN_LIST_PAGE_SIZE,
      totalItems: totalSources,
      hasMore: true,
    });
    expect(page1.items[0].title).toBe(`Source ${(totalSources - 1).toString().padStart(2, '0')} Battery`);

    const page2 = await listSources(brainlift.id, { page: 2 });
    expect(page2.items).toHaveLength(totalSources - SECOND_BRAIN_LIST_PAGE_SIZE);
    expect(page2.pagination.hasMore).toBe(false);

    const titleMatch = await listSources(brainlift.id, { q: 'Source 03' });
    expect(titleMatch.items).toHaveLength(1);
    expect(titleMatch.items[0]).toMatchObject({
      title: 'Source 03 Battery',
      categoryName: category.name,
    });

    const categoryMatch = await listSources(brainlift.id, { q: category.name });
    expect(categoryMatch.pagination.totalItems).toBe(totalSources);

    const urlMatch = await listSources(brainlift.id, {
      q: 'https://example.com/list-sources/7',
    });
    expect(urlMatch.items.some((s) => s.url === 'https://example.com/list-sources/7')).toBe(true);

    const noMatch = await listSources(brainlift.id, { q: 'no-such-thing-zzz' });
    expect(noMatch.items).toHaveLength(0);
    expect(noMatch.pagination.totalItems).toBe(0);
    expect(noMatch.pagination.hasMore).toBe(false);
  });

  it('listSources scopes results to one brainlift', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-sources-scope');
    const { brainlift: otherBrainlift, category: otherCategory } =
      await createBrainliftFixture('list-sources-scope-other', OTHER_USER_ID);

    await createSource(brainlift.id, {
      title: 'Mine',
      url: 'https://example.com/mine',
      author: 'Author',
      categoryId: category.id,
    });
    await createSource(otherBrainlift.id, {
      title: 'Theirs',
      url: 'https://example.com/theirs',
      author: 'Author',
      categoryId: otherCategory.id,
    });

    const result = await listSources(brainlift.id);
    expect(result.items.map((s) => s.title)).toEqual(['Mine']);
  });

  it('listNotes filters by sourceId, unlinkedOnly, and content search', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-notes');
    const sourceA = await createSource(brainlift.id, {
      title: 'Source A',
      url: 'https://example.com/source-a',
      author: 'Author',
      categoryId: category.id,
    });
    const sourceB = await createSource(brainlift.id, {
      title: 'Source B',
      url: 'https://example.com/source-b',
      author: 'Author',
      categoryId: category.id,
    });

    await createNote(brainlift.id, { sourceId: sourceA.id, content: 'About cathodes in A' });
    await createNote(brainlift.id, { sourceId: sourceB.id, content: 'About anodes in B' });
    await createNote(brainlift.id, { sourceId: null, content: 'Free thought about cathodes' });

    const all = await listNotes(brainlift.id);
    expect(all.pagination.totalItems).toBe(3);

    const aOnly = await listNotes(brainlift.id, { sourceId: sourceA.id });
    expect(aOnly.items).toHaveLength(1);
    expect(aOnly.items[0].sourceId).toBe(sourceA.id);

    const unlinked = await listNotes(brainlift.id, { unlinkedOnly: true });
    expect(unlinked.items).toHaveLength(1);
    expect(unlinked.items[0].sourceId).toBeNull();

    const cathodes = await listNotes(brainlift.id, { q: 'cathodes' });
    expect(cathodes.items).toHaveLength(2);

    const sourceIdOverridesUnlinked = await listNotes(brainlift.id, {
      sourceId: sourceA.id,
      unlinkedOnly: true,
    });
    expect(sourceIdOverridesUnlinked.items).toHaveLength(1);
    expect(sourceIdOverridesUnlinked.items[0].sourceId).toBe(sourceA.id);
  });

  it('listNotes paginates at the configured page size', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-notes-page');
    const source = await createSource(brainlift.id, {
      title: 'Source for notes pagination',
      url: 'https://example.com/notes-page',
      author: 'Author',
      categoryId: category.id,
    });

    const totalNotes = SECOND_BRAIN_LIST_PAGE_SIZE + 3;
    for (let i = 0; i < totalNotes; i += 1) {
      await createNote(brainlift.id, {
        sourceId: source.id,
        content: `Note ${i}`,
      });
    }

    const page1 = await listNotes(brainlift.id);
    expect(page1.items).toHaveLength(SECOND_BRAIN_LIST_PAGE_SIZE);
    expect(page1.pagination.hasMore).toBe(true);

    const page2 = await listNotes(brainlift.id, { page: 2 });
    expect(page2.items).toHaveLength(totalNotes - SECOND_BRAIN_LIST_PAGE_SIZE);
    expect(page2.pagination.hasMore).toBe(false);
  });

  it('listCategories returns sourceCount per category, ordered by sortOrder then name', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-categories');
    const secondCategory = (await db.insert(categories).values({
      brainliftId: brainlift.id,
      name: 'Aardvark Topics',
      sortOrder: null,
    }).returning())[0];
    const thirdCategory = (await db.insert(categories).values({
      brainliftId: brainlift.id,
      name: 'Top Priority',
      sortOrder: 0,
    }).returning())[0];

    await createSource(brainlift.id, {
      title: 'In default',
      url: 'https://example.com/cat-a',
      author: 'Author',
      categoryId: category.id,
    });
    await createSource(brainlift.id, {
      title: 'In default 2',
      url: 'https://example.com/cat-b',
      author: 'Author',
      categoryId: category.id,
    });
    await createSource(brainlift.id, {
      title: 'Priority source',
      url: 'https://example.com/cat-c',
      author: 'Author',
      categoryId: thirdCategory.id,
    });

    const list = await listCategories(brainlift.id);
    const byId = new Map(list.map((c) => [c.id, c]));

    expect(byId.get(category.id)?.sourceCount).toBe(2);
    expect(byId.get(thirdCategory.id)?.sourceCount).toBe(1);
    expect(byId.get(secondCategory.id)?.sourceCount).toBe(0);

    expect(list[0].id).toBe(thirdCategory.id);
    expect(list[list.length - 1].id).toBe(secondCategory.id);
  });

  it('getSecondBrainSummary aggregates source, note, and category counts', async () => {
    const { brainlift, category } = await createBrainliftFixture('summary');
    const empty = await getSecondBrainSummary(brainlift.id);
    expect(empty).toEqual({
      sourceCount: 0,
      noteCount: 0,
      linkedNoteCount: 0,
      unlinkedNoteCount: 0,
      categoryCount: 1,
      categories: [],
    });

    const secondCategory = (await db.insert(categories).values({
      brainliftId: brainlift.id,
      name: 'Chemistry',
      sortOrder: 1,
    }).returning())[0];

    const sourceA = await createSource(brainlift.id, {
      title: 'Source A',
      url: 'https://example.com/summary-a',
      author: 'Author',
      categoryId: category.id,
    });
    await createSource(brainlift.id, {
      title: 'Source B',
      url: 'https://example.com/summary-b',
      author: 'Author',
      categoryId: secondCategory.id,
    });

    await createNote(brainlift.id, { sourceId: sourceA.id, content: 'Linked' });
    await createNote(brainlift.id, { sourceId: null, content: 'Unlinked 1' });
    await createNote(brainlift.id, { sourceId: null, content: 'Unlinked 2' });

    const summary = await getSecondBrainSummary(brainlift.id);
    expect(summary).toMatchObject({
      sourceCount: 2,
      noteCount: 3,
      linkedNoteCount: 1,
      unlinkedNoteCount: 2,
      categoryCount: 2,
    });
    expect(summary.categories).toHaveLength(2);
    const byName = new Map(summary.categories.map((c) => [c.name, c.sourceCount]));
    expect(byName.get(category.name)).toBe(1);
    expect(byName.get('Chemistry')).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Spec 03 FR1: getSourcesByBrainlift must return spec-01 enrichment fields.
  // Spec 01 added persistence + single-source read; it did NOT update the
  // list path, which hand-selects columns. The v2 UI consumes the list, so
  // this gap blocks every card render until closed.
  // -------------------------------------------------------------------------
  it('getSourcesByBrainlift returns spec-01 enrichment fields (FR1)', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-enrichment');

    await createSource(brainlift.id, {
      title: 'Enriched listing',
      url: 'https://example.com/list-enrichment',
      author: 'Researcher',
      categoryId: category.id,
      type: 'Podcast',
      keyInsights: 'LFP cathode chemistry is winning the mid-range EV segment.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });

    const rows = await getSourcesByBrainlift(brainlift.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'Podcast',
      keyInsights: 'LFP cathode chemistry is winning the mid-range EV segment.',
      length: '48 min',
      whyMatters: 'Directly informs the supply-chain angle the student picked.',
    });
  });

  it('getSourcesByBrainlift returns null enrichment fields when omitted (FR1)', async () => {
    const { brainlift, category } = await createBrainliftFixture('list-bare');

    await createSource(brainlift.id, {
      title: 'Bare listing',
      url: 'https://example.com/list-bare',
      author: 'Researcher',
      categoryId: category.id,
    });

    const rows = await getSourcesByBrainlift(brainlift.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: null,
      keyInsights: null,
      length: null,
      whyMatters: null,
    });
  });

  // -------------------------------------------------------------------------
  // Spec 03 FR2: bulkDeleteSources
  // -------------------------------------------------------------------------
  it('bulkDeleteSources deletes multiple same-brainlift sources and reports the count (FR2)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-delete-happy');

    const a = await createSource(brainlift.id, {
      title: 'A', url: 'https://example.com/bd-a', author: 'A', categoryId: category.id,
    });
    const b = await createSource(brainlift.id, {
      title: 'B', url: 'https://example.com/bd-b', author: 'B', categoryId: category.id,
    });
    const c = await createSource(brainlift.id, {
      title: 'C', url: 'https://example.com/bd-c', author: 'C', categoryId: category.id,
    });

    const deleted = await bulkDeleteSources(brainlift.id, [a.id, b.id]);
    expect(deleted).toBe(2);

    const remaining = await getSourcesByBrainlift(brainlift.id);
    expect(remaining.map((s) => s.id)).toEqual([c.id]);
  });

  it('bulkDeleteSources will not touch sources from a different brainlift (FR2 IDOR)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-delete-own');
    const { brainlift: other, category: otherCategory } = await createBrainliftFixture('bulk-delete-other', OTHER_USER_ID);

    const mine = await createSource(brainlift.id, {
      title: 'Mine', url: 'https://example.com/bd-mine', author: 'A', categoryId: category.id,
    });
    const theirs = await createSource(other.id, {
      title: 'Theirs', url: 'https://example.com/bd-theirs', author: 'B', categoryId: otherCategory.id,
    });

    const deleted = await bulkDeleteSources(brainlift.id, [mine.id, theirs.id]);
    // Only the same-brainlift row is deleted; the cross-brainlift id is silently dropped.
    expect(deleted).toBe(1);

    const stillTheirs = await getSourceForBrainlift(theirs.id, other.id);
    expect(stillTheirs).not.toBeNull();
  });

  it('bulkDeleteSources is idempotent on already-deleted ids (FR2)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-delete-idem');
    const a = await createSource(brainlift.id, {
      title: 'A', url: 'https://example.com/bd-idem', author: 'A', categoryId: category.id,
    });

    const first = await bulkDeleteSources(brainlift.id, [a.id]);
    expect(first).toBe(1);

    const second = await bulkDeleteSources(brainlift.id, [a.id]);
    expect(second).toBe(0);
  });

  it('bulkDeleteSources returns 0 when given an empty id list (FR2)', async () => {
    const { brainlift } = await createBrainliftFixture('bulk-delete-empty');
    const deleted = await bulkDeleteSources(brainlift.id, []);
    expect(deleted).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Spec 03 FR3: bulkUpdateSourceCategories
  // -------------------------------------------------------------------------
  it('bulkUpdateSourceCategories moves matching sources to a new category (FR3)', async () => {
    const { brainlift, category: catA } = await createBrainliftFixture('bulk-recat-happy');
    const [catB] = await db.insert(categories).values({
      brainliftId: brainlift.id, name: 'Bulk Target', sortOrder: 2,
    }).returning();

    const s1 = await createSource(brainlift.id, {
      title: 'S1', url: 'https://example.com/br-s1', author: 'A', categoryId: catA.id,
    });
    const s2 = await createSource(brainlift.id, {
      title: 'S2', url: 'https://example.com/br-s2', author: 'B', categoryId: catA.id,
    });

    const updated = await bulkUpdateSourceCategories(brainlift.id, [s1.id, s2.id], catB.id);
    expect(updated).toBe(2);

    const all = await getSourcesByBrainlift(brainlift.id);
    expect(all.every((s) => s.categoryId === catB.id)).toBe(true);
  });

  it('bulkUpdateSourceCategories rejects a categoryId from another brainlift (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-recat-own');
    const { category: otherCategory } = await createBrainliftFixture('bulk-recat-other', OTHER_USER_ID);

    const s = await createSource(brainlift.id, {
      title: 'S', url: 'https://example.com/br-x', author: 'A', categoryId: category.id,
    });

    await expect(
      bulkUpdateSourceCategories(brainlift.id, [s.id], otherCategory.id),
    ).rejects.toThrow('Category does not belong to this brainlift');
  });

  it('bulkUpdateSourceCategories only touches same-brainlift source ids (FR3 IDOR)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-recat-idor-own');
    const { brainlift: other, category: otherCategory } = await createBrainliftFixture('bulk-recat-idor-other', OTHER_USER_ID);
    const [targetCat] = await db.insert(categories).values({
      brainliftId: brainlift.id, name: 'Target', sortOrder: 5,
    }).returning();

    const mine = await createSource(brainlift.id, {
      title: 'Mine', url: 'https://example.com/br-idor-mine', author: 'A', categoryId: category.id,
    });
    const theirs = await createSource(other.id, {
      title: 'Theirs', url: 'https://example.com/br-idor-theirs', author: 'B', categoryId: otherCategory.id,
    });

    const updated = await bulkUpdateSourceCategories(brainlift.id, [mine.id, theirs.id], targetCat.id);
    expect(updated).toBe(1);

    const stillTheirCategory = await getSourceForBrainlift(theirs.id, other.id);
    expect(stillTheirCategory?.categoryId).toBe(otherCategory.id);
  });

  it('bulkUpdateSourceCategories returns 0 when given an empty id list (FR3)', async () => {
    const { brainlift, category } = await createBrainliftFixture('bulk-recat-empty');
    const updated = await bulkUpdateSourceCategories(brainlift.id, [], category.id);
    expect(updated).toBe(0);
  });
});
