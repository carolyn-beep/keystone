import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import type { RunSpec } from '@shared/research-stream';
import { runResearchSwarm } from '../ai/learning-stream-swarm-v2/run';
import { estimateRunCostUsd, type UsageEntry } from '../ai/learning-stream-swarm-v2/cost';
import { orchestrate } from '../ai/learning-stream-swarm-v2/orchestrator';

type LearningStreamResearchPayload =
  | {
      brainliftId: number;
      runSpec: RunSpec;
      runId: number;
      orchestratorUsage?: UsageEntry;
    }
  | {
      brainliftId: number;
      runSpec?: never;
      runId?: never;
      orchestratorUsage?: never;
    };

/**
 * Automated learning stream research job.
 * Uses the v2 Vercel AI SDK fan-out runner.
 *
 * Queued from: runPostProcessingPipeline() after expert extraction
 */
export async function learningStreamResearchJob(
  payload: LearningStreamResearchPayload,
  helpers: JobHelpers
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting learning stream swarm research', { brainliftId });

  try {
    if (!payload.runSpec) {
      const stats = await storage.getLearningStreamStats(brainliftId);
      if (stats.pending > 0) {
        helpers.logger.info('Skipping legacy research payload - pending items exist', {
          brainliftId,
          pendingCount: stats.pending,
        });
        return {
          success: true,
          skipped: true,
          reason: 'pending_items_exist',
          pendingCount: stats.pending,
          estimatedUsd: 0,
        };
      }
    }

    // Verify brainlift exists
    const brainlift = await storage.getBrainliftById(brainliftId);
    if (!brainlift) {
      throw new Error(`Brainlift not found: ${brainliftId}`);
    }

    const resolved = payload.runSpec
      ? {
          runSpec: payload.runSpec,
          runId: payload.runId,
          orchestratorUsage: payload.orchestratorUsage,
          persistUsage: true,
        }
      : {
          ...(await orchestrate(brainliftId, {})),
          runId: Date.now(),
          persistUsage: false,
        };

    const result = await runResearchSwarm(brainliftId, resolved.runSpec, resolved.runId);
    const estimatedUsd = estimateRunCostUsd([
      ...result.slotUsages,
      ...(resolved.orchestratorUsage ? [resolved.orchestratorUsage] : []),
    ]);
    if (resolved.persistUsage) {
      await storage.updateSwarmUsageEstimatedUsd(resolved.runId, estimatedUsd);
    }

    helpers.logger.info('Learning stream swarm research completed', {
      brainliftId,
      slug: brainlift.slug,
      success: result.success,
      totalSaved: result.totalSaved,
      duplicatesSkipped: result.duplicatesSkipped,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
      estimatedUsd,
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
      estimatedUsd,
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
