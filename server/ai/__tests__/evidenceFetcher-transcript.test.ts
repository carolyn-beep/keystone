/**
 * Tests for FR5: Evidence Fetcher - cachedTranscript parameter
 *
 * Validates that fetchEvidenceForFact() uses cachedTranscript
 * as evidence when provided, skipping URL fetch and AI search.
 *
 * Mocks: unified AI client, globalThis.fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../client', () => ({
  callModelWithFallback: vi.fn(),
}));

import { callModelWithFallback } from '../client';
import { fetchEvidenceForFact } from '../evidenceFetcher';

const mockCallModelWithFallback = vi.mocked(callModelWithFallback);
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('fetchEvidenceForFact - cachedTranscript', () => {
  it('uses cachedTranscript as evidence when provided, skipping URL fetch', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const result = await fetchEvidenceForFact(
      'Testing improves retention',
      'https://www.youtube.com/watch?v=abc123',
      undefined,
      'This is the cached transcript about how testing improves retention by 23 percent.'
    );

    expect(result.content).toBe(
      'This is the cached transcript about how testing improves retention by 23 percent.'
    );
    expect(result.error).toBeNull();
    expect(result.url).toBe('https://www.youtube.com/watch?v=abc123');
    // Should NOT have fetched the URL or called AI
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
  });

  it('falls back to existing behavior when cachedTranscript is null', async () => {
    // Set up fetch to return content (existing path)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html><body>Some web content that is long enough to pass the threshold check.</body></html>'),
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    const result = await fetchEvidenceForFact(
      'Testing improves retention',
      'https://example.com/article',
      undefined,
      null
    );

    // Should have attempted the URL fetch
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('falls back to existing behavior when cachedTranscript is undefined', async () => {
    // No URL in source, should go to AI search
    mockCallModelWithFallback.mockResolvedValue({
      content: 'AI found evidence',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 200,
      attempts: 1,
    });

    const result = await fetchEvidenceForFact(
      'Testing improves retention',
      'Research paper on testing',
      undefined,
      undefined
    );

    // Should have gone to AI search path
    expect(mockCallModelWithFallback).toHaveBeenCalled();
  });

  it('falls back to existing behavior when cachedTranscript is empty string', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: 'AI found evidence',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 200,
      attempts: 1,
    });

    const result = await fetchEvidenceForFact(
      'Testing improves retention',
      'No URL here',
      undefined,
      ''
    );

    // Empty string should not be used as evidence
    expect(mockCallModelWithFallback).toHaveBeenCalled();
  });
});
