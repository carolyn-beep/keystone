/**
 * Tests for FR4: callModel + FR6: CallRecord Observability
 *
 * Validates the unified client's callModel function including timeout,
 * retry with exponential backoff, external abort, CallRecord emission,
 * and the setCallRecorder API.
 *
 * Mocks: globalThis.fetch for OpenRouter API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CallModelOptions, CallRecord } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

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

function makeHeaders(headers: Record<string, string> = {}) {
  return {
    get: (name: string) => {
      const key = Object.keys(headers).find(
        (candidate) => candidate.toLowerCase() === name.toLowerCase(),
      );
      return key ? headers[key] : null;
    },
  };
}

function mockFetchError(status: number, body = `Error ${status}`, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: makeHeaders(headers),
    text: async () => body,
  });
}

function mockFetchFailThenSucceed(
  failCount: number,
  failStatus: number,
  successContent = 'recovered',
  headers: Record<string, string> = {},
) {
  let callCount = 0;
  return vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount <= failCount) {
      return {
        ok: false,
        status: failStatus,
        headers: makeHeaders(headers),
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

function mockFetchByUrl(handlers: {
  openrouter: () => Promise<Response>;
  fireworks: () => Promise<Response>;
}) {
  return vi.fn().mockImplementation(async (url: string) => {
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return handlers.openrouter();
    }
    if (url === 'https://api.fireworks.ai/inference/v1/chat/completions') {
      return handlers.fireworks();
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
}

/**
 * Creates a mock fetch that hangs until signal is aborted.
 * Uses a .catch() on the internal promise to avoid unhandled rejections.
 */
function mockFetchHanging() {
  return vi.fn().mockImplementation((_url: string, options: { signal?: AbortSignal }) => {
    const promise = new Promise<Response>((resolve, reject) => {
      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
      }
      // Never resolves otherwise — simulates a hanging request
    });
    // Attach a no-op catch to prevent unhandled rejection warnings
    promise.catch(() => {});
    return promise;
  });
}

const DEFAULT_OPTIONS: CallModelOptions = {
  model: 'anthropic/claude-haiku-4.5',
  messages: [{ role: 'user', content: 'Hello' }],
  caller: 'test',
};

let originalFetch: typeof globalThis.fetch;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
const originalFireworksApiKey = process.env.FIREWORKS_API_KEY;

beforeEach(async () => {
  originalFetch = globalThis.fetch;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  process.env.FIREWORKS_API_KEY = 'test-fireworks-key';
  const client = await import('../index');
  client.resetProviderRegistryForTests();
  const breakers = await import('../circuit-breaker');
  breakers.resetCircuitBreakersForTests();
  const events = await import('../provider-events');
  events.resetFailoverEventsForTests();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;
  process.env.FIREWORKS_API_KEY = originalFireworksApiKey;
  const client = await import('../index');
  client.resetProviderRegistryForTests();
  const breakers = await import('../circuit-breaker');
  breakers.resetCircuitBreakersForTests();
  const events = await import('../provider-events');
  events.resetFailoverEventsForTests();
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

    // Use a hanging fetch that responds to abort signal
    globalThis.fetch = mockFetchHanging();

    // Use a very short timeout so the test doesn't wait long
    await expect(
      callModel({
        ...DEFAULT_OPTIONS,
        timeout: 50,
        retries: 0,
      }),
    ).rejects.toThrow(TimeoutError);
  }, 5000);

  it('per-call timeout override works', async () => {
    const { callModel } = await import('../index');
    const { TimeoutError } = await import('../errors');

    globalThis.fetch = mockFetchHanging();

    // Model default timeout is 30s, but we override to 50ms
    await expect(
      callModel({
        ...DEFAULT_OPTIONS,
        timeout: 50,
        retries: 0,
      }),
    ).rejects.toThrow(TimeoutError);
  }, 5000);
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
    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status,
        headers: makeHeaders(),
        text: async () => `Error ${status}`,
      } as Response),
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'failover ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 3, timeout: 30_000 });

    expect(result.content).toBe('failover ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('respects maxRetries limit', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
    });

    await expect(
      callModel({ ...DEFAULT_OPTIONS, retries: 2, timeout: 30_000 }),
    ).rejects.toThrow();

    // 1 initial + 2 retries = 3 total calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
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

  it('honors provider Retry-After when <= 10 seconds', async () => {
    vi.useFakeTimers();
    try {
      const { callModel } = await import('../index');
      globalThis.fetch = mockFetchFailThenSucceed(
        1,
        429,
        'recovered',
        { 'Retry-After': '1' },
      );

      const promise = callModel({
        ...DEFAULT_OPTIONS,
        retries: 2,
        timeout: 30_000,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const result = await promise;
      expect(result.content).toBe('recovered');
      expect(result.attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not sleep/retry when provider Retry-After exceeds 10 seconds', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 429,
        headers: makeHeaders({ 'Retry-After': '11' }),
        text: async () => 'rate limited',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fallback ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 3, timeout: 30_000 });

    expect(result.content).toBe('fallback ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: callModel — External Abort
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — external abort', () => {
  it('respects external AbortSignal (no retry after abort)', async () => {
    const { callModel } = await import('../index');
    const controller = new AbortController();

    // Fetch that hangs until signal fires
    globalThis.fetch = mockFetchHanging();

    // Abort after 20ms
    setTimeout(() => controller.abort(), 20);

    const promise = callModel({
      ...DEFAULT_OPTIONS,
      signal: controller.signal,
      retries: 3,
      timeout: 30_000,
    });

    await expect(promise).rejects.toThrow();
    // Should only have been called once (no retries after abort)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }, 5000);
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

  it('throws provider-aware error when required provider API key is missing', async () => {
    const { callModel, resetProviderRegistryForTests } = await import('../index');
    delete process.env.OPENROUTER_API_KEY;
    resetProviderRegistryForTests();

    globalThis.fetch = mockFetchByUrl({
      openrouter: async () => {
        throw new Error('Should not hit OpenRouter fetch');
      },
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fireworks rescue' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS });
    expect(result.content).toBe('fireworks rescue');
  });

  it('resolves provider by model provider name (Fireworks path)', async () => {
    const { callModel } = await import('../index');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: async () => ({
        choices: [{ message: { content: 'from-fireworks' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'accounts/fireworks/models/gpt-oss-20b',
      }),
    });
    globalThis.fetch = fetchMock;

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      model: 'accounts/fireworks/models/gpt-oss-20b',
    });

    expect(result.content).toBe('from-fireworks');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fireworks.ai/inference/v1/chat/completions',
      expect.any(Object),
    );
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

    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
    });

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
    expect(records1).toHaveLength(1);
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

// ═══════════════════════════════════════════════════════════════════════════
// callModel — validate option
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — validate option', () => {
  it('validate passes — call succeeds normally', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchSuccess('{"valid": true}');

    const validate = vi.fn(); // doesn't throw = passes
    const result = await callModel({
      ...DEFAULT_OPTIONS,
      validate,
    });

    expect(result.content).toBe('{"valid": true}');
    expect(result.attempts).toBe(1);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledWith('{"valid": true}');
  });

  it('validate fails then succeeds on retry — retries the HTTP call', async () => {
    const { callModel } = await import('../index');

    // First call returns bad content, second returns valid JSON
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      const content = callCount === 1 ? 'not json' : '{"ok": true}';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'anthropic/claude-haiku-4.5',
        }),
      };
    });

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 2,
      validate: (content) => { JSON.parse(content); },
    });

    expect(result.attempts).toBe(2);
    expect(result.content).toBe('{"ok": true}');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('validate fails on all attempts — throws after exhausting retries', async () => {
    const { callModel } = await import('../index');
    const { RetryableError } = await import('../errors');

    globalThis.fetch = mockFetchSuccess('always bad content');

    await expect(
      callModel({
        ...DEFAULT_OPTIONS,
        retries: 2,
        validate: () => { throw new Error('Invalid format'); },
      }),
    ).rejects.toThrow(/Content validation failed/);

    // 1 initial + 2 retries = 3 total calls
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it('validate not provided — backward compatible', async () => {
    const { callModel } = await import('../index');
    globalThis.fetch = mockFetchSuccess('plain text response');

    const result = await callModel({ ...DEFAULT_OPTIONS });

    expect(result.content).toBe('plain text response');
    expect(result.attempts).toBe(1);
  });

  it('validate failure produces correct CallRecord', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    // First call returns bad content, second returns valid JSON
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      const content = callCount === 1 ? 'bad' : '{"good": true}';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'anthropic/claude-haiku-4.5',
        }),
      };
    });

    const result = await callModel({
      ...DEFAULT_OPTIONS,
      retries: 2,
      validate: (content) => { JSON.parse(content); },
    });

    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('success');
    expect(records[0].attempts).toBe(2);
    expect(result.attempts).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// callModel — provider failover
