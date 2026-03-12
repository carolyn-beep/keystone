/**
 * Unified AI Client — Model Registry
 *
 * Central registry of all AI models used in the codebase.
 * Each model includes provider, tier, display name, and defaults.
 */

import type { ModelDef } from './types';

export const MODEL_REGISTRY: Record<string, ModelDef> = {
  // Premium tier
  'anthropic/claude-opus-4.6': {
    id: 'anthropic/claude-opus-4.6',
    provider: 'openrouter',
    tier: 'premium',
    displayName: 'Claude Opus 4.6',
    defaultTimeout: 90_000,
    defaultMaxRetries: 2,
  },

  // Standard tier
  'anthropic/claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Claude Sonnet 4.5',
    defaultTimeout: 60_000,
    defaultMaxRetries: 2,
  },
  'anthropic/claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    provider: 'openrouter',
    tier: 'standard',
    displayName: 'Claude Sonnet 4',
    defaultTimeout: 60_000,
    defaultMaxRetries: 2,
  },

  // Fast tier
  'anthropic/claude-haiku-4.5': {
    id: 'anthropic/claude-haiku-4.5',
    provider: 'openrouter',
    tier: 'fast',
    displayName: 'Claude Haiku 4.5',
    defaultTimeout: 30_000,
    defaultMaxRetries: 2,
  },
  'google/gemini-2.0-flash-001': {
    id: 'google/gemini-2.0-flash-001',
    provider: 'openrouter',
    tier: 'fast',
    displayName: 'Gemini 2.0 Flash',
    defaultTimeout: 30_000,
    defaultMaxRetries: 2,
  },

  // Budget tier
  'qwen/qwen3-32b': {
    id: 'qwen/qwen3-32b',
    provider: 'openrouter',
    tier: 'budget',
    displayName: 'Qwen3 32B',
    defaultTimeout: 30_000,
    defaultMaxRetries: 2,
  },
  'meta-llama/llama-3.1-8b-instruct': {
    id: 'meta-llama/llama-3.1-8b-instruct',
    provider: 'openrouter',
    tier: 'budget',
    displayName: 'Llama 3.1 8B',
    defaultTimeout: 30_000,
    defaultMaxRetries: 2,
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
