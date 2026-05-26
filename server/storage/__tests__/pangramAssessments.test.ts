/**
 * Tests for FR3: pangram_assessments storage module.
 *
 * Integration tests against the local Docker Postgres (`wizardly_kalam` /
 * `dok1grader_local`). Validates the migration end-to-end.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { brainlifts, pangramAssessments, user } from '@shared/schema';
import {
  pangramAssessmentsStorage,
  predictionShortToLabel,
} from '../pangramAssessments';
import type { PangramResponse } from '../../ai/pangram/types';

const TEST_USER_ID = `test-pangram-${Date.now()}`;
let TEST_BRAINLIFT_ID = 0;

const FIXTURE_RESPONSE: PangramResponse = {
  text: 'Sample window',
  version: '3.0',
  prediction_short: 'AI-Assisted',
  fraction_ai: 0.12,
  fraction_ai_assisted: 0.7,
  fraction_human: 0.18,
  num_ai_segments: 1,
  num_ai_assisted_segments: 2,
  num_human_segments: 3,
  dashboard_link: 'https://dashboard.example/result',
  headline: 'Likely AI-Assisted',
  prediction: 'Significant AI assistance detected',
  windows: [
    {
      text: 'Sample window',
      label: 'AI-Generated',
      ai_assistance_score: 0.9,
      confidence: 'High',
      start_index: 0,
      end_index: 13,
      word_count: 2,
      token_length: 4,
    },
  ],
};

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Pangram Storage Test User',
    email: `pangram-storage-${Date.now()}@test.com`,
    emailVerified: false,
  });
  const [brainlift] = await db
    .insert(brainlifts)
    .values({
      slug: `pangram-test-${Date.now()}`,
      title: 'Pangram Storage Test',
      description: 'fixture',
      summary: {
        totalFacts: 0,
        meanScore: '0',
        score5Count: 0,
        contradictionCount: 0,
      },
      createdByUserId: TEST_USER_ID,
    })
    .returning();
  TEST_BRAINLIFT_ID = brainlift.id;
});

afterAll(async () => {
  await db
    .delete(pangramAssessments)
    .where(eq(pangramAssessments.brainliftId, TEST_BRAINLIFT_ID))
    .catch(() => {});
  await db.delete(brainlifts).where(eq(brainlifts.id, TEST_BRAINLIFT_ID)).catch(() => {});
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

beforeEach(async () => {
  // Wipe rows for the test brainlift between tests for isolation
  await db
    .delete(pangramAssessments)
    .where(eq(pangramAssessments.brainliftId, TEST_BRAINLIFT_ID));
});

describe('predictionShortToLabel', () => {
  it('maps all 4 Pangram values to lowercase external labels', () => {
    expect(predictionShortToLabel('Human')).toBe('human');
    expect(predictionShortToLabel('AI-Assisted')).toBe('ai-assisted');
    expect(predictionShortToLabel('Mixed')).toBe('mixed');
    expect(predictionShortToLabel('AI')).toBe('ai');
  });

  // Type-level exhaustiveness is asserted by the `satisfies Record<...>` in
  // the implementation -- a new PangramPredictionShort value without a map
  // entry would fail typecheck before reaching this test.
});

describe('upsertAnalyzing', () => {
  it('inserts a new row with status=analyzing, correct hash, null error', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9001,
      TEST_BRAINLIFT_ID,
      'hash-abc',
    );

    const row = await pangramAssessmentsStorage.getByEntity('dok3_insight', 9001);
    expect(row).not.toBeNull();
    expect(row!.status).toBe('analyzing');
    expect(row!.textHash).toBe('hash-abc');
    expect(row!.errorMessage).toBeNull();
    expect(row!.brainliftId).toBe(TEST_BRAINLIFT_ID);
  });

  it('updates an existing row: refreshes text_hash, sets analyzing, clears error_message', async () => {
    // seed via markError pathway after an initial upsert
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9002,
      TEST_BRAINLIFT_ID,
      'old-hash',
    );
    await pangramAssessmentsStorage.markError('dok3_insight', 9002, 'boom');

    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9002,
      TEST_BRAINLIFT_ID,
      'new-hash',
    );

    const row = await pangramAssessmentsStorage.getByEntity('dok3_insight', 9002);
    expect(row!.status).toBe('analyzing');
    expect(row!.textHash).toBe('new-hash');
    expect(row!.errorMessage).toBeNull();
  });
});

describe('markDone', () => {
  it('writes all extracted Pangram fields + windows + analyzed_at, sets status=done', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok2_summary',
      9100,
      TEST_BRAINLIFT_ID,
      'hash-2',
    );
    await pangramAssessmentsStorage.markDone('dok2_summary', 9100, FIXTURE_RESPONSE);

    const row = await pangramAssessmentsStorage.getByEntity('dok2_summary', 9100);
    expect(row!.status).toBe('done');
    expect(row!.version).toBe('3.0');
    expect(row!.predictionShort).toBe('AI-Assisted');
    // numeric columns come back as strings via drizzle-orm
    expect(Number(row!.fractionAi)).toBeCloseTo(0.12);
    expect(Number(row!.fractionAiAssisted)).toBeCloseTo(0.7);
    expect(Number(row!.fractionHuman)).toBeCloseTo(0.18);
    expect(row!.numAiSegments).toBe(1);
    expect(row!.numAiAssistedSegments).toBe(2);
    expect(row!.numHumanSegments).toBe(3);
    expect(row!.dashboardLink).toBe('https://dashboard.example/result');
    expect(row!.headline).toBe('Likely AI-Assisted');
    expect(row!.prediction).toBe('Significant AI assistance detected');
    expect(row!.windows).toEqual(FIXTURE_RESPONSE.windows);
    expect(row!.analyzedAt).not.toBeNull();
    expect(row!.errorMessage).toBeNull();
  });
});

describe('markError', () => {
  it('sets status=error, sets error_message, NULLs prior result columns', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok4_spov',
      9200,
      TEST_BRAINLIFT_ID,
      'hash-3',
    );
    await pangramAssessmentsStorage.markDone('dok4_spov', 9200, FIXTURE_RESPONSE);

    await pangramAssessmentsStorage.markError(
      'dok4_spov',
      9200,
      'pangram 503 after 3 retries',
    );

    const row = await pangramAssessmentsStorage.getByEntity('dok4_spov', 9200);
    expect(row!.status).toBe('error');
    expect(row!.errorMessage).toBe('pangram 503 after 3 retries');
    expect(row!.predictionShort).toBeNull();
    expect(row!.fractionAi).toBeNull();
    expect(row!.fractionAiAssisted).toBeNull();
    expect(row!.fractionHuman).toBeNull();
    expect(row!.version).toBeNull();
    expect(row!.numAiSegments).toBeNull();
    expect(row!.numAiAssistedSegments).toBeNull();
    expect(row!.numHumanSegments).toBeNull();
    expect(row!.dashboardLink).toBeNull();
    expect(row!.headline).toBeNull();
    expect(row!.prediction).toBeNull();
    expect(row!.windows).toBeNull();
    expect(row!.analyzedAt).toBeNull();
  });
});

describe('getByEntity', () => {
  it('returns null when no row exists', async () => {
    const row = await pangramAssessmentsStorage.getByEntity('dok3_insight', 99999);
    expect(row).toBeNull();
  });

  it('returns the row when it exists', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9300,
      TEST_BRAINLIFT_ID,
      'hash-x',
    );
    const row = await pangramAssessmentsStorage.getByEntity('dok3_insight', 9300);
    expect(row!.entityId).toBe(9300);
    expect(row!.entityType).toBe('dok3_insight');
  });
});

describe('getLabelsByEntities', () => {
  it('returns empty Map without issuing SQL when entityIds is empty', async () => {
    // Spy on db.select to ensure we don't query.
    const selectSpy = vi.spyOn(db, 'select');
    const result = await pangramAssessmentsStorage.getLabelsByEntities('dok3_insight', []);
    expect(result.size).toBe(0);
    expect(selectSpy).not.toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it('returns null for entities with no row AND for entities whose status != done', async () => {
    // 9001 -> done
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9001,
      TEST_BRAINLIFT_ID,
      'h1',
    );
    await pangramAssessmentsStorage.markDone('dok3_insight', 9001, FIXTURE_RESPONSE);
    // 9002 -> analyzing
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9002,
      TEST_BRAINLIFT_ID,
      'h2',
    );
    // 9003 -> error
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      9003,
      TEST_BRAINLIFT_ID,
      'h3',
    );
    await pangramAssessmentsStorage.markError('dok3_insight', 9003, 'boom');
    // 9004 -> no row

    const result = await pangramAssessmentsStorage.getLabelsByEntities(
      'dok3_insight',
      [9001, 9002, 9003, 9004],
    );
    expect(result.get(9001)).toBe('ai-assisted');
    expect(result.get(9002)).toBeNull();
    expect(result.get(9003)).toBeNull();
    expect(result.get(9004)).toBeNull();
    // All requested ids present in the map (not omitted)
    expect(result.size).toBe(4);
  });
});
