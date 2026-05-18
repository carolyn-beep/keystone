import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  contradictionClusters,
  dok2Summaries,
  experts,
  facts,
  user,
} from '@shared/schema';
import {
  createBlankBrainlift,
  deleteBrainlift,
  getBrainliftRecordBySlug,
  setBrainliftPhase,
} from '../brainlifts';

const TEST_USER_ID = `brainlift-record-owner-${Date.now()}`;
const createdBrainliftIds: number[] = [];

const DEFAULT_SUMMARY = {
  totalFacts: 1,
  meanScore: '4.0',
  score5Count: 0,
  contradictionCount: 1,
};

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    email: `${TEST_USER_ID}@example.com`,
    name: 'Brainlift Record Owner',
    emailVerified: false,
  });
});

afterAll(async () => {
  for (const id of createdBrainliftIds) {
    await deleteBrainlift(id).catch(() => {});
  }

  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

async function insertBrainliftWithAggregateRows(label: string) {
  const [brainlift] = await db
    .insert(brainlifts)
    .values({
      slug: `brainlift-record-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Brainlift Record ${label}`,
      description: 'A brainlift record lookup test fixture',
      displayPurpose: 'Record lookup',
      author: 'Storage Test',
      summary: DEFAULT_SUMMARY,
      createdByUserId: TEST_USER_ID,
      sourceType: 'test',
    })
    .returning();

  createdBrainliftIds.push(brainlift.id);

  await db.insert(facts).values({
    brainliftId: brainlift.id,
    originalId: '1.1',
    category: 'Testing',
    source: 'Fixture',
    fact: 'The aggregate row exists for test coverage.',
    summary: 'Aggregate row exists.',
    score: 4,
    contradicts: null,
    note: null,
  });

  await db.insert(contradictionClusters).values({
    brainliftId: brainlift.id,
    name: 'Fixture Cluster',
    tension: 'Lookup should not include this cluster.',
    status: 'open',
    factIds: ['1.1'],
    claims: ['claim'],
  });

  await db.insert(experts).values({
    brainliftId: brainlift.id,
    name: 'Fixture Expert',
    who: 'Test fixture',
    why: 'Ensures experts are not included',
    focus: 'Storage',
    where: 'Tests',
    source: 'listed',
  });

  await db.insert(dok2Summaries).values({
    brainliftId: brainlift.id,
    category: 'Testing',
    sourceName: 'Fixture Source',
    sourceUrl: 'https://example.com/source',
    displayTitle: 'Fixture Summary',
  });

  return brainlift;
}

describe('getBrainliftRecordBySlug', () => {
  it('returns the brainlifts row for an existing slug (FR1)', async () => {
    const inserted = await insertBrainliftWithAggregateRows('happy-path');

    const record = await getBrainliftRecordBySlug(inserted.slug);

    expect(record).toMatchObject({
      id: inserted.id,
      slug: inserted.slug,
      title: inserted.title,
      createdByUserId: TEST_USER_ID,
    });
    expect(record?.description).toBe(inserted.description);
    expect(record?.displayPurpose).toBe(inserted.displayPurpose);
  });

  it('returns undefined for an unknown slug (FR1)', async () => {
    await expect(getBrainliftRecordBySlug(`missing-${Date.now()}`)).resolves.toBeUndefined();
  });

  it('does not attach aggregate-only properties to the row result (FR1)', async () => {
    const inserted = await insertBrainliftWithAggregateRows('row-only');

    const record = await getBrainliftRecordBySlug(inserted.slug);

    expect(record).toBeDefined();
    expect(record).not.toHaveProperty('facts');
    expect(record).not.toHaveProperty('experts');
    expect(record).not.toHaveProperty('contradictionClusters');
    expect(record).not.toHaveProperty('dok2Summaries');
  });
});

describe('research-first brainlift storage helpers', () => {
  it('createBlankBrainlift creates a research brainlift with zeroed summary and empty description (FR4)', async () => {
    const brainlift = await createBlankBrainlift({
      userId: TEST_USER_ID,
      title: 'Research Project Fixture',
    });
    createdBrainliftIds.push(brainlift.id);

    expect(brainlift).toMatchObject({
      title: 'Research Project Fixture',
      description: '',
      phase: 'research',
      createdByUserId: TEST_USER_ID,
      summary: {
        totalFacts: 0,
        meanScore: '0',
        score5Count: 0,
        contradictionCount: 0,
      },
    });
    expect(brainlift.slug).toMatch(/^research-project-fixture/);
  });

  it('createBlankBrainlift retries slug collisions and keeps existing inserts defaulting to authoring (FR4)', async () => {
    const title = `Collision Fixture ${Date.now()}`;
    const expectedBaseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const first = await createBlankBrainlift({
      userId: TEST_USER_ID,
      title,
      description: 'First',
    });
    const second = await createBlankBrainlift({
      userId: TEST_USER_ID,
      title,
      description: 'Second',
    });
    createdBrainliftIds.push(first.id, second.id);

    expect(first.slug).toBe(expectedBaseSlug);
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug).toMatch(new RegExp(`^${expectedBaseSlug}-`));

    const [legacy] = await db.insert(brainlifts).values({
      slug: `legacy-authoring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: 'Legacy Authoring Default',
      description: 'Existing insert path',
      summary: DEFAULT_SUMMARY,
      createdByUserId: TEST_USER_ID,
    }).returning();
    createdBrainliftIds.push(legacy.id);

    expect(legacy.phase).toBe('authoring');
  });

  it('setBrainliftPhase updates the phase and returns the updated row (FR4)', async () => {
    const brainlift = await createBlankBrainlift({
      userId: TEST_USER_ID,
      title: 'Phase Toggle Fixture',
    });
    createdBrainliftIds.push(brainlift.id);

    const updated = await setBrainliftPhase(brainlift.id, 'authoring');

    expect(updated.id).toBe(brainlift.id);
    expect(updated.phase).toBe('authoring');
  });

  it('database rejects invalid phase values (FR1, FR4)', async () => {
    await expect(db.insert(brainlifts).values({
      slug: `invalid-phase-${Date.now()}`,
      title: 'Invalid Phase',
      description: 'Should fail',
      summary: DEFAULT_SUMMARY,
      createdByUserId: TEST_USER_ID,
      phase: 'invalid' as any,
    })).rejects.toMatchObject({ cause: { code: '23514' } });
  });
});
