/**
 * Tests for FR3: OpenRouter Provider
 *
 * Validates request construction, response parsing, usage mapping,
 * cost extraction, signal passthrough, and error classification.
 * Mocks globalThis.fetch for all tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterProvider } from '../providers/openrouter';
import { RetryableError, NonRetryableError, RateLimitError } from '../errors';
import type { ProviderRequest } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

const TEST_API_KEY = 'test-key-abc123';

function makeProvider(): OpenRouterProvider {
  return new OpenRouterProvider(TEST_API_KEY);
}

function makeRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: 'anthropic/claude-haiku-4.5',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

function mockFetchSuccess(content: string, usage?: object, cost?: number) {
  const responseUsage = {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
    ...(cost !== undefined ? { cost } : {}),
    ...usage,
  };

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: responseUsage,
      model: 'anthropic/claude-haiku-4.5',
    }),
  });
}

function mockFetchError(status: number, body?: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body ?? `Error ${status}`,
  });
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ═══════════════════════════════════════════════════════════════════════════
// Request Construction
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenRouterProvider — request construction', () => {
  it('sends POST to correct URL with auth headers', async () => {
    const fetchMock = mockFetchSuccess('response');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_API_KEY}`);
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('includes model and messages in request body', async () => {
    const fetchMock = mockFetchSuccess('ok');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: 'Test question' }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('google/gemini-2.0-flash-001');
    expect(body.messages).toEqual(
      expect.arrayContaining([{ role: 'user', content: 'Test question' }]),
    );
  });

  it('prepends system message when provided', async () => {
    const fetchMock = mockFetchSuccess('ok');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hi' }],
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('includes temperature and max_tokens when provided', async () => {
    const fetchMock = mockFetchSuccess('ok');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      temperature: 0.7,
      maxTokens: 1024,
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(1024);
  });

  it('maps responseFormat jsonSchema to OpenRouter json_schema format', async () => {
    const fetchMock = mockFetchSuccess('{}');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'test_schema',
          strict: true,
          schema: { type: 'object', properties: { x: { type: 'string' } } },
        },
      },
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'test_schema',
        strict: true,
        schema: { type: 'object', properties: { x: { type: 'string' } } },
      },
    });
  });

  it('maps responseFormat json_object type', async () => {
    const fetchMock = mockFetchSuccess('{}');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      responseFormat: { type: 'json_object' },
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('passes signal through to fetch', async () => {
    const fetchMock = mockFetchSuccess('ok');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();
    const controller = new AbortController();

    await provider.call(makeRequest({ signal: controller.signal }));

    const options = fetchMock.mock.calls[0][1];
    expect(options.signal).toBe(controller.signal);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Response Parsing
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenRouterProvider — response parsing', () => {
  it('extracts content from choices[0].message.content', async () => {
    globalThis.fetch = mockFetchSuccess('Hello world');
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.content).toBe('Hello world');
  });

  it('maps usage fields from snake_case to camelCase', async () => {
    globalThis.fetch = mockFetchSuccess('ok', {
      prompt_tokens: 100,
      completion_tokens: 200,
      total_tokens: 300,
    });
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
    });
  });

  it('extracts costUsd from usage.cost', async () => {
    globalThis.fetch = mockFetchSuccess('ok', { cost: 0.0042 });
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.costUsd).toBe(0.0042);
  });

  it('returns model from response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'anthropic/claude-haiku-4.5',
      }),
    });
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.model).toBe('anthropic/claude-haiku-4.5');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Error Classification
// ═══════════════════════════════════════════════════════════════════════════

describe('OpenRouterProvider — error classification', () => {
  it('throws RateLimitError for 429', async () => {
    globalThis.fetch = mockFetchError(429);
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toThrow(RateLimitError);
  });

  it.each([500, 502, 503])('throws RetryableError for %i', async (status) => {
    globalThis.fetch = mockFetchError(status);
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toThrow(RetryableError);
  });

  it.each([400, 401, 402, 403])('throws NonRetryableError for %i', async (status) => {
    globalThis.fetch = mockFetchError(status);
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toThrow(NonRetryableError);
  });

  it('throws RetryableError for empty choices array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      }),
    });
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toThrow(RetryableError);
  });

  it('throws RetryableError for null content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: null } }],
        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
      }),
    });
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toThrow(RetryableError);
  });
});
