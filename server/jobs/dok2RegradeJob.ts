import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { gradeDOK2Summary } from '../ai/dok2Grader';
import { recomputeBrainliftScore } from '../services/brainlift';
import type { PreviousEvaluation } from '@shared/types/regrading';
import { db } from '../db';
import { dok2Summaries } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Background job: regrade a DOK2 summary after points edit.
 * Calls dok2Grader with previousEvaluation context for hard floor rule.
 */
export async function dok2RegradeJob(
  payload: { summaryId: number; brainliftId: number; previousEvaluation: PreviousEvaluation },
  helpers: JobHelpers,
): Promise<void> {
  const { summaryId, brainliftId, previousEvaluation } = payload;
  helpers.logger.info(`[DOK2 Regrade] Starting for summary ${summaryId}, brainlift ${brainliftId}`);

  const summary = await storage.getDok2SummaryByIdForBrainlift(summaryId, brainliftId);
  if (!summary) {
    helpers.logger.info(`[DOK2 Regrade] Summary ${summaryId} not found (may have been deleted), skipping`);
    return;
  }

  const brainlift = await storage.getBrainliftById(brainliftId);
  if (!brainlift) {
    helpers.logger.error(`[DOK2 Regrade] Brainlift ${brainliftId} not found`);
    return;
  }

  try {
    // Fetch current points
    const points = await storage.getDok2PointsForSummary(summaryId);
    const pointTexts = points.map((p: { text: string }) => p.text);

    // Fetch related DOK1 facts
    const relatedDOK1s = await storage.getRelatedDOK1sForSummary(summaryId);

    // Grade with previousEvaluation context
    const result = await gradeDOK2Summary(
      pointTexts,
      relatedDOK1s,
      brainlift.description || '',
      summary.sourceUrl,
      undefined,
      undefined,
      previousEvaluation,
    );

    // Update grading and set status to graded
    await storage.updateDOK2Grading(summaryId, brainliftId, {
      grade: result.score,
      diagnosis: result.diagnosis,
      feedback: result.feedback,
      failReason: result.failReason,
      sourceVerified: result.sourceVerified,
      displayTitle: result.displayTitle,
    });
    await db.update(dok2Summaries).set({ gradingStatus: 'graded' }).where(eq(dok2Summaries.id, summaryId));

    helpers.logger.info(`[DOK2 Regrade] Summary ${summaryId} regraded: score=${result.score}`);
  } catch (err: any) {
    helpers.logger.error(`[DOK2 Regrade] Failed for summary ${summaryId}:`, { err });
    await db.update(dok2Summaries).set({ gradingStatus: 'error' }).where(eq(dok2Summaries.id, summaryId));
  }

  // Recompute brainlift score
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'regrade',
    dokLevel: 2,
    itemId: summaryId,
  });
}
