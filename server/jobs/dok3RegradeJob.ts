import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { gradeDOK3Insight } from '../ai/dok3Grader';
import { recomputeBrainliftScore } from '../services/brainlift';
import type { PreviousEvaluation } from '@shared/types/regrading';

/**
 * Background job: regrade a DOK3 insight after text edit.
 * Delegates to gradeDOK3Insight which handles the full 4-step pipeline.
 */
export async function dok3RegradeJob(
  payload: { insightId: number; brainliftId: number; previousEvaluation: PreviousEvaluation },
  helpers: JobHelpers,
): Promise<void> {
  const { insightId, brainliftId, previousEvaluation } = payload;
  helpers.logger.info(`[DOK3 Regrade] Starting for insight ${insightId}, brainlift ${brainliftId}`);

  // Verify insight exists
  const insights = await storage.getDOK3Insights(brainliftId);
  const insight = insights.find((i: { id: number }) => i.id === insightId);
  if (!insight) {
    helpers.logger.info(`[DOK3 Regrade] Insight ${insightId} not found (may have been deleted), skipping`);
    return;
  }

  // Set status to grading
  await storage.updateDOK3InsightStatus(insightId, brainliftId, 'grading');

  try {
    // Regrade using the existing grading pipeline
    // Note: gradeDOK3Insight handles the full pipeline including foundation check
    await gradeDOK3Insight(insightId, brainliftId, undefined, previousEvaluation);

    helpers.logger.info(`[DOK3 Regrade] Insight ${insightId} regraded`);
  } catch (err: any) {
    helpers.logger.error(`[DOK3 Regrade] Failed for insight ${insightId}:`, { err });
    await storage.updateDOK3InsightStatus(insightId, brainliftId, 'error');
  }

  // Recompute brainlift score
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'regrade',
    dokLevel: 3,
    itemId: insightId,
  });
}
