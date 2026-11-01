/**
 * Unified AI Client — Model Registry
 *
 * Central registry of all AI models used in the codebase.
 * Each model includes provider, tier, and display name.
 * Timeout and retries are opt-in per call site, not forced by the registry.
 */

import type { ModelDef, ModelTier } from './types';

// Per-tier OpenRouter->Fireworks provider failover targets. The previous set
// (minimax-m2p1 / glm-4p7 / llama-v3p3-70b / gpt-oss-20b) was fully delisted from
// the Fireworks account (verified 2026-06-12), making provider failover dead
// app-wide. Replacements below are all live on the account and were picked for
// tier-role fit: each separates reasoning from `content` at the tier's configured
// token budget (the provider reads only `message.content`), and latency fits the
// tier's timeouts. budget shares the fast model (no live budget-tier call sites).
export const FIREWORKS_TIER_MODELS: Record<ModelTier, string> = {
  premium: 'accounts/fireworks/models/deepseek-v4-pro',
  standard: 'accounts/fireworks/models/glm-5p1',
  fast: 'accounts/fireworks/models/gpt-oss-120b',
  budget: 'accounts/fireworks/models/gpt-oss-120b',
};

export const MODEL_REGISTRY: Record<string, ModelDef> = {
  // Premium tier
  'anthropic/claude-opus-4.8': {
    id: 'anthropic/claude-opus-4.8',
    provider: 'openrouter',
    tier: 'premium',
    displayName: 'Claude Opus 4.8',
  },
  'anthropic/claude-opus-4.7': {
    id: 'anthropic/claude-opus-4.7',
    provider: 'openrouter',
    tier: 'premium',
    displayName: 'Claude Opus 4.7',
  },
  'anthropic/claude-opus-4.6': {
    id: 'anthropic/claude-opus-4.6',
    provider: 'openrouter',
    tier: 'premium',
    displayName: 'Claude Opus 4.6',
  },

  // Standard tier
  'anthropic/claude-sonnet-4.6': {
    id: 'anthropic/claude-sonnet-4.6',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Claude Sonnet 4.6',
  },
  'anthropic/claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Claude Sonnet 4.5',
  },
  'anthropic/claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Claude Sonnet 4',
  },
  // Downstream readability rewriter (primary). Out-cuts haiku and reads lower at
  // equal length; uniform across DOK1-4. See features/pedagogy/readable-grading-feedback.
  'qwen/qwen3-30b-a3b-instruct-2507': {
    id: 'qwen/qwen3-30b-a3b-instruct-2507',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Qwen3 30B A3B Instruct',
  },

  // Fast tier
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    provider: 'openrouter',
    tier: 'fast',
    displayName: 'Claude Haiku 4.5',
  },
  // gemini-2.0-flash-001 was removed from OpenRouter (404 verified 2026-06-12) and
  // all call sites were migrated to gemini-2.5-flash-lite, so its registry entry
  // is deleted. server/storage/analytics.ts still lists the old id as a historical
  // accuracy-tracking label; getModelDisplayName falls back to the raw id for it.
  'google/gemini-2.5-flash-lite': {
    id: 'google/gemini-2.5-flash-lite',
    provider: 'openrouter',
    tier: 'fast',
    displayName: 'Gemini 2.5 Flash Lite',
  },
  'qwen/qwen-plus': {
    id: 'qwen/qwen-plus',
    provider: 'openrouter',
    tier: 'fast',
    displayName: 'Qwen Plus',
  },

  // Budget tier
  'qwen/qwen3-32b': {
    id: 'qwen/qwen3-32b',
    provider: 'openrouter',
    tier: 'budget',
    displayName: 'Qwen3 32B',
  },
  'meta-llama/llama-3.1-8b-instruct': {
    id: 'meta-llama/llama-3.1-8b-instruct',
    provider: 'openrouter',
    tier: 'budget',
    displayName: 'Llama 3.1 8B',
  },

  // Fireworks tier models. fast and budget share gpt-oss-120b, so it is declared
  // once (tier: 'fast'); the tier field on a fallback entry is informational only,
  // since failover dispatches by the resolved model id, not by re-reading the tier.
  [FIREWORKS_TIER_MODELS.premium]: {
    id: FIREWORKS_TIER_MODELS.premium,
    provider: 'fireworks',
    tier: 'premium',
    displayName: 'Fireworks DeepSeek V4 Pro',
  },
  [FIREWORKS_TIER_MODELS.standard]: {
    id: FIREWORKS_TIER_MODELS.standard,
    provider: 'fireworks',
    tier: 'standard',
    displayName: 'Fireworks GLM 5.1',
  },
  [FIREWORKS_TIER_MODELS.fast]: {
    id: FIREWORKS_TIER_MODELS.fast,
    provider: 'fireworks',
    tier: 'fast',
    displayName: 'Fireworks GPT-OSS 120B',
  },
};

/**
 * Returns the ModelDef for the given model ID, or undefined if not found.
 */
export function getModel(id: string): ModelDef | undefined {
  return MODEL_REGISTRY[id];
}

/**
 * Returns the ModelDef for the given model ID, or throws if not found.
 * Error message includes the list of available models.
 */
export function getModelOrThrow(id: string): ModelDef {
  const model = MODEL_REGISTRY[id];
  if (!model) {
    const available = Object.keys(MODEL_REGISTRY).join(', ');
    throw new Error(
      `Model "${id}" not found in registry. Available models: ${available}`,
    );
  }
  return model;
}

/**
 * Returns the display name for the given model ID.
 * Falls back to the raw ID if the model is not in the registry.
 */
export function getModelDisplayName(id: string): string {
  return MODEL_REGISTRY[id]?.displayName ?? id;
}

export function getFireworksFallback(modelId: string): string | null {
  const model = getModel(modelId);
  if (!model || model.provider === 'fireworks') {
    return null;
  }

  return FIREWORKS_TIER_MODELS[model.tier] ?? null;
}
