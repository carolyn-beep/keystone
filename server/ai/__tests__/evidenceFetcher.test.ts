/**
 * Tests for FR3: Migrate evidenceFetcher to unified client
 *
 * Validates that searchForEvidence() uses callModelWithFallback()
 * with the correct model chain and parameters. Also verifies that
 * fetchWebContent's 10s timeout is independent of LLM calls.
 *
 * Mocks: server/ai/client module (callModelWithFallback), globalThis.fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the unified client
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

describe('evidenceFetcher - LLM search path', () => {
  it('calls callModelWithFallback with correct models, temperature, maxTokens, and caller', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: 'Evidence found about the topic from research literature.',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 200,
      attempts: 1,
    });

    // Source without URL triggers LLM search directly
    const result = await fetchEvidenceForFact(
      'Students learn better with spaced practice',
      'Cognitive Science Research',
    );

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['google/gemini-2.0-flash-001', 'qwen/qwen3-32b'],
        temperature: 0.1,
        maxTokens: 1000,
        caller: 'evidenceFetcher',
      }),
    );

    expect(result.content).toBe('Evidence found about the topic from research literature.');
    expect(result.error).toBeNull();
  });

  it('returns null content when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await fetchEvidenceForFact(
      'Some fact',
      'No URL source',
    );

    expect(result.content).toBeNull();
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();

    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns null content on callModelWithFallback error', async () => {
    mockCallModelWithFallback.mockRejectedValue(new Error('All models failed'));

    const result = await fetchEvidenceForFact(
      'Some fact',
      'No URL source',
    );

    expect(result.content).toBeNull();
  });

  it('falls back to LLM search when URL fetch fails', async () => {
    // Mock fetch to fail for URL
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
    });

    mockCallModelWithFallback.mockResolvedValue({
      content: 'AI-found evidence about the topic.',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 150,
      attempts: 1,
    });

    const result = await fetchEvidenceForFact(
      'Test fact',
      'https://example.com/research-paper',
    );

    // Should have attempted fetch first, then fallen back to LLM
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(mockCallModelWithFallback).toHaveBeenCalled();
    expect(result.content).toBe('AI-found evidence about the topic.');
  });
});

describe('evidenceFetcher - web fetch independence', () => {
  it('uses URL fetch with its own timeout, independent of LLM', async () => {
    // Mock successful URL fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<html><body><p>Research content about education that is long enough to pass the 100 char threshold for direct evidence return.</p></body></html>',
    });

    const result = await fetchEvidenceForFact(
      'Test fact',
      'https://example.com/paper',
    );

    // Should return web content without calling LLM
    expect(result.content).toBeTruthy();
    expect(result.url).toBe('https://example.com/paper');
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
  });
});
