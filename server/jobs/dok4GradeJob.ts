import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { dok4GradingEmitter } from '../events/dok4GradingEmitter';
import { gradeDOK4Spov } from '../ai/dok4GraderService';
import { recomputeBrainliftScore } from '../services/brainlift';

/**
 * Background job: grade a single DOK4 SPOV.
 *
 * Delegates to gradeDOK4Spov() for the actual pipeline.
 * Keeps emitter integration for manual-mode SSE and retry logic.
 */
export async function dok4GradeJob(
  payload: { spovId: number; brainliftId: number },
  helpers: JobHelpers,
): Promise<void> {
  const { spovId, brainliftId } = payload;
  helpers.logger.info(`[DOK4 Grade] Starting job for SPOV ${spovId}, brainlift ${brainliftId}`);

  // Guard: skip if SPOV is already graded/grading/rejected (prevents duplicate work)
  const spovs = await storage.getDOK4Spovs(brainliftId);
  const spov = spovs.find((s: any) => s.id === spovId);
  if (!spov || (spov.status !== 'linked' && spov.status !== 'pending_linking')) {
    helpers.logger.info(`[DOK4 Grade] SPOV ${spovId} status is '${spov?.status ?? 'not found'}', skipping`);
    return;
  }

  // Ensure grading session is tracked
  if (!dok4GradingEmitter.isGradingActive(brainliftId)) {
    dok4GradingEmitter.startGrading(brainliftId);
  }

  dok4GradingEmitter.emitEvent(brainliftId, {
    type: 'dok4:start',
    spovId,
    brainliftId,
    message: `Starting grading for SPOV ${spovId}`,
  });

  // Delegate to service, bridging progress to emitter
  const result = await gradeDOK4Spov(spovId, brainliftId, (message: string) => {
    // Map progress messages to emitter events
    const type = message.includes('Validating') ? 'dok4:validation'
      : message.includes('Foundation') ? 'dok4:foundation'
      : message.includes('traceability') ? 'dok4:traceability'
      : message.includes('divergence') ? 'dok4:divergence'
      : message.includes('quality') ? 'dok4:evaluation'
      : message.includes('antimemetic') ? 'dok4:antimemetic'
      : 'dok4:evaluation';

    dok4GradingEmitter.emitEvent(brainliftId, {
      type: type as any,
      spovId,
      brainliftId,
      message,
    });
  });

  // Handle result
  if (result.status === 'graded') {
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:complete',
      spovId,
      brainliftId,
      message: `Grading complete: score ${result.score}`,
      score: result.score,
    });
    helpers.logger.info(`[DOK4 Grade] SPOV ${spovId} graded: score=${result.score}`);
  } else if (result.status === 'rejected') {
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:rejected',
      spovId,
      brainliftId,
      message: `SPOV rejected: ${result.rejectionCategory}`,
    });
    helpers.logger.info(`[DOK4 Grade] SPOV ${spovId} rejected: ${result.rejectionCategory}`);
  } else {
    // Error case
    const attempts = helpers.job.attempts;
    const maxAttempts = helpers.job.max_attempts;
    const isLastAttempt = attempts >= maxAttempts;

    if (isLastAttempt) {
      dok4GradingEmitter.emitEvent(brainliftId, {
        type: 'dok4:error',
        spovId,
        brainliftId,
        message: `Grading failed after ${maxAttempts} attempts: ${result.error}`,
        error: result.error,
      });
    } else {
      // Re-throw so graphile-worker retries
      throw new Error(result.error || 'DOK4 grading failed');
    }
  }

  // Recompute brainlift score after each SPOV is graded
  try {
    await recomputeBrainliftScore(brainliftId);
  } catch (err: any) {
    helpers.logger.error(`[DOK4 Grade] Score recomputation failed:`, { err });
  }
}
