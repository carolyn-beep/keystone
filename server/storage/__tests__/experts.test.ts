import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { brainlifts, experts, user } from '@shared/schema';
import {
  createExpertsForBrainlift,
  deleteExpertForBrainlift,
  getExpertsByBrainliftId,
  saveExperts,
  updateExpertRankings,
} from '../experts';

const TEST_USER_ID = `test-experts-${Date.now()}`;
const createdBrainliftIds: number[] = [];

function nextSlug(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestBrainlift(slugPrefix: string): Promise<number> {
  const [brainlift] = await db.insert(brainlifts).values({
    slug: nextSlug(slugPrefix),
    title: 'Experts Test Brainlift',
    description: 'Brainlift for expert storage tests',
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
    name: 'Expert Storage Test User',
    email: `expert-storage-${Date.now()}@test.com`,
    emailVerified: false,
  });
});

afterAll(async () => {
  for (const brainliftId of createdBrainliftIds) {
    await db.delete(experts).where(eq(experts.brainliftId, brainliftId)).catch(() => {});
    await db.delete(brainlifts).where(eq(brainlifts.id, brainliftId)).catch(() => {});
  }
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('expert storage', () => {
  it('saveExperts persists structured fields and keeps ranked experts ahead of null ranks', async () => {
    const brainliftId = await createTestBrainlift('save-experts');

    const saved = await saveExperts(brainliftId, [
      {
        brainliftId,
        name: 'Unranked Expert',
        who: 'Unranked researcher',
        why: 'Worth tracking',
        focus: 'Edge cases',
        where: '@unranked',
        rankScore: null,
        rationale: null,
        source: 'listed',
        twitterHandle: '@unranked',
        isFollowing: true,
      },
      {
        brainliftId,
        name: 'Ranked Expert',
        who: 'Ranked researcher',
        why: 'Frequently cited',
        focus: 'Core topic',
        where: '@ranked',
        rankScore: 8,
        rationale: '8 citations',
        source: 'listed',
        twitterHandle: '@ranked',
        isFollowing: true,
      },
    ]);

    expect(saved[0].name).toBe('Ranked Expert');
    expect(saved[1].name).toBe('Unranked Expert');
    expect(saved[0].who).toBe('Ranked researcher');
    expect(saved[0].why).toBe('Frequently cited');
    expect(saved[0].focus).toBe('Core topic');
    expect(saved[0].where).toBe('@ranked');
  });

  it('creates manual experts, derives handles, reranks in place, and supports delete', async () => {
    const brainliftId = await createTestBrainlift('manual-experts');

    const created = await createExpertsForBrainlift(brainliftId, [
      {
        name: 'Handle Expert',
        who: 'Analyst',
        why: 'Relevant to the topic',
        focus: 'Policy',
        where: '@handleexpert',
      },
      {
        name: 'Url Expert',
        who: 'Reporter',
        why: 'Breaks news in the space',
        where: 'https://x.com/urlexpert',
      },
    ]);

    expect(created).toHaveLength(2);
    expect(created[0].twitterHandle).toBe('@handleexpert');
    expect(created[1].twitterHandle).toBe('@urlexpert');
    expect(created[0].rankScore).toBeNull();

    await updateExpertRankings(brainliftId, [
      { expertId: created[1].id, rankScore: 9, rationale: '9 citations' },
      { expertId: created[0].id, rankScore: null, rationale: null },
    ]);

    const listed = await getExpertsByBrainliftId(brainliftId);
    expect(listed[0].id).toBe(created[1].id);
    expect(listed[0].rankScore).toBe(9);
    expect(listed[1].id).toBe(created[0].id);
    expect(listed[1].rankScore).toBeNull();

    await expect(deleteExpertForBrainlift(created[0].id, brainliftId)).resolves.toBe(true);
    const remaining = await getExpertsByBrainliftId(brainliftId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(created[1].id);
  });
});
