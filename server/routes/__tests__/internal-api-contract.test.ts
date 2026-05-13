import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  dok2FactRelations,
  dok2Points,
  dok2Summaries,
  dok3InsightLinks,
  dok3Insights,
  dok4Dok3Links,
  dok4Spovs,
  experts,
  facts,
  user,
} from '@shared/schema';
import { internalBrainliftDetailHandler } from '../internal';

const TEST_USER_ID = `internal-detail-user-${Date.now()}`;
const TEST_SLUG = `internal-detail-${Date.now()}`;

let brainliftId: number;
let factIds: number[] = [];
let dok2Ids: number[] = [];
let dok3Ids: number[] = [];
let dok4Ids: number[] = [];

function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    authContext: { userId: TEST_USER_ID, role: 'user', isAdmin: false },
    query: {},
    params: { slug: TEST_SLUG },
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Internal Detail Contract User',
    email: `${TEST_USER_ID}@test.com`,
    emailVerified: false,
  });

  const [brainlift] = await db.insert(brainlifts).values({
    slug: TEST_SLUG,
    title: 'Internal Detail Contract BrainLift',
    description: 'Description fallback purpose',
    displayPurpose: 'Contract purpose',
    author: 'Contract Author',
    createdByUserId: TEST_USER_ID,
    originalContent: 'Original content must stay private',
    summary: {
      totalFacts: 3,
      meanScore: '4',
      score5Count: 1,
      contradictionCount: 0,
    },
    importStatus: 'complete',
  }).returning();
  brainliftId = brainlift.id;

  await db.insert(experts).values([
    {
      brainliftId,
      name: 'Ranked Expert',
      who: 'Scientist',
      why: 'Relevant',
      focus: 'Evidence',
      where: '@ranked',
      rankScore: 9,
      rationale: 'Top source',
      source: 'listed',
      twitterHandle: '@ranked',
      isFollowing: true,
    },
    {
      brainliftId,
      name: 'Second Expert',
      who: 'Analyst',
      why: 'Context',
      source: 'listed',
      isFollowing: false,
    },
  ]);

  const insertedFacts = await db.insert(facts).values([
    {
      brainliftId,
      originalId: '1.1',
      category: 'Category A',
      source: 'Source A',
      fact: 'First normalized fact',
      score: 5,
      note: 'Strong',
      gradingStatus: 'graded',
      isGradeable: true,
    },
    {
      brainliftId,
      originalId: '1.2',
      category: 'Category A',
      source: 'Source B',
      fact: 'Second normalized fact',
      score: 3,
      note: 'Needs detail',
      gradingStatus: 'regrading',
      isGradeable: true,
    },
    {
      brainliftId,
      originalId: '1.3',
      category: 'Category B',
      source: 'Source C',
      fact: 'Third normalized fact',
      score: 0,
      note: null,
      gradingStatus: 'grading',
      isGradeable: false,
    },
  ]).returning({ id: facts.id });
  factIds = insertedFacts.map((row) => row.id);

  const insertedDok2 = await db.insert(dok2Summaries).values([
    {
      brainliftId,
      category: 'Category A',
      sourceName: 'Source A',
      sourceUrl: 'https://example.com/a',
      displayTitle: 'Synthesis A',
      grade: 4,
      feedback: 'Good synthesis',
      gradingStatus: 'graded',
    },
    {
      brainliftId,
      category: 'Category B',
      sourceName: 'Source B',
      sourceUrl: null,
      displayTitle: null,
      grade: null,
      feedback: null,
      gradingStatus: 'grading',
    },
  ]).returning({ id: dok2Summaries.id });
  dok2Ids = insertedDok2.map((row) => row.id);

  await db.insert(dok2Points).values([
    { summaryId: dok2Ids[0], text: 'Synthesis A point 1', sortOrder: 0 },
    { summaryId: dok2Ids[0], text: 'Synthesis A point 2', sortOrder: 1 },
    { summaryId: dok2Ids[1], text: 'Synthesis B point 1', sortOrder: 0 },
  ]);
  await db.insert(dok2FactRelations).values([
    { summaryId: dok2Ids[0], factId: factIds[0] },
    { summaryId: dok2Ids[0], factId: factIds[1] },
    { summaryId: dok2Ids[1], factId: factIds[2] },
  ]);

  const insertedDok3 = await db.insert(dok3Insights).values([
    {
      brainliftId,
      text: 'Linked DOK3 insight',
      status: 'linked',
      frameworkName: 'Framework',
      frameworkDescription: 'Framework description',
    },
    {
      brainliftId,
      text: 'Scratchpadded DOK3 insight',
      status: 'scratchpadded',
    },
    {
      brainliftId,
      text: 'Graded DOK3 insight',
      status: 'graded',
      score: 5,
      rationale: 'High quality',
      feedback: 'Keep it',
      criteriaBreakdown: { C1: { assessment: 'strong', evidence: 'Seeded' } },
    },
  ]).returning({ id: dok3Insights.id });
  dok3Ids = insertedDok3.map((row) => row.id);

  await db.insert(dok3InsightLinks).values([
    { insightId: dok3Ids[0], dok2SummaryId: dok2Ids[0] },
    { insightId: dok3Ids[2], dok2SummaryId: dok2Ids[0] },
    { insightId: dok3Ids[2], dok2SummaryId: dok2Ids[1] },
  ]);

  const insertedDok4 = await db.insert(dok4Spovs).values([
    {
      brainliftId,
      text: 'Linked DOK4 SPOV',
      status: 'linked',
    },
    {
      brainliftId,
      text: 'Rejected DOK4 SPOV',
      status: 'rejected',
      rejectionReason: 'Not sufficiently contested',
      rejectionCategory: 'not_spiky',
    },
    {
      brainliftId,
      text: 'Graded DOK4 SPOV',
      status: 'graded',
      score: 4,
      rationale: 'Distinct position',
      feedback: 'Sharper evidence would help',
      criteriaBreakdown: { S1: { assessment: 'strong', evidence: 'Seeded' } },
      positionSummary: 'A concise position',
    },
  ]).returning({ id: dok4Spovs.id });
  dok4Ids = insertedDok4.map((row) => row.id);

  await db.insert(dok4Dok3Links).values([
    { spovId: dok4Ids[0], dok3InsightId: dok3Ids[0], isPrimary: true },
    { spovId: dok4Ids[2], dok3InsightId: dok3Ids[2], isPrimary: true },
  ]);
});

