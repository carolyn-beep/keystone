import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { gradeDOK4Spov } from '../ai/dok4GraderService';
import { recomputeBrainliftScore } from '../services/brainlift';
import type { PreviousEvaluation } from '@shared/types/regrading';

/**
 * Background job: regrade a DOK4 SPOV after text edit.
 * Delegates to gradeDOK4Spov which handles the full 5-step pipeline.
 */
export async function dok4RegradeJob(
  payload: { spovId: number; brainliftId: number; previousEvaluation: PreviousEvaluation },
  helpers: JobHelpers,
): Promise<void> {
  const { spovId, brainliftId, previousEvaluation } = payload;
  helpers.logger.info(`[DOK4 Regrade] Starting for SPOV ${spovId}, brainlift ${brainliftId}`);

  // Verify SPOV exists
  const spovs = await storage.getDOK4Spovs(brainliftId);
  const spov = spovs.find((s: { id: number }) => s.id === spovId);
  if (!spov) {
    helpers.logger.info(`[DOK4 Regrade] SPOV ${spovId} not found (may have been deleted), skipping`);
    return;
  }

  // Set status to indicate regrading
  await storage.updateDOK4SpovStatus(spovId, brainliftId, 'linked');

  try {
    // Regrade using the existing grading pipeline
    await gradeDOK4Spov(spovId, brainliftId, undefined, previousEvaluation);

    helpers.logger.info(`[DOK4 Regrade] SPOV ${spovId} regraded`);
  } catch (err: any) {
    helpers.logger.error(`[DOK4 Regrade] Failed for SPOV ${spovId}:`, { err });
    await storage.updateDOK4SpovStatus(spovId, brainliftId, 'error');
  }

  // Recompute brainlift score
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'regrade',
    dokLevel: 4,
    itemId: spovId,
  });
}
