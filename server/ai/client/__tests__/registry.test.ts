/**
 * Tests for FR1: Model Registry
 *
 * Validates MODEL_REGISTRY contents, lookup functions (getModel, getModelOrThrow,
 * getModelDisplayName), and model metadata correctness.
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_REGISTRY,
  getModel,
  getModelOrThrow,
  getModelDisplayName,
} from '../registry';
import type { ModelDef } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Registry Contents
// ═══════════════════════════════════════════════════════════════════════════

describe('MODEL_REGISTRY', () => {
  const EXPECTED_MODELS = [
    'anthropic/claude-opus-4.6',
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-sonnet-4',
    'anthropic/claude-haiku-4.5',
    'google/gemini-2.0-flash-001',
    'qwen/qwen3-32b',
    'meta-llama/llama-3.1-8b-instruct',
  ];

  it('contains all 7 expected models', () => {
    const registeredIds = Object.keys(MODEL_REGISTRY);
    for (const modelId of EXPECTED_MODELS) {
      expect(registeredIds).toContain(modelId);
    }
    expect(registeredIds).toHaveLength(7);
  });

  it.each(EXPECTED_MODELS)('model "%s" has required metadata fields', (modelId) => {
    const model = MODEL_REGISTRY[modelId];
    expect(model).toBeDefined();
    expect(model.id).toBe(modelId);
    expect(model.provider).toBe('openrouter');
    expect(['premium', 'standard', 'fast', 'budget']).toContain(model.tier);
    expect(model.displayName).toBeTruthy();
    expect(typeof model.defaultTimeout).toBe('number');
    expect(model.defaultTimeout).toBeGreaterThan(0);
    expect(typeof model.defaultMaxRetries).toBe('number');
    expect(model.defaultMaxRetries).toBeGreaterThanOrEqual(0);
  });

  it('assigns correct tiers', () => {
    expect(MODEL_REGISTRY['anthropic/claude-opus-4.6'].tier).toBe('premium');
    expect(MODEL_REGISTRY['anthropic/claude-sonnet-4.5'].tier).toBe('standard');
    expect(MODEL_REGISTRY['anthropic/claude-sonnet-4'].tier).toBe('standard');
    expect(MODEL_REGISTRY['anthropic/claude-haiku-4.5'].tier).toBe('fast');
    expect(MODEL_REGISTRY['google/gemini-2.0-flash-001'].tier).toBe('fast');
    expect(MODEL_REGISTRY['qwen/qwen3-32b'].tier).toBe('budget');
    expect(MODEL_REGISTRY['meta-llama/llama-3.1-8b-instruct'].tier).toBe('budget');
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
