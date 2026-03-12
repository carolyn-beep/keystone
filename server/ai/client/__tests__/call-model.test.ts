/**
 * Tests for FR4: callModel + FR6: CallRecord Observability
 *
 * Validates the unified client's callModel function including timeout,
 * retry with exponential backoff, external abort, CallRecord emission,
 * and the setCallRecorder API.
 *
 * Mocks: provider (OpenRouterProvider), fetch, timers for timeout/backoff.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CallModelOptions, CallRecord, ProviderResponse } from '../types';

// We test callModel/setCallRecorder by importing from index.
// The provider is injected via a mock approach.

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a mock fetch that returns a successful OpenRouter response.
 */
function mockFetchSuccess(content = 'response', usage?: Partial<{ prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: number }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        ...usage,
      },
      model: 'anthropic/claude-haiku-4.5',
    }),
  });
}

/**
 * Creates a mock fetch that returns an error response.
 */
function mockFetchError(status: number, body = `Error ${status}`) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  });
}

/**
 * Creates a mock fetch that fails N times then succeeds.
 */
function mockFetchFailThenSucceed(failCount: number, failStatus: number, successContent = 'recovered') {
  let callCount = 0;
  return vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount <= failCount) {
      return {
        ok: false,
        status: failStatus,
        text: async () => `Error ${failStatus} (attempt ${callCount})`,
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: successContent } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: 'anthropic/claude-haiku-4.5',
      }),
    };
  });
}

/**
 * Creates a mock fetch that throws a network error.
 */
function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('fetch failed'));
}

/**
 * Creates a mock fetch that takes a very long time (simulates timeout).
 */
function mockFetchSlow(delayMs: number) {
  return vi.fn().mockImplementation(async (_url: string, options: { signal?: AbortSignal }) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'slow response' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            model: 'anthropic/claude-haiku-4.5',
          }),
        });
      }, delayMs);

      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }
    });
  });
}

