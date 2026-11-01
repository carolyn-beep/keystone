/**
 * Centralized per-level configuration for the downstream rewrite engine.
 *
 * Single source of truth for rewrite targets and loop policy per DOK level, plus
 * the rewriter model chain. Changed via PR (no runtime/DB editing). Per-level
 * differences live here (FK target, word cap, loop policy); the model is uniform
 * across all levels.
 */

export type DokLevel = 'DOK1' | 'DOK2' | 'DOK3' | 'DOK4';

export interface LevelRewriteConfig {
  /** Flesch-Kincaid grade gate: a rewrite is accepted only if FK <= fkTarget. */
  fkTarget: number;
  /** Word gate: a rewrite is accepted only if words <= wordCap. */
  wordCap: number;
  /** Max rewrite passes. DOK1/2/3 = 1; DOK4 = 2. */
  maxRounds: number;
  /**
   * DOK4 only: run the (single) extra pass ONLY when the round-1 output still
   * exceeds this word count. Absent for single-pass levels.
   */
  extraPassOverWords?: number;
}

/**
 * Locked per-level config (see FEATURE.md "Locked Decisions" and
 * decisions-dok{1,2,3,4}.md).
 *
 * DOK2 wordCap = 78: the p25 of the pre-softening DOK2 diagnosis word distribution,
 * computed from the DOK2 run data (research-evidence/dok2 `words_gen`, n=112,
 * p25=78; corroborated by the qwen reval `words0`). The convention (p25) is the
 * locked decision; 78 is the value lookup.
 */
export const REWRITE_CONFIG: Record<DokLevel, LevelRewriteConfig> = {
  DOK1: { fkTarget: 10, wordCap: 89, maxRounds: 1 },
  DOK2: { fkTarget: 10, wordCap: 78, maxRounds: 1 },
  DOK3: { fkTarget: 10, wordCap: 140, maxRounds: 1 },
  DOK4: { fkTarget: 10, wordCap: 160, maxRounds: 2, extraPassOverWords: 170 },
};

/**
 * Uniform rewriter chain: qwen3-30b-a3b primary -> haiku-4.5 failover, used via
 * the unified client's callModelWithFallback. Both ids must exist in the model
 * registry (server/ai/client/registry.ts).
 */
export const REWRITER_MODELS = [
  'qwen/qwen3-30b-a3b-instruct-2507',
  'anthropic/claude-haiku-4.5',
] as const;
