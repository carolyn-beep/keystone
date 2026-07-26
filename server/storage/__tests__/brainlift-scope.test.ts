/**
 * Tests for 01-scope-foundation FR2: scope + onboarding storage helpers.
 *
 * Runs against the real local database (Docker Postgres), following the
 * convention in native-brainlifts.test.ts / experts.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { brainlifts, user } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { updateBrainliftScope, updateOnboardingStep } from '../brainlifts';
import { NotFoundError } from '../../middleware/error-handler';

const TEST_USER_ID = 'test-scope-' + Date.now();
const createdBrainliftIds: number[] = [];

async function createTestBrainlift(): Promise<number> {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: `scope-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Scope Test Brainlift',
    description: 'Brainlift for scope storage tests',
    summary: {
      totalFacts: 0,
      meanScore: '0',
      score5Count: 0,
      contradictionCount: 0,
    },
    createdByUserId: TEST_USER_ID,
  }).returning();
  createdBrainliftIds.push(brainlift.id);
  return brainlift.id;
}

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Scope Test User',
    email: `scope-test-${Date.now()}@test.com`,
    emailVerified: false,
  });
});

afterAll(async () => {
  for (const id of createdBrainliftIds) {
    await db.delete(brainlifts).where(eq(brainlifts.id, id)).catch(() => {});
  }
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('brainlift scope defaults (FR1)', () => {
  it('new brainlift defaults to empty arrays (never NULL) and NULL onboardingStep', async () => {
    const id = await createTestBrainlift();
    const [row] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));

    expect(row.inScope).toEqual([]);
    expect(row.outOfScope).toEqual([]);
    expect(row.onboardingStep).toBeNull();
  });
});

describe('updateBrainliftScope (FR2)', () => {
  it('sets both arrays and reads back with order preserved', async () => {
    const id = await createTestBrainlift();

    const updated = await updateBrainliftScope(id, {
      inScope: ['battery chemistry', 'solid-state electrolytes', 'anode materials'],
      outOfScope: ['EV market analysis', 'mining policy'],
    });

    expect(updated.inScope).toEqual(['battery chemistry', 'solid-state electrolytes', 'anode materials']);
    expect(updated.outOfScope).toEqual(['EV market analysis', 'mining policy']);

    const [row] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));
    expect(row.inScope).toEqual(['battery chemistry', 'solid-state electrolytes', 'anode materials']);
    expect(row.outOfScope).toEqual(['EV market analysis', 'mining policy']);
  });

  it('patching only inScope leaves outOfScope untouched', async () => {
    const id = await createTestBrainlift();
    await updateBrainliftScope(id, { inScope: ['a'], outOfScope: ['b'] });

    const updated = await updateBrainliftScope(id, { inScope: ['c', 'd'] });

    expect(updated.inScope).toEqual(['c', 'd']);
    expect(updated.outOfScope).toEqual(['b']);
  });

  it('patching only outOfScope leaves inScope untouched', async () => {
    const id = await createTestBrainlift();
    await updateBrainliftScope(id, { inScope: ['a'], outOfScope: ['b'] });

    const updated = await updateBrainliftScope(id, { outOfScope: ['e'] });

    expect(updated.inScope).toEqual(['a']);
    expect(updated.outOfScope).toEqual(['e']);
  });

  it('empty array clears scope', async () => {
    const id = await createTestBrainlift();
    await updateBrainliftScope(id, { inScope: ['a', 'b'], outOfScope: ['c'] });

    const updated = await updateBrainliftScope(id, { inScope: [], outOfScope: [] });

    expect(updated.inScope).toEqual([]);
    expect(updated.outOfScope).toEqual([]);
  });

  it('trims entries, drops whitespace-only entries, and dedupes (first occurrence wins)', async () => {
    const id = await createTestBrainlift();

    const updated = await updateBrainliftScope(id, {
      inScope: ['  alpha  ', '', '   ', 'beta', 'alpha', 'beta '],
      outOfScope: ['gamma', ' gamma'],
    });

    expect(updated.inScope).toEqual(['alpha', 'beta']);
    expect(updated.outOfScope).toEqual(['gamma']);
  });

  it('throws NotFoundError for an unknown brainliftId', async () => {
    await expect(updateBrainliftScope(99999999, { inScope: ['x'] }))
      .rejects.toThrow(NotFoundError);
  });
});

describe('updateOnboardingStep (FR2)', () => {
  it('sets an integer step and clears back to NULL', async () => {
    const id = await createTestBrainlift();

    const stepped = await updateOnboardingStep(id, 3);
    expect(stepped.onboardingStep).toBe(3);

    const cleared = await updateOnboardingStep(id, null);
    expect(cleared.onboardingStep).toBeNull();
  });

  it('throws NotFoundError for an unknown brainliftId', async () => {
    await expect(updateOnboardingStep(99999999, 1))
      .rejects.toThrow(NotFoundError);
  });
});