const DEFAULT_OPTIONS: CallModelOptions = {
  model: 'anthropic/claude-haiku-4.5',
  messages: [{ role: 'user', content: 'Hello' }],
  caller: 'test',
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  // Reset module state between tests
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — Happy Path
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — happy path', () => {
  it('returns content, model, usage, costUsd, durationMs, attempts on success', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchSuccess('Hello world', { cost: 0.001 });

    const result = await callModel({ ...DEFAULT_OPTIONS });

    expect(result.content).toBe('Hello world');
    expect(result.model).toBe('anthropic/claude-haiku-4.5');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    expect(result.costUsd).toBe(0.001);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(1);
  });

  it('attempts = 1 on first-try success', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchSuccess('ok');

    const result = await callModel({ ...DEFAULT_OPTIONS });
    expect(result.attempts).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — Timeout
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — timeout', () => {
  it('throws TimeoutError when call exceeds configured timeout', async () => {
    const { callModel } = await import('../index');
    const { TimeoutError } = await import('../errors');
    globalThis.fetch = mockFetchSlow(120_000);

    const promise = callModel({
      ...DEFAULT_OPTIONS,
      timeout: 100,
      retries: 0,
    });

    await vi.advanceTimersByTimeAsync(200);

    await expect(promise).rejects.toThrow(TimeoutError);
  });

  it('per-call timeout override works', async () => {
    const { callModel } = await import('../index');
    const { TimeoutError } = await import('../errors');
    // Model default is 60s, but we override to 50ms
    globalThis.fetch = mockFetchSlow(120_000);

    const promise = callModel({
      ...DEFAULT_OPTIONS,
      timeout: 50,
      retries: 0,
    });

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow(TimeoutError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — Retry
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — retry', () => {
  it('retries on 429 and succeeds', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchFailThenSucceed(1, 429, 'recovered');

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 2,
      timeout: 30_000,
    });

    expect(result.content).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it.each([500, 502, 503])('retries on %i', async (status) => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchFailThenSucceed(1, status, 'recovered');

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 2,
      timeout: 30_000,
    });

    expect(result.content).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it('retries on network errors (fetch throws)', async () => {
    const { callModel } = await import('../index');
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new TypeError('fetch failed');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'recovered' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          model: 'anthropic/claude-haiku-4.5',
        }),
      };
    });

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 2,
      timeout: 30_000,
    });

    expect(result.content).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it.each([400, 401, 403])('does NOT retry on %i (non-retryable)', async (status) => {
    const { callModel } = await import('../index');
    const { NonRetryableError } = await import('../errors');
    globalThis.fetch = mockFetchError(status);

    await expect(
      callModel({ ...DEFAULT_OPTIONS, retries: 3, timeout: 30_000 }),
    ).rejects.toThrow(NonRetryableError);

    // fetch should have been called only once (no retries)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('respects maxRetries limit', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchError(500);

    await expect(
      callModel({ ...DEFAULT_OPTIONS, retries: 2, timeout: 30_000 }),
    ).rejects.toThrow();

    // 1 initial + 2 retries = 3 total calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('attempts count reflects actual number of tries', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchFailThenSucceed(2, 502, 'ok');

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 3,
      timeout: 30_000,
    });

    expect(result.attempts).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — External Abort
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — external abort', () => {
  it('respects external AbortSignal (no retry after abort)', async () => {
    const { callModel } = await import('../index');
    const controller = new AbortController();

    // Fetch that aborts when signal fires
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, opts: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }
        // Abort immediately
        setTimeout(() => controller.abort(), 10);
      });
    });

    await vi.advanceTimersByTimeAsync(0);

    const promise = callModel({
      ...DEFAULT_OPTIONS,
      signal: controller.signal,
      retries: 3,
      timeout: 30_000,
    });

    await vi.advanceTimersByTimeAsync(50);

    await expect(promise).rejects.toThrow();
    // Should only have been called once (no retries after abort)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — Registry Errors
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — registry errors', () => {
  it('throws if model not found in registry', async () => {
    const { callModel } = await import('../index');

    await expect(
      callModel({ ...DEFAULT_OPTIONS, model: 'nonexistent/model-v99' }),
    ).rejects.toThrow(/nonexistent\/model-v99/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR6: CallRecord Observability
// ═══════════════════════════════════════════════════════════════════════════

describe('CallRecord observability', () => {
  it('emits CallRecord with status success on successful call', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchSuccess('ok', { cost: 0.002 });

    await callModel({ ...DEFAULT_OPTIONS, caller: 'test-caller' });

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.status).toBe('success');
    expect(record.caller).toBe('test-caller');
    expect(record.requestedModel).toBe('anthropic/claude-haiku-4.5');
    expect(record.actualModel).toBe('anthropic/claude-haiku-4.5');
    expect(record.provider).toBe('openrouter');
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.attempts).toBe(1);
  });

  it('emits CallRecord with status error after retries exhausted', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchError(500);

    await expect(
      callModel({ ...DEFAULT_OPTIONS, retries: 1, timeout: 30_000 }),
    ).rejects.toThrow();

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('error');
    expect(records[0].error).toBeTruthy();
  });

  it('CallRecord has valid UUID id', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchSuccess('ok');
    await callModel({ ...DEFAULT_OPTIONS });

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(records[0].id).toMatch(uuidRegex);
  });

  it('CallRecord has timestamp as Date', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchSuccess('ok');
    await callModel({ ...DEFAULT_OPTIONS });

    expect(records[0].timestamp).toBeInstanceOf(Date);
  });

  it('caller defaults to "unknown" when not provided', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchSuccess('ok');
    await callModel({
      model: 'anthropic/claude-haiku-4.5',
      messages: [{ role: 'user', content: 'test' }],
      // no caller field
    });

    expect(records[0].caller).toBe('unknown');
  });

  it('setCallRecorder swaps the active recorder', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records1: CallRecord[] = [];
    const records2: CallRecord[] = [];

    globalThis.fetch = mockFetchSuccess('ok');

    setCallRecorder((r) => records1.push(r));
    await callModel({ ...DEFAULT_OPTIONS });
    expect(records1).toHaveLength(1);

    setCallRecorder((r) => records2.push(r));
    await callModel({ ...DEFAULT_OPTIONS });
    expect(records2).toHaveLength(1);
    expect(records1).toHaveLength(1); // first recorder should not get second call
  });

  it('CallRecord includes usage and cost fields', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchSuccess('ok', {
      prompt_tokens: 50,
      completion_tokens: 100,
      total_tokens: 150,
      cost: 0.005,
    });

    await callModel({ ...DEFAULT_OPTIONS, temperature: 0.5, maxTokens: 2048 });

    const record = records[0];
    expect(record.usage).toEqual({
      promptTokens: 50,
      completionTokens: 100,
      totalTokens: 150,
    });
    expect(record.costUsd).toBe(0.005);
    expect(record.temperature).toBe(0.5);
    expect(record.maxTokens).toBe(2048);
  });
});
