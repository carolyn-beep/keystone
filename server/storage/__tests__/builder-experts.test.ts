/**
 * Tests for FR1: Builder Expert Storage Functions
 *
 * Tests storage functions against a real local database (Docker Postgres).
 * Uses beforeAll/afterAll for test isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { brainlifts, nativeBrainliftDetails, builderExperts, user } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { createNativeBrainlift } from '../native-brainlifts';
import {
  getBuilderExpertsByBrainliftId,
  createBuilderExpert,
  insertSuggestedExperts,
  updateBuilderExpertForBrainlift,
  dismissBuilderExpertForBrainlift,
  deleteBuilderExpertForBrainlift,
  countSavedBuilderExperts,
  clearPendingSuggestions,
} from '../builder-experts';

// Track created brainlift IDs for cleanup
const createdBrainliftIds: number[] = [];
const TEST_USER_ID = 'test-builder-experts-' + Date.now();

beforeAll(async () => {
  // Create a test user to satisfy FK constraint
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Builder Expert Test User',
    email: `builder-expert-test-${Date.now()}@test.com`,
    emailVerified: false,
  });
});

afterAll(async () => {
  for (const id of createdBrainliftIds) {
    await db.delete(builderExperts).where(eq(builderExperts.brainliftId, id)).catch(() => {});
    await db.delete(nativeBrainliftDetails).where(eq(nativeBrainliftDetails.brainliftId, id)).catch(() => {});
    await db.delete(brainlifts).where(eq(brainlifts.id, id)).catch(() => {});
  }
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('getBuilderExpertsByBrainliftId', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Get Experts Test Topic',
      purpose: 'A purpose for the get builder experts test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);

    // Insert some experts
    await db.insert(builderExperts).values([
      { brainliftId: testBrainliftId, name: 'Expert A', who: 'Researcher A', where: '@experta', origin: 'manual' as const, status: 'saved' as const },
      { brainliftId: testBrainliftId, name: 'Expert B', who: 'Researcher B', where: '@expertb', origin: 'suggested' as const, status: 'pending' as const },
    ]);
  });

  it('returns all builder experts for a brainlift ordered by createdAt', async () => {
    const experts = await getBuilderExpertsByBrainliftId(testBrainliftId);

    expect(experts).toHaveLength(2);
    expect(experts[0].name).toBe('Expert A');
    expect(experts[1].name).toBe('Expert B');
  });

  it('returns empty array for brainlift with no experts', async () => {
    const result = await createNativeBrainlift({
      topic: 'Empty Experts Test Topic',
      purpose: 'A purpose for the empty experts test',
      owner: null,
      userId: TEST_USER_ID,
    });
    createdBrainliftIds.push(result.brainlift.id);

    const experts = await getBuilderExpertsByBrainliftId(result.brainlift.id);
    expect(experts).toHaveLength(0);
  });
});

describe('createBuilderExpert', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Create Expert Test Topic',
      purpose: 'A purpose for the create expert test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('creates a manual saved expert with all fields', async () => {
    const expert = await createBuilderExpert({
      brainliftId: testBrainliftId,
      name: 'Manual Expert',
      who: 'AI Researcher',
      focus: 'Machine learning applications',
      why: 'Leading researcher in the field',
      where: '@manualexpert',
      origin: 'manual',
      status: 'saved',
    });

    expect(expert.id).toBeDefined();
    expect(expert.brainliftId).toBe(testBrainliftId);
    expect(expert.name).toBe('Manual Expert');
    expect(expert.who).toBe('AI Researcher');
    expect(expert.focus).toBe('Machine learning applications');
    expect(expert.why).toBe('Leading researcher in the field');
    expect(expert.where).toBe('@manualexpert');
    expect(expert.origin).toBe('manual');
    expect(expert.status).toBe('saved');
  });

  it('creates expert with null optional fields', async () => {
    const expert = await createBuilderExpert({
      brainliftId: testBrainliftId,
      name: 'Minimal Expert',
      who: 'Data Scientist',
      where: 'https://linkedin.com/in/minimal',
      origin: 'manual',
      status: 'saved',
    });

    expect(expert.focus).toBeNull();
    expect(expert.why).toBeNull();
  });
});

describe('insertSuggestedExperts', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Suggested Experts Test Topic',
      purpose: 'A purpose for the suggested experts test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('batch-inserts suggested experts with pending status', async () => {
    const suggestions = [
      { name: 'Suggested A', who: 'Expert in AI', focus: 'NLP', why: 'Pioneer in NLP', where: '@suggesteda' },
      { name: 'Suggested B', who: 'Expert in ML', focus: null, why: null, where: 'https://twitter.com/suggestedb' },
      { name: 'Suggested C', who: 'Expert in Data', where: 'https://x.com/suggestedc' },
    ];

    const inserted = await insertSuggestedExperts(testBrainliftId, suggestions);

    expect(inserted).toHaveLength(3);
    for (const expert of inserted) {
      expect(expert.brainliftId).toBe(testBrainliftId);
      expect(expert.origin).toBe('suggested');
      expect(expert.status).toBe('pending');
    }
    expect(inserted[0].focus).toBe('NLP');
    expect(inserted[1].focus).toBeNull();
  });
});

describe('updateBuilderExpertForBrainlift', () => {
  let testBrainliftId: number;
  let testExpertId: number;
  let otherBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Update Expert Test Topic',
      purpose: 'A purpose for the update expert test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);

    const [expert] = await db.insert(builderExperts).values({
      brainliftId: testBrainliftId,
      name: 'To Update',
      who: 'Researcher',
      where: '@toupdate',
      origin: 'suggested' as const,
      status: 'pending' as const,
    }).returning();
    testExpertId = expert.id;

    // Another brainlift for IDOR test
    const other = await createNativeBrainlift({
      topic: 'Other Brainlift Test Topic',
      purpose: 'A purpose for the other brainlift test',
      owner: null,
      userId: TEST_USER_ID,
    });
    otherBrainliftId = other.brainlift.id;
    createdBrainliftIds.push(otherBrainliftId);
  });

  it('updates fields on a matching expert', async () => {
    const updated = await updateBuilderExpertForBrainlift(testExpertId, testBrainliftId, {
      name: 'Updated Name',
      status: 'saved',
    });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.status).toBe('saved');
  });

  it('returns null for IDOR mismatch (wrong brainliftId)', async () => {
    const updated = await updateBuilderExpertForBrainlift(testExpertId, otherBrainliftId, {
      name: 'Should Not Work',
    });

    expect(updated).toBeNull();
  });

  it('returns null for non-existent expert', async () => {
    const updated = await updateBuilderExpertForBrainlift(99999, testBrainliftId, {
      name: 'Should Not Work',
    });

    expect(updated).toBeNull();
  });
});

describe('dismissBuilderExpertForBrainlift', () => {
  let testBrainliftId: number;
  let pendingExpertId: number;
  let otherBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Dismiss Expert Test Topic',
      purpose: 'A purpose for the dismiss expert test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);

    const [expert] = await db.insert(builderExperts).values({
      brainliftId: testBrainliftId,
      name: 'To Dismiss',
      who: 'Researcher',
      where: '@todismiss',
      origin: 'suggested' as const,
      status: 'pending' as const,
    }).returning();
    pendingExpertId = expert.id;

    const other = await createNativeBrainlift({
      topic: 'Other Dismiss Test Topic',
      purpose: 'A purpose for the other dismiss test',
      owner: null,
      userId: TEST_USER_ID,
    });
    otherBrainliftId = other.brainlift.id;
    createdBrainliftIds.push(otherBrainliftId);
  });

  it('dismisses a pending expert', async () => {
    const success = await dismissBuilderExpertForBrainlift(pendingExpertId, testBrainliftId);

    expect(success).toBe(true);

    const [row] = await db.select().from(builderExperts).where(eq(builderExperts.id, pendingExpertId));
    expect(row.status).toBe('dismissed');
  });

  it('returns false for IDOR mismatch', async () => {
    const [expert] = await db.insert(builderExperts).values({
      brainliftId: testBrainliftId,
      name: 'Another Pending',
      who: 'Researcher',
      where: '@anotherpending',
      origin: 'suggested' as const,
      status: 'pending' as const,
    }).returning();

    const success = await dismissBuilderExpertForBrainlift(expert.id, otherBrainliftId);
    expect(success).toBe(false);
  });

  it('returns false for non-existent expert', async () => {
    const success = await dismissBuilderExpertForBrainlift(99999, testBrainliftId);
    expect(success).toBe(false);
  });
});

describe('deleteBuilderExpertForBrainlift', () => {
  let testBrainliftId: number;
  let otherBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Delete Expert Test Topic',
      purpose: 'A purpose for the delete expert test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);

    const other = await createNativeBrainlift({
      topic: 'Other Delete Test Topic',
      purpose: 'A purpose for the other delete test',
      owner: null,
      userId: TEST_USER_ID,
    });
    otherBrainliftId = other.brainlift.id;
    createdBrainliftIds.push(otherBrainliftId);
  });

  it('deletes a builder expert', async () => {
    const [expert] = await db.insert(builderExperts).values({
      brainliftId: testBrainliftId,
      name: 'To Delete',
      who: 'Researcher',
      where: '@todelete',
      origin: 'manual' as const,
      status: 'saved' as const,
    }).returning();

    const success = await deleteBuilderExpertForBrainlift(expert.id, testBrainliftId);
    expect(success).toBe(true);

    const rows = await db.select().from(builderExperts).where(eq(builderExperts.id, expert.id));
    expect(rows).toHaveLength(0);
  });

  it('returns false for IDOR mismatch', async () => {
    const [expert] = await db.insert(builderExperts).values({
      brainliftId: testBrainliftId,
      name: 'Cannot Delete Cross',
      who: 'Researcher',
      where: '@cannotdelete',
      origin: 'manual' as const,
      status: 'saved' as const,
    }).returning();

    const success = await deleteBuilderExpertForBrainlift(expert.id, otherBrainliftId);
    expect(success).toBe(false);
  });

  it('returns false for non-existent expert', async () => {
    const success = await deleteBuilderExpertForBrainlift(99999, testBrainliftId);
    expect(success).toBe(false);
  });
});

describe('countSavedBuilderExperts', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Count Experts Test Topic',
      purpose: 'A purpose for the count experts test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);

    await db.insert(builderExperts).values([
      { brainliftId: testBrainliftId, name: 'Saved 1', who: 'R1', where: '@s1', origin: 'manual' as const, status: 'saved' as const },
      { brainliftId: testBrainliftId, name: 'Saved 2', who: 'R2', where: '@s2', origin: 'suggested' as const, status: 'saved' as const },
      { brainliftId: testBrainliftId, name: 'Pending', who: 'R3', where: '@p1', origin: 'suggested' as const, status: 'pending' as const },
      { brainliftId: testBrainliftId, name: 'Dismissed', who: 'R4', where: '@d1', origin: 'suggested' as const, status: 'dismissed' as const },
    ]);
  });

  it('counts only saved experts', async () => {
    const count = await countSavedBuilderExperts(testBrainliftId);
    expect(count).toBe(2);
  });

  it('returns 0 for brainlift with no saved experts', async () => {
    const result = await createNativeBrainlift({
      topic: 'No Saved Experts Test',
      purpose: 'A purpose for the no saved experts test',
      owner: null,
      userId: TEST_USER_ID,
    });
    createdBrainliftIds.push(result.brainlift.id);

    const count = await countSavedBuilderExperts(result.brainlift.id);
    expect(count).toBe(0);
  });
});

describe('clearPendingSuggestions', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Clear Suggestions Test Topic',
      purpose: 'A purpose for the clear suggestions test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('deletes only pending suggested experts', async () => {
    await db.insert(builderExperts).values([
      { brainliftId: testBrainliftId, name: 'Pending Suggested', who: 'R1', where: '@ps1', origin: 'suggested' as const, status: 'pending' as const },
      { brainliftId: testBrainliftId, name: 'Saved Suggested', who: 'R2', where: '@ss1', origin: 'suggested' as const, status: 'saved' as const },
      { brainliftId: testBrainliftId, name: 'Saved Manual', who: 'R3', where: '@sm1', origin: 'manual' as const, status: 'saved' as const },
      { brainliftId: testBrainliftId, name: 'Dismissed Suggested', who: 'R4', where: '@ds1', origin: 'suggested' as const, status: 'dismissed' as const },
    ]);

    const deleted = await clearPendingSuggestions(testBrainliftId);
    expect(deleted).toBe(1); // only the pending suggested one

    const remaining = await db.select().from(builderExperts).where(eq(builderExperts.brainliftId, testBrainliftId));
    expect(remaining).toHaveLength(3);
    expect(remaining.every(e => !(e.origin === 'suggested' && e.status === 'pending'))).toBe(true);
  });
});
