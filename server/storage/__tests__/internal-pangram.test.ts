/**
 * Tests for FR6: getAssessmentDOK2 / DOK3 / DOK4 surface `aiWritingSignal`.
 *
 * Integration tests against local Docker Postgres.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  dok2Points,
  dok2Summaries,
  dok3Insights,
  dok4Spovs,
  pangramAssessments,
  user,
} from '@shared/schema';
import {
  getAssessmentDOK2,
  getAssessmentDOK3,
  getAssessmentDOK4,
} from '../internal';
import { pangramAssessmentsStorage } from '../pangramAssessments';
import type { PangramResponse } from '../../ai/pangram/types';

const TEST_USER_ID = `test-internal-pangram-${Date.now()}`;
let BRAINLIFT_ID = 0;
let SUM_DONE_ID = 0;
let SUM_NO_ROW_ID = 0;
let INSIGHT_DONE_ID = 0;
let INSIGHT_ANALYZING_ID = 0;
let SPOV_HUMAN_ID = 0;
let SPOV_NO_ROW_ID = 0;

const FIXTURE_AI_ASSISTED: PangramResponse = {
  text: 'mostly assisted',
  version: '3.0',
  prediction_short: 'AI-Assisted',
  fraction_ai: 0.1,
  fraction_ai_assisted: 0.7,
  fraction_human: 0.2,
  num_ai_segments: 1,
  num_ai_assisted_segments: 1,
  num_human_segments: 0,
  headline: 'Likely AI-Assisted',
  prediction: 'mostly assisted',
  windows: [],
};

const FIXTURE_HUMAN: PangramResponse = {
  text: 'human voice throughout',
  version: '3.0',
  prediction_short: 'Human',
  fraction_ai: 0.0,
  fraction_ai_assisted: 0.05,
  fraction_human: 0.95,
  num_ai_segments: 0,
  num_ai_assisted_segments: 0,
  num_human_segments: 1,
  headline: 'Likely Human',
  prediction: 'human voice throughout',
  windows: [],
};

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Internal Pangram Test User',
    email: `internal-pangram-${Date.now()}@test.com`,
    emailVerified: false,
  });
  const [bl] = await db
    .insert(brainlifts)
    .values({
      slug: `internal-pangram-test-${Date.now()}`,
      title: 'Internal',
      description: 'fixture',
      summary: { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      createdByUserId: TEST_USER_ID,
    })
    .returning();
  BRAINLIFT_ID = bl.id;

  // DOK2 fixtures
  const [sumDone] = await db
    .insert(dok2Summaries)
    .values({ brainliftId: BRAINLIFT_ID, sourceName: 'Src done' })
    .returning();
  SUM_DONE_ID = sumDone.id;
  await db.insert(dok2Points).values({ summaryId: SUM_DONE_ID, text: 'point', sortOrder: 1 });

  const [sumNoRow] = await db
    .insert(dok2Summaries)
    .values({ brainliftId: BRAINLIFT_ID, sourceName: 'Src none' })
    .returning();
  SUM_NO_ROW_ID = sumNoRow.id;

  // DOK3 fixtures
  const [insDone] = await db
    .insert(dok3Insights)
    .values({ brainliftId: BRAINLIFT_ID, text: 'insight done' })
    .returning();
  INSIGHT_DONE_ID = insDone.id;

  const [insAnalyzing] = await db
    .insert(dok3Insights)
    .values({ brainliftId: BRAINLIFT_ID, text: 'insight analyzing' })
    .returning();
  INSIGHT_ANALYZING_ID = insAnalyzing.id;

  // DOK4 fixtures
  const [spovHuman] = await db
    .insert(dok4Spovs)
    .values({ brainliftId: BRAINLIFT_ID, text: 'spov human' })
    .returning();
  SPOV_HUMAN_ID = spovHuman.id;

  const [spovNoRow] = await db
    .insert(dok4Spovs)
    .values({ brainliftId: BRAINLIFT_ID, text: 'spov none' })
    .returning();
  SPOV_NO_ROW_ID = spovNoRow.id;
});

afterAll(async () => {
  await db.delete(pangramAssessments).where(eq(pangramAssessments.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, SUM_DONE_ID)).catch(() => {});
  await db.delete(dok2Summaries).where(eq(dok2Summaries.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(dok3Insights).where(eq(dok3Insights.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(dok4Spovs).where(eq(dok4Spovs.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(brainlifts).where(eq(brainlifts.id, BRAINLIFT_ID)).catch(() => {});
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

beforeEach(async () => {
  // Reset pangram rows between tests to avoid cross-contamination.
  await db.delete(pangramAssessments).where(eq(pangramAssessments.brainliftId, BRAINLIFT_ID));
});

describe('getAssessmentDOK2 -- aiWritingSignal', () => {
  it('returns the lowercase label when a done row exists', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing('dok2_summary', SUM_DONE_ID, BRAINLIFT_ID, 'h');
    await pangramAssessmentsStorage.markDone('dok2_summary', SUM_DONE_ID, FIXTURE_AI_ASSISTED);

    const { items } = await getAssessmentDOK2(BRAINLIFT_ID, 0, 100);
    const done = items.find((i) => i.id === SUM_DONE_ID);
    const noRow = items.find((i) => i.id === SUM_NO_ROW_ID);
    expect(done.aiWritingSignal).toBe('ai-assisted');
    expect(noRow.aiWritingSignal).toBeNull();
  });
});

describe('getAssessmentDOK3 -- aiWritingSignal', () => {
  it('returns label for done rows, null for analyzing / missing rows', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing('dok3_insight', INSIGHT_DONE_ID, BRAINLIFT_ID, 'h');
    await pangramAssessmentsStorage.markDone('dok3_insight', INSIGHT_DONE_ID, FIXTURE_AI_ASSISTED);
    await pangramAssessmentsStorage.upsertAnalyzing('dok3_insight', INSIGHT_ANALYZING_ID, BRAINLIFT_ID, 'h2');

    const summary = await getAssessmentDOK3(BRAINLIFT_ID, 0, 100, 'summary');
    const full = await getAssessmentDOK3(BRAINLIFT_ID, 0, 100, 'full');

    for (const items of [summary.items, full.items]) {
      const done = items.find((i: any) => i.id === INSIGHT_DONE_ID);
      const analyzing = items.find((i: any) => i.id === INSIGHT_ANALYZING_ID);
      expect(done.aiWritingSignal).toBe('ai-assisted');
      expect(analyzing.aiWritingSignal).toBeNull();
    }
  });
});

describe('getAssessmentDOK4 -- aiWritingSignal', () => {
  it('returns label for done rows in both summary and full detail modes', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing('dok4_spov', SPOV_HUMAN_ID, BRAINLIFT_ID, 'h');
    await pangramAssessmentsStorage.markDone('dok4_spov', SPOV_HUMAN_ID, FIXTURE_HUMAN);

    const summary = await getAssessmentDOK4(BRAINLIFT_ID, 0, 100, 'summary');
    const full = await getAssessmentDOK4(BRAINLIFT_ID, 0, 100, 'full');

    for (const items of [summary.items, full.items]) {
      const human = items.find((i: any) => i.id === SPOV_HUMAN_ID);
      const noRow = items.find((i: any) => i.id === SPOV_NO_ROW_ID);
      expect(human.aiWritingSignal).toBe('human');
      expect(noRow.aiWritingSignal).toBeNull();
    }
  });
});
