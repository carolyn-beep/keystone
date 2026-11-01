/**
 * Tests for FR2: Pangram HTTP client + startup guard.
 *
 * Stubs global fetch to exercise happy path + error classification branches.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  analyzeText,
  assertPangramConfigured,
} from '../client';
import {
  PangramHttpError,
  PangramNetworkError,
  PangramResponseError,
  PangramTimeoutError,
  type PangramResponse,
} from '../types';

const ORIGINAL_KEY = process.env.PANGRAM_API_KEY;

beforeEach(() => {
  process.env.PANGRAM_API_KEY = 'test-pangram-key';
});

afterEach(() => {
  process.env.PANGRAM_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe('assertPangramConfigured', () => {
  it('returns silently when PANGRAM_API_KEY is set', () => {
    process.env.PANGRAM_API_KEY = 'valid-key';
    expect(() => assertPangramConfigured()).not.toThrow();
  });

  it('throws when PANGRAM_API_KEY is missing', () => {
    delete process.env.PANGRAM_API_KEY;
    expect(() => assertPangramConfigured()).toThrowError(/PANGRAM_API_KEY/);
  });

  it('throws when PANGRAM_API_KEY is an empty string', () => {
    process.env.PANGRAM_API_KEY = '';
    expect(() => assertPangramConfigured()).toThrowError(/PANGRAM_API_KEY/);
  });

  it('throws when PANGRAM_API_KEY is whitespace-only', () => {
    process.env.PANGRAM_API_KEY = '   ';
    expect(() => assertPangramConfigured()).toThrowError(/PANGRAM_API_KEY/);
  });
});

describe('analyzeText', () => {
  const validResponse: PangramResponse = {
    text: 'some prose',
    version: '3.0',
    prediction_short: 'AI-Assisted',
    fraction_ai: 0.1,
    fraction_ai_assisted: 0.7,
    fraction_human: 0.2,
    num_ai_segments: 1,
    num_ai_assisted_segments: 2,
    num_human_segments: 3,
    headline: 'Likely AI-Assisted',
    prediction: 'Mostly AI-assisted with light human edits',
    windows: [
      {
        text: 'Hello world',
        label: 'AI-Generated',
        ai_assistance_score: 0.9,
        confidence: 'High',
        start_index: 0,
        end_index: 11,
        word_count: 2,
        token_length: 3,
      },
    ],
  };

  it('returns parsed PangramResponse on 2xx with valid JSON', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await analyzeText({ text: 'some prose' });

    expect(result.prediction_short).toBe('AI-Assisted');
    expect(result.fraction_ai_assisted).toBe(0.7);
    expect(result.version).toBe('3.0');
    expect(result.windows).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('posts to the V3 endpoint with the documented request body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );

    await analyzeText({ text: 'some prose', public_dashboard_link: true });

    expect(fetchSpy.mock.calls[0][0]).toBe('https://text.api.pangram.com/v3');
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'some prose',
      public_dashboard_link: true,
    });
  });

  it('sends x-api-key header from PANGRAM_API_KEY', async () => {
    process.env.PANGRAM_API_KEY = 'my-secret';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );

    await analyzeText({ text: 'hi' });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('my-secret');
  });

  it('throws PangramHttpError with status + body excerpt on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal Server Error -- detail', { status: 500 }),
    );

    await expect(analyzeText({ text: 'hi' })).rejects.toMatchObject({
      name: 'PangramHttpError',
      status: 500,
      bodyExcerpt: expect.stringContaining('Internal Server Error'),
    });
  });

  it('truncates very long error bodies in the excerpt', async () => {
    const longBody = 'x'.repeat(2000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(longBody, { status: 502 }),
    );

    try {
      await analyzeText({ text: 'hi' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PangramHttpError);
      expect((err as PangramHttpError).bodyExcerpt.length).toBeLessThan(longBody.length);
      expect((err as PangramHttpError).bodyExcerpt).toMatch(/truncated/);
    }
  });

  it('throws PangramNetworkError when fetch rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed'),
    );

    await expect(analyzeText({ text: 'hi' })).rejects.toBeInstanceOf(
      PangramNetworkError,
    );
  });

  it('throws PangramTimeoutError when AbortController fires', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal | undefined;
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    await expect(
      analyzeText({ text: 'hi' }, { timeoutMs: 25 }),
    ).rejects.toBeInstanceOf(PangramTimeoutError);
  });

  it('throws PangramResponseError on malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(analyzeText({ text: 'hi' })).rejects.toBeInstanceOf(
      PangramResponseError,
    );
  });

  it('throws PangramResponseError when response is missing prediction_short', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ foo: 'bar' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(analyzeText({ text: 'hi' })).rejects.toBeInstanceOf(
      PangramResponseError,
    );
  });

  it('throws PangramResponseError when response is missing documented numeric fields', async () => {
    const { num_ai_segments: _numAiSegments, ...invalidResponse } = validResponse;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(invalidResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(analyzeText({ text: 'hi' })).rejects.toBeInstanceOf(
      PangramResponseError,
    );
  });
});
