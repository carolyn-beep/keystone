/**
 * Storage module for readability_rewrite_metrics (spec 03-rewrite-integration).
 *
 * One row per downstream rewrite attempt: whether the rewrite was accepted or
 * fell back to the grader original, the failure reason, and achieved FK/length.
 * Written inline from `rewriteForPersist`; never on the user request path.
 */

import { db, sql, readabilityRewriteMetrics } from './base';
import type { InsertReadabilityRewriteMetric } from '@shared/schema';
import type {
  ReadabilityAnalyticsResponse,
  ReadabilityLevelStats,
  ReadabilityReasonRow,
} from '@shared/analytics-types';

export type NewRewriteMetric = InsertReadabilityRewriteMetric;

/** Insert a single rewrite metric row. */
export async function recordRewriteMetric(row: NewRewriteMetric): Promise<void> {
  await db.insert(readabilityRewriteMetrics).values(row);
}

/** Round a DB average to 2 decimals, preserving null. */
function avg2(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/**
 * Aggregate readability rewrite metrics for the admin Analytics card. All
 * aggregation is pushed to SQL (COUNT, AVG, GROUP BY, FILTER); the only JS work is
 * coercion/rounding and summing the four per-level rows into the overall totals.
 */
export async function getReadabilityAnalytics(): Promise<ReadabilityAnalyticsResponse> {
  const levelRows = await db
    .select({
      dokLevel: readabilityRewriteMetrics.dokLevel,
      total: sql<number>`count(*)`,
      successCount: sql<number>`count(*) filter (where ${readabilityRewriteMetrics.rewritten})`,
      avgFkBefore: sql<number | null>`avg(${readabilityRewriteMetrics.fkBefore})`,
      avgFkAfter: sql<number | null>`avg(${readabilityRewriteMetrics.fkAfter})`,
      avgFkDelta: sql<number | null>`avg(${readabilityRewriteMetrics.fkBefore} - ${readabilityRewriteMetrics.fkAfter})`,
      avgWordsBefore: sql<number | null>`avg(${readabilityRewriteMetrics.wordsBefore})`,
      avgWordsAfter: sql<number | null>`avg(${readabilityRewriteMetrics.wordsAfter})`,
      avgWordsDelta: sql<number | null>`avg(${readabilityRewriteMetrics.wordsBefore} - ${readabilityRewriteMetrics.wordsAfter})`,
    })
    .from(readabilityRewriteMetrics)
    .groupBy(readabilityRewriteMetrics.dokLevel)
    .orderBy(readabilityRewriteMetrics.dokLevel);

  const reasonRows = await db
    .select({
      dokLevel: readabilityRewriteMetrics.dokLevel,
      reason: readabilityRewriteMetrics.reason,
      rewritten: readabilityRewriteMetrics.rewritten,
      count: sql<number>`count(*)`,
    })
    .from(readabilityRewriteMetrics)
    .groupBy(
      readabilityRewriteMetrics.dokLevel,
      readabilityRewriteMetrics.reason,
      readabilityRewriteMetrics.rewritten,
    )
    .orderBy(readabilityRewriteMetrics.dokLevel, readabilityRewriteMetrics.reason);

  const levels: ReadabilityLevelStats[] = levelRows.map((r) => {
    const total = Number(r.total);
    const successCount = Number(r.successCount);
    return {
      dokLevel: r.dokLevel as 1 | 2 | 3 | 4,
      total,
      successCount,
      successRate: total > 0 ? successCount / total : 0,
      avgFkBefore: avg2(r.avgFkBefore),
      avgFkAfter: avg2(r.avgFkAfter),
      avgFkDelta: avg2(r.avgFkDelta),
      avgWordsBefore: avg2(r.avgWordsBefore),
      avgWordsAfter: avg2(r.avgWordsAfter),
      avgWordsDelta: avg2(r.avgWordsDelta),
    };
  });

  const reasons: ReadabilityReasonRow[] = reasonRows.map((r) => ({
    dokLevel: r.dokLevel as 1 | 2 | 3 | 4,
    reason: r.reason ?? 'unknown',
    rewritten: r.rewritten,
    count: Number(r.count),
  }));

  const total = levels.reduce((sum, l) => sum + l.total, 0);
  const successCount = levels.reduce((sum, l) => sum + l.successCount, 0);

  return {
    hasData: total > 0,
    overall: {
      total,
      successCount,
      successRate: total > 0 ? successCount / total : 0,
    },
    levels,
    reasons,
  };
}
