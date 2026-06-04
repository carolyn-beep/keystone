/**
 * Tests for FR1: Model Registry
 *
 * Validates MODEL_REGISTRY contents, lookup functions (getModel, getModelOrThrow,
 * getModelDisplayName), and model metadata correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  FIREWORKS_TIER_MODELS,
  MODEL_REGISTRY,
  getFireworksFallback,
  getModel,
  getModelOrThrow,
  getModelDisplayName,
} from '../registry';
import type { ModelDef } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Registry Contents
// ═══════════════════════════════════════════════════════════════════════════

describe('MODEL_REGISTRY', () => {
  const OPENROUTER_MODELS = [
    'anthropic/claude-opus-4.8',
    'anthropic/claude-opus-4.7',
    'anthropic/claude-opus-4.6',
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.0-flash-001',
    'qwen/qwen-plus',
    'qwen/qwen3-32b',
    'qwen/qwen3-30b-a3b-instruct-2507',
    'meta-llama/llama-3.1-8b-instruct',
  ];
  const FIREWORKS_MODELS = Object.values(FIREWORKS_TIER_MODELS);
  const EXPECTED_MODELS = [...OPENROUTER_MODELS, ...FIREWORKS_MODELS];

  it('contains all expected OpenRouter and Fireworks models', () => {
    const registeredIds = Object.keys(MODEL_REGISTRY);
    for (const modelId of EXPECTED_MODELS) {
      expect(registeredIds).toContain(modelId);
    }
    expect(registeredIds).toHaveLength(16);
  });

  it.each(OPENROUTER_MODELS)('OpenRouter model "%s" has required metadata fields', (modelId) => {
    const model = MODEL_REGISTRY[modelId];
    expect(model).toBeDefined();
    expect(model.id).toBe(modelId);
    expect(model.provider).toBe('openrouter');
    expect(['premium', 'standard', 'fast', 'budget']).toContain(model.tier);
    expect(model.displayName).toBeTruthy();
    // timeout and retries are opt-in, not forced by registry
    expect(model.defaultTimeout).toBeUndefined();
    expect(model.defaultMaxRetries).toBeUndefined();
  });

  it.each(FIREWORKS_MODELS)('Fireworks model "%s" has required metadata fields', (modelId) => {
    const model = MODEL_REGISTRY[modelId];
    expect(model).toBeDefined();
    expect(model.id).toBe(modelId);
    expect(model.provider).toBe('fireworks');
    expect(['premium', 'standard', 'fast', 'budget']).toContain(model.tier);
    expect(model.displayName).toBeTruthy();
    expect(model.defaultTimeout).toBeUndefined();
    expect(model.defaultMaxRetries).toBeUndefined();
  });

  it('assigns correct tiers', () => {
    expect(MODEL_REGISTRY['anthropic/claude-opus-4.7'].tier).toBe('premium');
    expect(MODEL_REGISTRY['anthropic/claude-opus-4.6'].tier).toBe('premium');
    expect(MODEL_REGISTRY['anthropic/claude-sonnet-4.6'].tier).toBe('standard');
    expect(MODEL_REGISTRY['anthropic/claude-sonnet-4.5'].tier).toBe('standard');
    expect(MODEL_REGISTRY['anthropic/claude-sonnet-4'].tier).toBe('standard');
    expect(MODEL_REGISTRY['anthropic/claude-haiku-4.5'].tier).toBe('fast');
    expect(MODEL_REGISTRY['google/gemini-2.0-flash-001'].tier).toBe('fast');
    expect(MODEL_REGISTRY['qwen/qwen-plus'].tier).toBe('fast');
    expect(MODEL_REGISTRY['qwen/qwen3-32b'].tier).toBe('budget');
    expect(MODEL_REGISTRY['meta-llama/llama-3.1-8b-instruct'].tier).toBe('budget');
    expect(MODEL_REGISTRY[FIREWORKS_TIER_MODELS.premium].tier).toBe('premium');
    expect(MODEL_REGISTRY[FIREWORKS_TIER_MODELS.standard].tier).toBe('standard');
    expect(MODEL_REGISTRY[FIREWORKS_TIER_MODELS.fast].tier).toBe('fast');
    expect(MODEL_REGISTRY[FIREWORKS_TIER_MODELS.budget].tier).toBe('budget');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getModel
// ═══════════════════════════════════════════════════════════════════════════

describe('getModel', () => {
  it('returns ModelDef for a known model', () => {
    const model = getModel('anthropic/claude-haiku-4.5');
    expect(model).toBeDefined();
    expect(model!.id).toBe('anthropic/claude-haiku-4.5');
    expect(model!.displayName).toBeTruthy();
  });

  it('returns undefined for an unknown model', () => {
    const model = getModel('nonexistent/model-v99');
    expect(model).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getModelOrThrow
// ═══════════════════════════════════════════════════════════════════════════

describe('getModelOrThrow', () => {
  it('returns ModelDef for a known model', () => {
    const model = getModelOrThrow('google/gemini-2.0-flash-001');
    expect(model.id).toBe('google/gemini-2.0-flash-001');
    expect(model.tier).toBe('fast');
  });

  it('throws a descriptive error for an unknown model', () => {
    expect(() => getModelOrThrow('fake/model')).toThrow();
    try {
      getModelOrThrow('fake/model');
    } catch (error: any) {
      expect(error.message).toContain('fake/model');
      // Should list available models in the error message
      expect(error.message).toContain('anthropic/claude-haiku-4.5');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getModelDisplayName
// ═══════════════════════════════════════════════════════════════════════════

describe('getModelDisplayName', () => {
  it('returns display name for a known model', () => {
    const name = getModelDisplayName('anthropic/claude-opus-4.6');
    expect(name).toBe('Claude Opus 4.6');
  });

  it('returns raw id for an unknown model', () => {
    const name = getModelDisplayName('unknown/model-xyz');
    expect(name).toBe('unknown/model-xyz');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getFireworksFallback
// ═══════════════════════════════════════════════════════════════════════════

describe('getFireworksFallback', () => {
  it('maps premium models to premium Fireworks model', () => {
    const fallback = getFireworksFallback('anthropic/claude-opus-4.6');
    expect(fallback).toBe(FIREWORKS_TIER_MODELS.premium);
  });

  it.each([
    'anthropic/claude-sonnet-4.6',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4',
  ])('maps standard model "%s" to standard Fireworks model', (modelId) => {
    const fallback = getFireworksFallback(modelId);
    expect(fallback).toBe(FIREWORKS_TIER_MODELS.standard);
  });

  it.each(['anthropic/claude-haiku-4.5', 'google/gemini-2.0-flash-001'])(
    'maps fast model "%s" to fast Fireworks model',
    (modelId) => {
      const fallback = getFireworksFallback(modelId);
      expect(fallback).toBe(FIREWORKS_TIER_MODELS.fast);
    },
  );

  it.each(['qwen/qwen3-32b', 'meta-llama/llama-3.1-8b-instruct'])(
    'maps budget model "%s" to budget Fireworks model',
    (modelId) => {
      const fallback = getFireworksFallback(modelId);
      expect(fallback).toBe(FIREWORKS_TIER_MODELS.budget);
    },
  );

  it('returns null for unknown model', () => {
    const fallback = getFireworksFallback('unknown/model');
    expect(fallback).toBeNull();
  });

  it.each(Object.values(FIREWORKS_TIER_MODELS))(
    'returns null when input is already a Fireworks model: %s',
    (modelId) => {
      const fallback = getFireworksFallback(modelId);
      expect(fallback).toBeNull();
    },
  );
});
