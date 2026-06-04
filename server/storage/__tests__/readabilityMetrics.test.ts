/**
 * Tests for FR3: recordRewriteMetric.
 *
 * Runs against the local Docker Postgres (dok1grader_local). Inserts one metric
 * row and asserts the persisted values.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { brainlifts, readabilityRewriteMetrics } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { recordRewriteMetric, getReadabilityAnalytics } from '../readabilityMetrics';

let testBrainliftId: number;

beforeAll(async () => {
  const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };
  const [bl] = await db.insert(brainlifts).values({
    title: 'Readability Metrics Test',
    slug: 'readability-metrics-test-' + Date.now(),
    description: 'Test brainlift for rewrite metrics',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl.id;
});

afterAll(async () => {
  await db.delete(readabilityRewriteMetrics).where(eq(readabilityRewriteMetrics.brainliftId, testBrainliftId));
  await db.delete(brainlifts).where(eq(brainlifts.id, testBrainliftId));
});

describe('recordRewriteMetric', () => {
  it('inserts a single row with all fields', async () => {
    await recordRewriteMetric({
      dokLevel: 3,
      itemId: 12345,
      brainliftId: testBrainliftId,
      rewritten: true,
      reason: 'ok',
      fkBefore: 14.2,
      fkAfter: 8.1,
      wordsBefore: 200,
      wordsAfter: 90,
      candidateFk: 8.1,
      candidateWords: 90,
      rounds: 1,
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
    });

    const rows = await db.select()
      .from(readabilityRewriteMetrics)
      .where(eq(readabilityRewriteMetrics.itemId, 12345));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dokLevel: 3,
      itemId: 12345,
      brainliftId: testBrainliftId,
      rewritten: true,
      reason: 'ok',
      fkBefore: 14.2,
      fkAfter: 8.1,
      wordsBefore: 200,
      wordsAfter: 90,
      candidateFk: 8.1,
      candidateWords: 90,
      rounds: 1,
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
    });
    expect(rows[0].recordedAt).toBeInstanceOf(Date);
  });

  it('accepts a fallback metric with null fk/model and rewritten=false', async () => {
    await recordRewriteMetric({
      dokLevel: 1,
      itemId: 99999,
      brainliftId: testBrainliftId,
      rewritten: false,
      reason: 'model_failed',
      fkBefore: null,
      fkAfter: null,
      wordsBefore: 0,
      wordsAfter: 0,
      rounds: 0,
      model: null,
    });

    const rows = await db.select()
      .from(readabilityRewriteMetrics)
      .where(eq(readabilityRewriteMetrics.itemId, 99999));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rewritten: false, reason: 'model_failed', model: null });
  });
});

describe('getReadabilityAnalytics', () => {
  it('aggregates counts, success rate, and reason breakdown (delta over baseline)', async () => {
    // The endpoint aggregates the whole table; assert deltas so pre-existing local
    // rows do not break the test.
    const before = await getReadabilityAnalytics();
    const beforeLvl4 = before.levels.find((l) => l.dokLevel === 4);
    const baseTotal = beforeLvl4?.total ?? 0;
    const baseSuccess = beforeLvl4?.successCount ?? 0;

    // 2 successes (ok + accepted_below_target) and 1 fallback (sanity_failed) at DOK4.
    await recordRewriteMetric({
      dokLevel: 4, itemId: 50001, brainliftId: testBrainliftId, rewritten: true, reason: 'ok',
      fkBefore: 14, fkAfter: 8, wordsBefore: 200, wordsAfter: 100, candidateFk: 8, candidateWords: 100, rounds: 1, model: 'm',
    });
    await recordRewriteMetric({
      dokLevel: 4, itemId: 50002, brainliftId: testBrainliftId, rewritten: true, reason: 'accepted_below_target',
      fkBefore: 12, fkAfter: 11, wordsBefore: 180, wordsAfter: 160, candidateFk: 11, candidateWords: 160, rounds: 1, model: 'm',
    });
    await recordRewriteMetric({
      dokLevel: 4, itemId: 50003, brainliftId: testBrainliftId, rewritten: false, reason: 'sanity_failed',
      fkBefore: 13, fkAfter: 13, wordsBefore: 190, wordsAfter: 190, candidateFk: 9, candidateWords: 120, rounds: 1, model: 'm',
    });

    const after = await getReadabilityAnalytics();
    expect(after.hasData).toBe(true);

    const lvl4 = after.levels.find((l) => l.dokLevel === 4);
    expect(lvl4).toBeDefined();
    expect(lvl4!.total).toBe(baseTotal + 3);
    expect(lvl4!.successCount).toBe(baseSuccess + 2);
    expect(lvl4!.successRate).toBeGreaterThan(0);
    expect(typeof lvl4!.avgFkBefore).toBe('number');
    expect(typeof lvl4!.avgFkAfter).toBe('number');

    // GROUP BY level x reason x rewritten produced my accepted_below_target bucket.
    const acc = after.reasons.find(
      (r) => r.dokLevel === 4 && r.reason === 'accepted_below_target' && r.rewritten === true,
    );
    expect(acc).toBeDefined();
    expect(acc!.count).toBeGreaterThanOrEqual(1);
  });
});