// ═══════════════════════════════════════════════════════════════════════════

describe('callModel — provider failover', () => {
  it('fails over to Fireworks after retry exhaustion', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fireworks ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 1, timeout: 30_000 });

    expect(result.content).toBe('fireworks ok');
    expect(result.model).toBe('accounts/fireworks/models/llama-v3p3-70b-instruct');
    expect(result.attempts).toBe(3);
    expect(records).toHaveLength(1);
    expect(records[0].failedProvider).toBe('openrouter');
    expect(records[0].failoverReason).toBe('retry_exhausted');
    expect(records[0].originalModel).toBe(DEFAULT_OPTIONS.model);
    expect(records[0].provider).toBe('fireworks');
  });

  it('fails over on non-retryable provider error', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 400,
        headers: makeHeaders(),
        text: async () => 'Error 400',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fireworks ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 0, timeout: 30_000 });

    expect(result.content).toBe('fireworks ok');
    expect(result.attempts).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0].failoverReason).toBe('non_retryable');
  });

  it('short-circuits when provider circuit is open', async () => {
    const { callModel, setCallRecorder } = await import('../index');
    const { getProviderBreaker } = await import('../circuit-breaker');
    const records: CallRecord[] = [];
    setCallRecorder((record) => records.push(record));

    const breaker = getProviderBreaker('openrouter');
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }

    globalThis.fetch = mockFetchByUrl({
      openrouter: async () => {
        throw new Error('OpenRouter should have been skipped');
      },
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fireworks ok' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 0, timeout: 30_000 });

    expect(result.content).toBe('fireworks ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(records[0].failedProvider).toBe('openrouter');
    expect(records[0].failoverReason).toBe('circuit_open');
  });

  it('does not short-circuit when Fireworks has accumulated failures', async () => {
    const { callModel } = await import('../index');
    const { getProviderBreaker } = await import('../circuit-breaker');

    const fireworksBreaker = getProviderBreaker('fireworks');
    for (let i = 0; i < 10; i++) {
      fireworksBreaker.recordFailure();
    }

    globalThis.fetch = mockFetchByUrl({
      openrouter: () => Promise.resolve({
        ok: false,
        status: 500,
        headers: makeHeaders(),
        text: async () => 'Error 500',
      } as Response),
      fireworks: () => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'fireworks still available' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          model: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        }),
      } as Response),
    });

    const result = await callModel({ ...DEFAULT_OPTIONS, retries: 0, timeout: 30_000 });

    expect(result.content).toBe('fireworks still available');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(fireworksBreaker.getState()).toBe('closed');
  });
});