afterAll(async () => {
  if (dok4Ids.length > 0) {
    await db.delete(dok4Dok3Links).where(inArray(dok4Dok3Links.spovId, dok4Ids)).catch(() => {});
  }
  if (dok4Ids.length > 0) {
    await db.delete(dok4Spovs).where(inArray(dok4Spovs.id, dok4Ids)).catch(() => {});
  }
  if (dok3Ids.length > 0) {
    await db.delete(dok3InsightLinks).where(inArray(dok3InsightLinks.insightId, dok3Ids)).catch(() => {});
  }
  if (dok3Ids.length > 0) {
    await db.delete(dok3Insights).where(inArray(dok3Insights.id, dok3Ids)).catch(() => {});
  }
  if (dok2Ids.length > 0) {
    await db.delete(dok2FactRelations).where(inArray(dok2FactRelations.summaryId, dok2Ids)).catch(() => {});
    await db.delete(dok2Points).where(inArray(dok2Points.summaryId, dok2Ids)).catch(() => {});
    await db.delete(dok2Summaries).where(inArray(dok2Summaries.id, dok2Ids)).catch(() => {});
  }
  if (factIds.length > 0) {
    await db.delete(facts).where(inArray(facts.id, factIds)).catch(() => {});
  }
  if (brainliftId) {
    await db.delete(experts).where(eq(experts.brainliftId, brainliftId)).catch(() => {});
    await db.delete(brainlifts).where(eq(brainlifts.id, brainliftId)).catch(() => {});
  }
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('GET /api/internal/brainlifts/:slug contract against real DB', () => {
  it('returns the canonical normalized detail without grading by default', async () => {
    const req = createMockReq();
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const response = res.json.mock.calls[0][0];
    expect(Object.keys(response).sort()).toEqual([
      'author',
      'createdAt',
      'dok1',
      'dok2',
      'dok3',
      'dok4',
      'experts',
      'id',
      'purpose',
      'slug',
      'title',
    ].sort());
    expect(response.slug).toBe(TEST_SLUG);
    expect(response.purpose).toBe('Contract purpose');
    expect(response).not.toHaveProperty('originalContent');
    expect(response).not.toHaveProperty('classification');
    expect(response.experts).toHaveLength(2);
    expect(response.dok1).toHaveLength(3);
    expect(response.dok2).toHaveLength(2);
    expect(response.dok3.map((item: any) => item.status).sort()).toEqual(['graded', 'linked', 'scratchpadded']);
    expect(response.dok4.map((item: any) => item.status).sort()).toEqual(['graded', 'linked', 'rejected']);
    expect(response.dok2[0].linkedDok1Ids).toEqual(expect.arrayContaining([factIds[0], factIds[1]]));
    expect(response.dok3.find((item: any) => item.status === 'scratchpadded')).toBeDefined();
    expect(response.dok4.find((item: any) => item.status === 'rejected')).toBeDefined();
    for (const collection of [response.dok1, response.dok2, response.dok3, response.dok4]) {
      for (const item of collection) {
        expect(item).not.toHaveProperty('grading');
      }
    }
  });

  it('returns nested grading for every DOK item when include=grading', async () => {
    const req = createMockReq({ query: { include: 'grading' } });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.dok1.every((item: any) => Object.hasOwn(item, 'grading'))).toBe(true);
    expect(response.dok2.every((item: any) => Object.hasOwn(item, 'grading'))).toBe(true);
    expect(response.dok3.every((item: any) => Object.hasOwn(item, 'grading'))).toBe(true);
    expect(response.dok4.every((item: any) => Object.hasOwn(item, 'grading'))).toBe(true);
    expect(response.dok3.find((item: any) => item.status === 'graded').grading.score).toBe(5);
    expect(response.dok3.find((item: any) => item.status === 'scratchpadded').grading).toBeNull();
    expect(response.dok4.find((item: any) => item.status === 'rejected').grading).toMatchObject({
      rejectionReason: 'Not sufficiently contested',
      rejectionCategory: 'not_spiky',
    });
    expect(response.dok4.find((item: any) => item.status === 'linked').grading).toBeNull();
  });

  it('returns 400 before reading storage for unknown include values', async () => {
    const req = createMockReq({ query: { include: 'grading,unknownvalue' } });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unknown include value: unknownvalue' });
  });
});
