import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { dok3GradingEmitter } from '../events/dok3GradingEmitter';
import { gradeDOK3Insight } from '../ai/dok3Grader';
import { recomputeBrainliftScore } from '../services/brainlift';
import { triggerDependentDOK4Grading } from '../storage/dok4';
import { withJob } from '../utils/withJob';

const GATE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const INITIAL_POLL_MS = 2000;
const MAX_POLL_MS = 30000;

/**
 * Background job: grade a single DOK3 insight.
 * Gate-polls until foundation (DOK1+DOK2) grading is complete,
 * then runs the 4-step DOK3 evaluation pipeline.
 */
export async function dok3GradeJob(
  payload: { insightId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { insightId, brainliftId } = payload;
  helpers.logger.info(`[DOK3 Grade] Starting job for insight ${insightId}, brainlift ${brainliftId}`);

  // Ensure grading session is tracked
  if (!dok3GradingEmitter.isGradingActive(brainliftId)) {
    dok3GradingEmitter.startGrading(brainliftId);
  }

  dok3GradingEmitter.emitEvent(brainliftId, {
    type: 'dok3:start',
    insightId,
    brainliftId,
    message: `Starting grading for insight ${insightId}`,
  });

  // Gate polling: wait for foundation to be graded
  const gateStart = Date.now();
  let pollInterval = INITIAL_POLL_MS;

  dok3GradingEmitter.emitEvent(brainliftId, {
    type: 'dok3:foundation',
    insightId,
    brainliftId,
    message: 'Waiting for foundation grading to complete...',
  });

  while (true) {
    const gateStatus = await storage.checkFoundationGraded(insightId);

    if (gateStatus.ready) {
      helpers.logger.info(`[DOK3 Grade] Foundation ready for insight ${insightId}`);
      break;
    }

    if (Date.now() - gateStart > GATE_TIMEOUT_MS) {
      const errorMsg = `Gate timeout after 15 minutes. Pending: ${gateStatus.pendingDok2Count} DOK2, ${gateStatus.pendingDok1Count} DOK1`;
      helpers.logger.error(`[DOK3 Grade] ${errorMsg}`);
      await storage.updateDOK3InsightStatus(insightId, brainliftId, 'error');
      dok3GradingEmitter.emitEvent(brainliftId, {
        type: 'dok3:error',
        insightId,
        brainliftId,
        message: errorMsg,
        error: errorMsg,
      });
      return;
    }

    // Exponential backoff: 2s → 4s → 8s → 16s → 30s cap
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 2, MAX_POLL_MS);
  }

  // Run the DOK3 grading pipeline
  try {
    dok3GradingEmitter.emitEvent(brainliftId, {
      type: 'dok3:evaluation',
      insightId,
      brainliftId,
      message: 'Evaluating insight...',
    });

    const result = await gradeDOK3Insight(insightId, brainliftId, (event) => {
      // Forward grading progress events to the emitter
      dok3GradingEmitter.emitEvent(brainliftId, {
        type: event.stage,
        insightId,
        brainliftId,
        message: event.message,
        score: event.score,
      });
    });

    dok3GradingEmitter.emitEvent(brainliftId, {
      type: 'dok3:complete',
      insightId,
      brainliftId,
      message: `Grading complete: score ${result.score}`,
      score: result.score,
    });

    helpers.logger.info(`[DOK3 Grade] Insight ${insightId} graded: score=${result.score}`);

    // Enqueue AI Writing Signal analysis (Pangram). Only on grade success;
    // failures should not fan out wasted Pangram calls.
    try {
      await withJob('pangram:analyze')
        .forPayload({ entityType: 'dok3_insight', entityId: insightId, brainliftId })
        .withOptions({ maxAttempts: 3 })
        .queue();
    } catch (enqueueErr) {
      helpers.logger.error(
        `[DOK3 Grade] Failed to enqueue pangram:analyze for insight ${insightId}:`,
        { err: enqueueErr },
      );
    }
  } catch (err: any) {
    const attempts = helpers.job.attempts;
    const maxAttempts = helpers.job.max_attempts;
    const isLastAttempt = attempts >= maxAttempts;

    helpers.logger.error(`[DOK3 Grade] Grading failed for insight ${insightId} (attempt ${attempts}/${maxAttempts}):`, { err });

    if (isLastAttempt) {
      // Final attempt exhausted — mark as permanent error
      await storage.updateDOK3InsightStatus(insightId, brainliftId, 'error');
      dok3GradingEmitter.emitEvent(brainliftId, {
        type: 'dok3:error',
        insightId,
        brainliftId,
        message: `Grading failed after ${maxAttempts} attempts: ${err.message}`,
        error: err.message,
      });
    } else {
      // Re-throw so graphile-worker retries with backoff
      throw err;
    }
  }

  // Recompute brainlift score after each insight is graded
  try {
    await recomputeBrainliftScore(brainliftId, {
      trigger: 'pipeline',
      dokLevel: 3,
      itemId: insightId,
    });
  } catch (err: any) {
    helpers.logger.error(`[DOK3 Grade] Score recomputation failed:`, { err });
  }

  // Trigger dependent DOK4 grading (reactive: checks if all linked DOK3s are resolved)
  try {
    const dok4Queued = await triggerDependentDOK4Grading(insightId, brainliftId);
    if (dok4Queued > 0) {
      helpers.logger.info(`[DOK3 Grade] Queued ${dok4Queued} DOK4 grading jobs after insight ${insightId}`);
    }
  } catch (err: any) {
    helpers.logger.error(`[DOK3 Grade] DOK4 trigger failed:`, { err });
  }
}
