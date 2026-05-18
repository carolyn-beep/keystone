/**
 * Tests for spec 05-categories-tab storage functions.
 *
 * FR1: getCategoriesWithCountsForSecondBrain - single grouped query returning
 *      per-category sourceCount + noteCount.
 * FR2: reorderCategories - validated UPDATE that rewrites every category's
 *      sort_order to its index in the provided id list.
 *
 * Uses the real Drizzle `db` against the local test database (same pattern
 * as the sibling second-brain.test.ts).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray, asc } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  categories,
  notes,
  sources,
  user,
} from '@shared/schema';
import {
  getCategoriesWithCountsForSecondBrain,
  reorderCategories,
} from '../second-brain';
import { storage } from '../index';
import { BadRequestError, NotFoundError } from '../../middleware/error-handler';

const TEST_USER_ID = `categories-tab-owner-${Date.now()}`;
const OTHER_USER_ID = `categories-tab-other-${Date.now()}`;
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
      name: 'Categories Tab Owner',
      emailVerified: false,
    },
    {
      id: OTHER_USER_ID,
      email: `${OTHER_USER_ID}@example.com`,
      name: 'Categories Tab Other',
      emailVerified: false,
    },
  ]);
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
  await db.delete(user).where(inArray(user.id, [TEST_USER_ID, OTHER_USER_ID])).catch(() => undefined);
});

async function createBrainlift(label: string, userId = TEST_USER_ID) {
  const [bl] = await db.insert(brainlifts).values({
    slug: `cat-tab-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: `Cat Tab ${label}`,
    description: 'Categories tab test fixture',
    summary: DEFAULT_SUMMARY,
    createdByUserId: userId,
    phase: 'research',
  }).returning();
  createdBrainliftIds.push(bl.id);
  return bl;
}

async function addCategory(brainliftId: number, name: string, sortOrder: number | null = null) {
  const [cat] = await db.insert(categories).values({
    brainliftId,
    name,
    sortOrder,
  }).returning();
  return cat;
}

async function addSource(brainliftId: number, categoryId: number, suffix: string) {
  const [src] = await db.insert(sources).values({
    brainliftId,
    title: `Source ${suffix}`,
    url: `https://example.com/${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    author: 'Author',
    categoryId,
  }).returning();
  return src;
}

async function addNote(brainliftId: number, categoryId: number | null, content: string) {
  const [n] = await db.insert(notes).values({
    brainliftId,
    categoryId,
    sourceId: null,
    content,
  }).returning();
  return n;
}

// ───────────────────────────── FR1 ──────────────────────────────────────────

describe('FR1: getCategoriesWithCountsForSecondBrain', () => {
  it('is exported from the storage module and from the facade', () => {
    expect(typeof getCategoriesWithCountsForSecondBrain).toBe('function');
    expect(typeof storage.getCategoriesWithCountsForSecondBrain).toBe('function');
  });

  it('returns one row per category with sourceCount and noteCount', async () => {
    const bl = await createBrainlift('counts');
    const cat1 = await addCategory(bl.id, 'Alpha', 0);
    const cat2 = await addCategory(bl.id, 'Beta', 1);

    await addSource(bl.id, cat1.id, 'a1');
    await addSource(bl.id, cat1.id, 'a2');
    await addSource(bl.id, cat2.id, 'b1');

    await addNote(bl.id, cat1.id, 'note alpha');
    await addNote(bl.id, cat2.id, 'note beta 1');
    await addNote(bl.id, cat2.id, 'note beta 2');

    const rows = await getCategoriesWithCountsForSecondBrain(bl.id);

    expect(rows).toHaveLength(2);
    const alpha = rows.find((r) => r.id === cat1.id)!;
    const beta = rows.find((r) => r.id === cat2.id)!;
    expect(alpha).toMatchObject({ id: cat1.id, name: 'Alpha', sortOrder: 0, sourceCount: 2, noteCount: 1 });
    expect(beta).toMatchObject({ id: cat2.id, name: 'Beta', sortOrder: 1, sourceCount: 1, noteCount: 2 });
  });

  it('includes categories with zero sources and zero notes (counts both 0, not omitted)', async () => {
    const bl = await createBrainlift('zeroes');
    const empty = await addCategory(bl.id, 'Empty', 0);

    const rows = await getCategoriesWithCountsForSecondBrain(bl.id);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: empty.id, sourceCount: 0, noteCount: 0 });
  });

  it('does not count notes whose categoryId is null toward any category', async () => {
    const bl = await createBrainlift('null-note');
    const cat = await addCategory(bl.id, 'Stuff', 0);

    await addNote(bl.id, cat.id, 'linked');
    await addNote(bl.id, null, 'orphan 1');
    await addNote(bl.id, null, 'orphan 2');

    const rows = await getCategoriesWithCountsForSecondBrain(bl.id);
    const stuff = rows.find((r) => r.id === cat.id)!;
    expect(stuff.noteCount).toBe(1);
  });

  it('orders results by sort_order ASC NULLS LAST, then name ASC', async () => {
    const bl = await createBrainlift('ordering');
    await addCategory(bl.id, 'Zebra', 0);
    await addCategory(bl.id, 'Charlie', null);
    await addCategory(bl.id, 'Apple', 5);
    await addCategory(bl.id, 'Bravo', null);

    const rows = await getCategoriesWithCountsForSecondBrain(bl.id);
    expect(rows.map((r) => r.name)).toEqual(['Zebra', 'Apple', 'Bravo', 'Charlie']);
  });

  it('isolates results to the requested brainlift', async () => {
    const blA = await createBrainlift('iso-a');
    const blB = await createBrainlift('iso-b', OTHER_USER_ID);
    await addCategory(blA.id, 'Mine', 0);
    await addCategory(blB.id, 'Theirs', 0);

    const rows = await getCategoriesWithCountsForSecondBrain(blA.id);
    expect(rows.map((r) => r.name)).toEqual(['Mine']);
  });
});

// ───────────────────────────── FR2 ──────────────────────────────────────────

describe('FR2: reorderCategories', () => {
  it('is exported from the storage module and from the facade', () => {
    expect(typeof reorderCategories).toBe('function');
    expect(typeof storage.reorderCategories).toBe('function');
  });

  it('rewrites every passed category sort_order to its index in the list', async () => {
    const bl = await createBrainlift('reorder-happy');
    const c1 = await addCategory(bl.id, 'One', 99);
    const c2 = await addCategory(bl.id, 'Two', 88);
    const c3 = await addCategory(bl.id, 'Three', 77);

    await reorderCategories(bl.id, [c3.id, c1.id, c2.id]);

    const stored = await db.select().from(categories)
      .where(eq(categories.brainliftId, bl.id))
      .orderBy(asc(categories.sortOrder));
    const map = new Map(stored.map((r) => [r.id, r.sortOrder]));
    expect(map.get(c3.id)).toBe(0);
    expect(map.get(c1.id)).toBe(1);
    expect(map.get(c2.id)).toBe(2);
  });

  it('throws BadRequestError when orderedIds length does not match the brainlift category count', async () => {
    const bl = await createBrainlift('reorder-length');
    const c1 = await addCategory(bl.id, 'One', 0);
    await addCategory(bl.id, 'Two', 1);

    await expect(reorderCategories(bl.id, [c1.id])).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequestError when orderedIds contains duplicate ids', async () => {
    const bl = await createBrainlift('reorder-dupes');
    const c1 = await addCategory(bl.id, 'One', 0);
    const c2 = await addCategory(bl.id, 'Two', 1);

    await expect(reorderCategories(bl.id, [c1.id, c1.id])).rejects.toBeInstanceOf(BadRequestError);

    // Original sort_order untouched.
    const stored = await db.select().from(categories)
      .where(eq(categories.brainliftId, bl.id));
    const map = new Map(stored.map((r) => [r.id, r.sortOrder]));
    expect(map.get(c1.id)).toBe(0);
    expect(map.get(c2.id)).toBe(1);
  });

  it('throws NotFoundError when any id belongs to another brainlift, and does not mutate either brainlift', async () => {
    const blA = await createBrainlift('reorder-iso-a');
    const blB = await createBrainlift('reorder-iso-b', OTHER_USER_ID);
    const a1 = await addCategory(blA.id, 'A1', 0);
    const a2 = await addCategory(blA.id, 'A2', 1);
    const foreign = await addCategory(blB.id, 'Foreign', 7);

    await expect(reorderCategories(blA.id, [a1.id, foreign.id])).rejects.toBeInstanceOf(NotFoundError);

    const blAStored = await db.select().from(categories)
      .where(eq(categories.brainliftId, blA.id));
    const aMap = new Map(blAStored.map((r) => [r.id, r.sortOrder]));
    expect(aMap.get(a1.id)).toBe(0);
    expect(aMap.get(a2.id)).toBe(1);

    const blBStored = await db.select().from(categories)
      .where(eq(categories.brainliftId, blB.id));
    expect(blBStored.find((r) => r.id === foreign.id)?.sortOrder).toBe(7);
  });

  it('does not modify categories of other brainlifts on happy path', async () => {
    const blA = await createBrainlift('reorder-leak-a');
    const blB = await createBrainlift('reorder-leak-b', OTHER_USER_ID);
    const a1 = await addCategory(blA.id, 'A1', 0);
    const a2 = await addCategory(blA.id, 'A2', 1);
    const b1 = await addCategory(blB.id, 'B1', 42);

    await reorderCategories(blA.id, [a2.id, a1.id]);

    const bStored = await db.select().from(categories).where(eq(categories.id, b1.id));
    expect(bStored[0].sortOrder).toBe(42);
  });
});
