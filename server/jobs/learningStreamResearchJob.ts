import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { runLearningStreamSwarm } from '../ai/learning-stream-swarm';

/**
 * Automated learning stream research job.
 * Uses a Claude Agent SDK swarm with 20 parallel web-researcher agents.
 *
 * Queued from: runPostProcessingPipeline() after expert extraction
 */
export async function learningStreamResearchJob(
  payload: {
    brainliftId: number;
  },
  helpers: JobHelpers
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting learning stream swarm research', { brainliftId });

  try {
    // Skip if pending items already exist (prevents duplicate AI calls)
    const stats = await storage.getLearningStreamStats(brainliftId);
    if (stats.pending > 0) {
      helpers.logger.info('Skipping - pending items exist', {
        brainliftId,
        pendingCount: stats.pending
      });
      return {
        success: true,
        skipped: true,
        reason: 'pending_items_exist',
        pendingCount: stats.pending,
      };
    }

    // Verify brainlift exists
    const brainlift = await storage.getBrainliftById(brainliftId);
    if (!brainlift) {
      throw new Error(`Brainlift not found: ${brainliftId}`);
    }

    // Run the swarm
    const result = await runLearningStreamSwarm(brainliftId, {
      maxTurns: 60,
      maxBudgetUsd: 5.0,
    });

    helpers.logger.info('Learning stream swarm research completed', {
      brainliftId,
      slug: brainlift.slug,
      success: result.success,
      totalSaved: result.totalSaved,
      duplicatesSkipped: result.duplicatesSkipped,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    });

    if (result.errors.length > 0) {
      helpers.logger.warn('Swarm completed with errors', {
        brainliftId,
        errors: result.errors,
      });
    }

    return {
      success: result.success,
      totalSaved: result.totalSaved,
      duplicatesSkipped: result.duplicatesSkipped,
      errors: result.errors,
      durationMs: result.durationMs,
      completedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    console.error('[Learning Stream Swarm] Job failed:', error.message, error.stack);
    helpers.logger.error('Learning stream swarm job failed', {
      brainliftId,
      error: error.message,
      stack: error.stack,
    });

    // Don't throw - allow job to complete with error logged
    return {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString(),
    };
  }
}
