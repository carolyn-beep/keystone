import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterProvider } from '../providers/openrouter';
import { NonRetryableError, RateLimitError, RetryableError } from '../errors';
import type { ProviderRequest } from '../types';

const TEST_API_KEY = 'test-openrouter-api-key';

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

function mockFetchSuccess(content = 'ok') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: makeHeaders(),
    json: async () => ({
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        cost: 0.0042,
      },
      model: 'anthropic/claude-haiku-4.5',
    }),
  });
}

function mockFetchError(status: number, body?: string, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: makeHeaders(headers),
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

describe('OpenRouterProvider', () => {
  it('sends POST request with auth headers', async () => {
    const fetchMock = mockFetchSuccess('response');
    globalThis.fetch = fetchMock;

    const provider = makeProvider();
    await provider.call(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('maps system, response format, and max_tokens', async () => {
    const fetchMock = mockFetchSuccess('{}');
    globalThis.fetch = fetchMock;

    const provider = makeProvider();
    await provider.call(makeRequest({
      system: 'You are strict',
      maxTokens: 111,
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'result',
          strict: true,
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
        },
      },
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are strict' });
    expect(body.max_tokens).toBe(111);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'result',
        strict: true,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      },
    });
  });

  it('normalizes successful response', async () => {
    globalThis.fetch = mockFetchSuccess('hello');
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.content).toBe('hello');
    expect(result.model).toBe('anthropic/claude-haiku-4.5');
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
    expect(result.costUsd).toBe(0.0042);
  });

  it('classifies 429 with provider + retryAfterMs', async () => {
    globalThis.fetch = mockFetchError(429, 'Too many requests', { 'Retry-After': '2' });
    const provider = makeProvider();

    let thrown: unknown;
    try {
      await provider.call(makeRequest());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RateLimitError);
    const typed = thrown as RateLimitError;
    expect(typed.provider).toBe('openrouter');
    expect(typed.retryAfterMs).toBe(2_000);
  });

  it.each([500, 502, 503])('classifies %i as retryable', async (status) => {
    globalThis.fetch = mockFetchError(status, 'Server issue');
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toBeInstanceOf(RetryableError);
  });

  it.each([400, 401, 403])('classifies %i as non-retryable', async (status) => {
    globalThis.fetch = mockFetchError(status, 'Bad request');
    const provider = makeProvider();

    await expect(provider.call(makeRequest())).rejects.toBeInstanceOf(NonRetryableError);
  });
});
