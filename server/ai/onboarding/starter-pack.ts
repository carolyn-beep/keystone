/**
 * Starter-pack pipeline for the onboarding wizard
 * (features/ux-redesign/onboarding-wizard, spec 05 FR3).
 *
 * Completing the Categories step fires a quick, cheap, cap-exempt swarm run.
 * `launchStarterPack` builds a quick RunRequest from the brainlift, orchestrates
 * synchronously, records `swarm_usage` (NEVER consulting the daily cap), then in
 * a background task runs the swarm and — strictly after it resolves, and only
 * when the project declared out-of-scope topics — prunes the pack with the cheap
 * scope filter before recording estimated cost. An in-memory set tracks the
 * in-flight window (launch → filter completion) so the status endpoint can
 * report `running` until the filter settles.
 *
 * Mirrors the /launch handler's background pattern (void async, failure path
 * emits an `endSwarm` event), minus the daily-cap check.
 */

import type { Brainlift } from '@shared/schema';
import type { RunRequest, RunSpec } from '@shared/research-stream';
import { orchestrate } from '../learning-stream-swarm-v2/orchestrator';
import { runResearchSwarm } from '../learning-stream-swarm-v2/run';
import { estimateRunCostUsd } from '../learning-stream-swarm-v2/cost';
import { swarmEmitter } from '../learning-stream-swarm-v2/event-emitter';
import { storage } from '../../storage';
import { filterOutOfScopeItems } from './scope-filter';

const STARTER_PACK_AGENT_COUNT = 3;
/** Planning chain for quick runs: a near-empty digest does not need opus. */
const STARTER_PACK_ORCHESTRATOR_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'qwen/qwen-plus',
] as const;
const STARTER_PACK_NOTES =
  'This is a quick starter pack for a brand-new project with little or no material yet. ' +
  'Assemble a small set of approachable, well-known starting points across source types — ' +
  'favor accessible overviews over niche or highly technical sources. Honor the project ' +
  'scope and categories in the digest.';

/** Brainlifts with a starter pack currently running (launch → filter complete). */
const inFlight = new Set<number>();

export function isStarterPackInFlight(brainliftId: number): boolean {
  return inFlight.has(brainliftId);
}

/**
 * Launch a quick starter-pack swarm for the given brainlift. Returns the
 * recorded `runId`. Cap-exempt: the daily swarm quota is never consulted.
 */
export async function launchStarterPack(
  brainlift: Brainlift,
  userId: string,
): Promise<{ runId: number }> {
  // Scope + categories reach the agents through the spec 01 swarm-context
  // digest; only the topic feeds the RunRequest. Use the full descriptive
  // topic sentence — the display title may be an invented project name.
  const runRequest: RunRequest = {
    topic: brainlift.onboardingTopic ?? brainlift.title,
    agentCount: STARTER_PACK_AGENT_COUNT,
    notes: STARTER_PACK_NOTES,
  };

  const orchestrated = await orchestrate(brainlift.id, runRequest, {
    models: STARTER_PACK_ORCHESTRATOR_MODELS,
  });
  const quickSpec: RunSpec = { ...orchestrated.runSpec, quick: true };

  // Record usage WITHOUT a daily-cap check (cap-exempt by design).
  const runId = await storage.recordSwarmUsage(userId, brainlift.id, quickSpec);

  const orchestratorUsage = {
    model: orchestrated.modelUsed,
    inputTokens: orchestrated.usage.inputTokens,
    outputTokens: orchestrated.usage.outputTokens,
  };

  inFlight.add(brainlift.id);
  void (async () => {
    // runResearchSwarm emits its own endSwarm on completion; only a failure
    // BEFORE that may emit the failure event. Tail errors (filter reads /
    // discard / cost write) just log — emitting a second endSwarm would
    // contradict the success event listeners already received.
    let swarmFinished = false;
    try {
      const result = await runResearchSwarm(brainlift.id, quickSpec, runId);
      swarmFinished = true;

      // Scope filter runs strictly after swarm completion, only when the project
      // declared out-of-scope topics. Fail-open: the filter never discards on error.
      const outOfScope = brainlift.outOfScope ?? [];
      if (outOfScope.length > 0) {
        const pending = await storage.getPendingStarterPackItems(brainlift.id);
        if (pending.length > 0) {
          const discardIds = await filterOutOfScopeItems(pending, outOfScope);
          if (discardIds.length > 0) {
            await storage.discardStarterPackItems(discardIds, brainlift.id);
          }
        }
      }

      const estimatedUsd = estimateRunCostUsd([...result.slotUsages, orchestratorUsage]);
      await storage.updateSwarmUsageEstimatedUsd(runId, estimatedUsd);
      console.log(
        `[starter-pack:run] brainlift=${brainlift.id} runId=${runId} ` +
        `saved=${result.totalSaved} failed=${result.failedCount} usd=${estimatedUsd.toFixed(4)}`,
      );
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error(`[starter-pack:run] brainlift=${brainlift.id} runId=${runId} failed`, error);
      if (!swarmFinished) {
        swarmEmitter.endSwarm(brainlift.id, {
          success: false,
          totalSaved: 0,
          duplicatesSkipped: 0,
          failedCount: quickSpec.agents.length,
          errors: [message],
        });
      }
    } finally {
      inFlight.delete(brainlift.id);
    }
  })();

  return { runId };
}
