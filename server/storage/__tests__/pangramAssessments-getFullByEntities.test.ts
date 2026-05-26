/**
 * Spec 02 (web-ui) -- pangramAssessmentsStorage.getFullByEntities
 *
 * Batch-fetches the full AiWritingSignalPayload for a list of entity IDs.
 * Used by attachAiWritingSignal in the web GET routes for DOK2/3/4.
 *
 * Integration tests against the local Docker Postgres
 * (`wizardly_kalam` / `dok1grader_local`).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { brainlifts, pangramAssessments, user } from '@shared/schema';
import { pangramAssessmentsStorage } from '../pangramAssessments';
import type { PangramResponse } from '../../ai/pangram/types';

const TEST_USER_ID = `test-getfull-${Date.now()}`;
let TEST_BRAINLIFT_ID = 0;

const FIXTURE_RESPONSE: PangramResponse = {
  text: 'Sample window Second segment',
  version: '3.0',
  prediction_short: 'AI-Assisted',
  fraction_ai: 0.12,
  fraction_ai_assisted: 0.7,
  fraction_human: 0.18,
  num_ai_segments: 1,
  num_ai_assisted_segments: 1,
  num_human_segments: 1,
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
    {
      text: 'Second segment',
      label: 'Human',
      ai_assistance_score: 0.05,
      confidence: 'Medium',
      start_index: 13,
      end_index: 27,
      word_count: 2,
      token_length: 5,
    },
  ],
};

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'getFullByEntities Test User',
    email: `getfull-${Date.now()}@test.com`,
    emailVerified: false,
  });
  const [brainlift] = await db
    .insert(brainlifts)
    .values({
      slug: `getfull-test-${Date.now()}`,
      title: 'getFullByEntities Test',
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
  await db
    .delete(pangramAssessments)
    .where(eq(pangramAssessments.brainliftId, TEST_BRAINLIFT_ID));
});

describe('pangramAssessmentsStorage.getFullByEntities', () => {
  it('returns empty Map without issuing SQL when entityIds is empty', async () => {
    const selectSpy = vi.spyOn(db, 'select');
    const result = await pangramAssessmentsStorage.getFullByEntities('dok3_insight', []);
    expect(result.size).toBe(0);
    expect(selectSpy).not.toHaveBeenCalled();
    selectSpy.mockRestore();
  });

  it('returns Map keyed by entityId with all requested ids present', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      8001,
      TEST_BRAINLIFT_ID,
      'h1',
    );
    await pangramAssessmentsStorage.markDone('dok3_insight', 8001, FIXTURE_RESPONSE);

    const result = await pangramAssessmentsStorage.getFullByEntities('dok3_insight', [
      8001,
      8002,
    ]);
    expect(result.size).toBe(2);
    expect(result.has(8001)).toBe(true);
    expect(result.has(8002)).toBe(true);
    expect(result.get(8002)).toBeNull();
  });

  it('returns fully populated AiWritingSignalPayload for status=done rows (camelCase windows)', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      8100,
      TEST_BRAINLIFT_ID,
      'h',
    );
    await pangramAssessmentsStorage.markDone('dok3_insight', 8100, FIXTURE_RESPONSE);

    const result = await pangramAssessmentsStorage.getFullByEntities('dok3_insight', [8100]);
    const payload = result.get(8100);
    expect(payload).not.toBeNull();
    expect(payload!.status).toBe('done');
    expect(payload!.label).toBe('ai-assisted');
    expect(payload!.version).toBe('3.0');
    expect(payload!.fractions).toEqual({
      ai: 0.12,
      aiAssisted: 0.7,
      human: 0.18,
    });
    expect(payload!.segmentCounts).toEqual({
      ai: 1,
      aiAssisted: 1,
      human: 1,
    });
    expect(payload!.headline).toBe('Likely AI-Assisted');
    expect(payload!.prediction).toBe('Significant AI assistance detected');
    expect(payload!.dashboardLink).toBe('https://dashboard.example/result');
    expect(payload!.errorMessage).toBeNull();
    expect(payload!.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Windows translated snake_case -> camelCase
    expect(payload!.windows).toHaveLength(2);
    expect(payload!.windows![0]).toEqual({
      text: 'Sample window',
      label: 'AI-Generated',
      aiAssistanceScore: 0.9,
      confidence: 'High',
      startIndex: 0,
      endIndex: 13,
      wordCount: 2,
      tokenLength: 4,
    });
    expect(payload!.windows![1]).toEqual({
      text: 'Second segment',
      label: 'Human',
      aiAssistanceScore: 0.05,
      confidence: 'Medium',
      startIndex: 13,
      endIndex: 27,
      wordCount: 2,
      tokenLength: 5,
    });
  });

  it('returns status=analyzing payload with label/fractions/windows all null', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok2_summary',
      8200,
      TEST_BRAINLIFT_ID,
      'h',
    );

    const result = await pangramAssessmentsStorage.getFullByEntities('dok2_summary', [8200]);
    const payload = result.get(8200);
    expect(payload).not.toBeNull();
    expect(payload!.status).toBe('analyzing');
    expect(payload!.label).toBeNull();
    expect(payload!.version).toBeNull();
    expect(payload!.fractions).toBeNull();
    expect(payload!.segmentCounts).toBeNull();
    expect(payload!.headline).toBeNull();
    expect(payload!.prediction).toBeNull();
    expect(payload!.dashboardLink).toBeNull();
    expect(payload!.windows).toBeNull();
    expect(payload!.errorMessage).toBeNull();
    expect(payload!.analyzedAt).toBeNull();
  });

  it('returns status=error payload with errorMessage populated and other fields null', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok4_spov',
      8300,
      TEST_BRAINLIFT_ID,
      'h',
    );
    await pangramAssessmentsStorage.markError('dok4_spov', 8300, 'upstream 503 after 3 retries');

    const result = await pangramAssessmentsStorage.getFullByEntities('dok4_spov', [8300]);
    const payload = result.get(8300);
    expect(payload).not.toBeNull();
    expect(payload!.status).toBe('error');
    expect(payload!.errorMessage).toBe('upstream 503 after 3 retries');
    expect(payload!.label).toBeNull();
    expect(payload!.version).toBeNull();
    expect(payload!.fractions).toBeNull();
    expect(payload!.segmentCounts).toBeNull();
    expect(payload!.headline).toBeNull();
    expect(payload!.prediction).toBeNull();
    expect(payload!.dashboardLink).toBeNull();
    expect(payload!.windows).toBeNull();
    expect(payload!.analyzedAt).toBeNull();
  });

  it('returns null in the Map for entity ids with no row', async () => {
    const result = await pangramAssessmentsStorage.getFullByEntities('dok3_insight', [
      99991,
      99992,
    ]);
    expect(result.size).toBe(2);
    expect(result.get(99991)).toBeNull();
    expect(result.get(99992)).toBeNull();
  });

  it('scopes by entityType so rows of a different entityType are not returned', async () => {
    // Same numeric id, two different entity types -- they must not collide.
    await pangramAssessmentsStorage.upsertAnalyzing(
      'dok3_insight',
      8500,
      TEST_BRAINLIFT_ID,
      'h',
    );
    await pangramAssessmentsStorage.markDone('dok3_insight', 8500, FIXTURE_RESPONSE);

    const result = await pangramAssessmentsStorage.getFullByEntities('dok2_summary', [8500]);
    expect(result.get(8500)).toBeNull();
  });

  it('issues a single SQL query (no N+1) regardless of input size', async () => {
    await pangramAssessmentsStorage.upsertAnalyzing('dok3_insight', 8601, TEST_BRAINLIFT_ID, 'a');
    await pangramAssessmentsStorage.markDone('dok3_insight', 8601, FIXTURE_RESPONSE);
    await pangramAssessmentsStorage.upsertAnalyzing('dok3_insight', 8602, TEST_BRAINLIFT_ID, 'b');
    await pangramAssessmentsStorage.markDone('dok3_insight', 8602, FIXTURE_RESPONSE);
    await pangramAssessmentsStorage.upsertAnalyzing('dok3_insight', 8603, TEST_BRAINLIFT_ID, 'c');

    const selectSpy = vi.spyOn(db, 'select');
    await pangramAssessmentsStorage.getFullByEntities('dok3_insight', [8601, 8602, 8603, 8604]);
    expect(selectSpy).toHaveBeenCalledTimes(1);
    selectSpy.mockRestore();
  });
});
