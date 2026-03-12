/**
 * Tests for FR2: Migrate factSummarizer to unified client
 *
 * Validates that summarizeFact() uses callModelWithFallback()
 * with the correct model chain, parameters, and error handling.
 *
 * Mocks: server/ai/client module (callModelWithFallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified client
vi.mock('../client', () => ({
  callModelWithFallback: vi.fn(),
}));

import { callModelWithFallback } from '../client';
import { summarizeFact } from '../factSummarizer';

const mockCallModelWithFallback = vi.mocked(callModelWithFallback);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('factSummarizer', () => {
  it('calls callModelWithFallback with correct models, temperature, maxTokens, and caller', async () => {
    // Set OPENROUTER_API_KEY for the test
    process.env.OPENROUTER_API_KEY = 'test-key';

    mockCallModelWithFallback.mockResolvedValue({
      content: 'Summarized fact text',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 100,
      attempts: 1,
    });

    const result = await summarizeFact('This is a long fact that needs summarization for display purposes.');

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['google/gemini-2.0-flash-001', 'qwen/qwen3-32b'],
        temperature: 0.3,
        maxTokens: 150,
        caller: 'factSummarizer',
      }),
    );

    expect(result).toBe('Summarized fact text');
  });

  it('returns truncated text when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const longText = 'A'.repeat(300);
    const result = await summarizeFact(longText);

    expect(result).toBe(longText.substring(0, 200) + '...');
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();

    // Restore for other tests
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns truncated text on callModelWithFallback error', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    mockCallModelWithFallback.mockRejectedValue(new Error('All models failed'));

    const longText = 'B'.repeat(300);
    const result = await summarizeFact(longText);

    expect(result).toBe(longText.substring(0, 200) + '...');
  });

  it('passes the fact text in the user message', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';

    mockCallModelWithFallback.mockResolvedValue({
      content: 'Summary',
      model: 'google/gemini-2.0-flash-001',
      durationMs: 50,
      attempts: 1,
    });

    await summarizeFact('Specific fact content here');

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Specific fact content here'),
          }),
        ]),
      }),
    );
  });
});
