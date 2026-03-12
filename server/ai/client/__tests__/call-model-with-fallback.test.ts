/**
 * Tests for FR5: callModelWithFallback
 *
 * Validates fallback chain behavior: tries models in order,
 * returns first success, collects errors, throws AllModelsFailed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CallRecord } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

function mockFetchForModel(modelResponses: Record<string, { ok: boolean; status: number; content?: string }>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(async (_url: string, options: { body: string }) => {
    callIndex++;
    const body = JSON.parse(options.body);
    const modelId = body.model;
    const response = modelResponses[modelId];

    if (!response) {
      return {
        ok: false,
        status: 500,
        text: async () => `Unexpected model: ${modelId}`,
      };
    }

    if (response.ok) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: response.content ?? `response from ${modelId}` } }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          model: modelId,
        }),
      };
    }

    return {
      ok: false,
      status: response.status,
      text: async () => `Error ${response.status} from ${modelId}`,
    };
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// Happy Path
// ═══════════════════════════════════════════════════════════════════════════

describe('callModelWithFallback — happy path', () => {
  it('returns result from first model that succeeds', async () => {
    const { callModelWithFallback } = await import('../index');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: true, status: 200, content: 'sonnet response' },
    });

    const result = await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
      messages: [{ role: 'user', content: 'test' }],
      caller: 'test',
      timeout: 30_000,
      retries: 0,
    });

    expect(result.content).toBe('sonnet response');
    expect(result.model).toBe('anthropic/claude-sonnet-4');
  });

  it('result.model reflects which model actually responded', async () => {
    const { callModelWithFallback } = await import('../index');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: false, status: 400 },
      'anthropic/claude-haiku-4.5': { ok: true, status: 200, content: 'haiku saved the day' },
    });

    const result = await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
      messages: [{ role: 'user', content: 'test' }],
      caller: 'test',
      timeout: 30_000,
      retries: 0,
    });

    expect(result.model).toBe('anthropic/claude-haiku-4.5');
    expect(result.content).toBe('haiku saved the day');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fallback Behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('callModelWithFallback — fallback', () => {
  it('falls to second model when first fails', async () => {
    const { callModelWithFallback } = await import('../index');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: false, status: 500 },
      'anthropic/claude-haiku-4.5': { ok: true, status: 200, content: 'fallback result' },
    });

    const result = await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
      messages: [{ role: 'user', content: 'test' }],
      caller: 'test',
      timeout: 30_000,
      retries: 0,
    });

    expect(result.content).toBe('fallback result');
    expect(result.model).toBe('anthropic/claude-haiku-4.5');
  });

  it('falls to third model when second also fails', async () => {
    const { callModelWithFallback } = await import('../index');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-opus-4.6': { ok: false, status: 500 },
      'anthropic/claude-sonnet-4': { ok: false, status: 502 },
      'google/gemini-2.0-flash-001': { ok: true, status: 200, content: 'gemini saves' },
    });

    const result = await callModelWithFallback({
      models: [
        'anthropic/claude-opus-4.6',
        'anthropic/claude-sonnet-4',
        'google/gemini-2.0-flash-001',
      ],
      messages: [{ role: 'user', content: 'test' }],
      caller: 'test',
      timeout: 30_000,
      retries: 0,
    });

    expect(result.content).toBe('gemini saves');
    expect(result.model).toBe('google/gemini-2.0-flash-001');
  });

  it('throws AllModelsFailed when all models fail', async () => {
    const { callModelWithFallback } = await import('../index');
    const { AllModelsFailed } = await import('../errors');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: false, status: 500 },
      'anthropic/claude-haiku-4.5': { ok: false, status: 400 },
    });

    await expect(
      callModelWithFallback({
        models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
        messages: [{ role: 'user', content: 'test' }],
        caller: 'test',
        timeout: 30_000,
        retries: 0,
      }),
    ).rejects.toThrow(AllModelsFailed);
  });

  it('AllModelsFailed.errors includes error from each model', async () => {
    const { callModelWithFallback } = await import('../index');
    const { AllModelsFailed } = await import('../errors');

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: false, status: 500 },
      'anthropic/claude-haiku-4.5': { ok: false, status: 400 },
    });

    try {
      await callModelWithFallback({
        models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
        messages: [{ role: 'user', content: 'test' }],
        caller: 'test',
        timeout: 30_000,
        retries: 0,
      });
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AllModelsFailed);
      const allFailed = err as InstanceType<typeof AllModelsFailed>;
      expect(allFailed.errors).toHaveLength(2);
      expect(allFailed.models).toEqual([
        'anthropic/claude-sonnet-4',
        'anthropic/claude-haiku-4.5',
      ]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CallRecord Emission in Fallback
// ═══════════════════════════════════════════════════════════════════════════

describe('callModelWithFallback — CallRecord emission', () => {
  it('emits CallRecord for each model attempt', async () => {
    const { callModelWithFallback, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchForModel({
      'anthropic/claude-sonnet-4': { ok: false, status: 500 },
      'anthropic/claude-haiku-4.5': { ok: true, status: 200, content: 'ok' },
    });

    await callModelWithFallback({
      models: ['anthropic/claude-sonnet-4', 'anthropic/claude-haiku-4.5'],
      messages: [{ role: 'user', content: 'test' }],
      caller: 'test-fallback',
      timeout: 30_000,
      retries: 0,
    });

    // Should have 2 records: one for the failed model, one for the successful model
    expect(records).toHaveLength(2);
    expect(records[0].status).toBe('error');
    expect(records[0].requestedModel).toBe('anthropic/claude-sonnet-4');
    expect(records[1].status).toBe('success');
    expect(records[1].requestedModel).toBe('anthropic/claude-haiku-4.5');
  });
});
