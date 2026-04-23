import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FireworksProvider } from '../providers/fireworks';
import { NonRetryableError, RateLimitError, RetryableError } from '../errors';
import type { ProviderRequest } from '../types';

const TEST_API_KEY = 'test-fireworks-api-key';

function makeProvider(): FireworksProvider {
  return new FireworksProvider(TEST_API_KEY);
}

function makeRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    model: 'accounts/fireworks/models/gpt-oss-20b',
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

function mockFetchSuccess(content = '{"ok":true}') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: makeHeaders(),
    json: async () => ({
      choices: [{ message: { content } }],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
      },
      model: 'accounts/fireworks/models/gpt-oss-20b',
      reasoning: 'ignored',
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

describe('FireworksProvider', () => {
  it('sends request to Fireworks endpoint with auth header', async () => {
    const fetchMock = mockFetchSuccess('{}');
    globalThis.fetch = fetchMock;

    const provider = makeProvider();
    await provider.call(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.fireworks.ai/inference/v1/chat/completions');
    expect(options.headers.Authorization).toBe(`Bearer ${TEST_API_KEY}`);
  });

  it('reinforces json_schema response format with extra system message', async () => {
    const fetchMock = mockFetchSuccess('{"answer":"ok"}');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'answer_schema',
          strict: true,
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        },
      },
      system: 'Return JSON',
    }));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const systemMessages = body.messages.filter((msg: any) => msg.role === 'system');
    expect(systemMessages).toHaveLength(2);
    expect(systemMessages[0].content).toBe('Return JSON');
    expect(systemMessages[1].content).toContain('strictly conforms to the schema');
    expect(body.response_format).toBeTruthy();
  });

  it('preserves caller max_tokens exactly and does not synthesize when omitted', async () => {
    const fetchMock = mockFetchSuccess('ok');
    globalThis.fetch = fetchMock;
    const provider = makeProvider();

    await provider.call(makeRequest({ maxTokens: 321 }));
    let body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(321);

    fetchMock.mockClear();
    await provider.call(makeRequest());
    body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('uses parseable message.content as canonical success output', async () => {
    globalThis.fetch = mockFetchSuccess('{"value":42}');
    const provider = makeProvider();

    const result = await provider.call(makeRequest());
    expect(result.content).toBe('{"value":42}');
    expect(result.model).toBe('accounts/fireworks/models/gpt-oss-20b');
  });

  it('classifies 429 with provider + retryAfterMs', async () => {
    globalThis.fetch = mockFetchError(429, 'rate limited', { 'retry-after': '1' });
    const provider = makeProvider();

    let thrown: unknown;
    try {
      await provider.call(makeRequest());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RateLimitError);
    const typed = thrown as RateLimitError;
    expect(typed.provider).toBe('fireworks');
    expect(typed.retryAfterMs).toBe(1_000);
  });

  it.each([500, 502, 503])('classifies %i as retryable', async (status) => {
    globalThis.fetch = mockFetchError(status);
    const provider = makeProvider();
    await expect(provider.call(makeRequest())).rejects.toBeInstanceOf(RetryableError);
  });

  it.each([400, 401, 403])('classifies %i as non-retryable', async (status) => {
    globalThis.fetch = mockFetchError(status);
    const provider = makeProvider();
    await expect(provider.call(makeRequest())).rejects.toBeInstanceOf(NonRetryableError);
  });
});
