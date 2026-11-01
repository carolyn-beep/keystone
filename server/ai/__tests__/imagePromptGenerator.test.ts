/**
 * Tests for FR5: Migrate imagePromptGenerator to unified client
 *
 * Validates that generateImagePrompt() uses callModelWithFallback()
 * with the correct models and parameters, and error handling is preserved.
 *
 * Mocks: server/ai/client module (callModelWithFallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified client
vi.mock('../client', () => ({
  callModelWithFallback: vi.fn(),
}));

import { callModelWithFallback } from '../client';
import { generateImagePrompt } from '../imagePromptGenerator';

const mockCallModelWithFallback = vi.mocked(callModelWithFallback);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const sampleContext = {
  title: 'Knowledge-Rich Curriculum',
  purpose: 'Exploring research-backed methods for deeper learning outcomes.',
  topFactSummaries: ['spaced practice improves retention', 'retrieval practice strengthens memory'],
};

describe('imagePromptGenerator', () => {
  it('calls callModelWithFallback with correct models, temperature, maxTokens, timeout, and caller', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: 'an open book with gears emerging from its pages',
      model: 'anthropic/claude-opus-4.6',
      durationMs: 150,
      attempts: 1,
    });

    await generateImagePrompt(sampleContext);

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6'],
        temperature: 0.7,
        maxTokens: 100,
        timeout: 15_000,
        caller: 'imagePromptGenerator',
      }),
    );
  });

  it('returns the visual concept from callModel', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: 'a lighthouse beam splitting into prismatic colors',
      model: 'anthropic/claude-opus-4.6',
      durationMs: 100,
      attempts: 1,
    });

    const result = await generateImagePrompt(sampleContext);
    expect(result).toBe('a lighthouse beam splitting into prismatic colors');
  });

  it('throws on empty response from callModel', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: '',
      model: 'anthropic/claude-opus-4.6',
      durationMs: 100,
      attempts: 1,
    });

    await expect(generateImagePrompt(sampleContext))
      .rejects.toThrow('Empty response from Claude');
  });

  it('includes title, purpose, and themes in the prompt', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: 'a visual concept',
      model: 'anthropic/claude-opus-4.6',
      durationMs: 100,
      attempts: 1,
    });

    await generateImagePrompt(sampleContext);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
    expect(userMessage?.content).toContain('Knowledge-Rich Curriculum');
    expect(userMessage?.content).toContain('Exploring research-backed methods');
    expect(userMessage?.content).toContain('spaced practice improves retention');
  });

  it('preserves verbose logging when enabled', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    mockCallModelWithFallback.mockResolvedValue({
      content: 'a hourglass filled with data streams',
      model: 'anthropic/claude-opus-4.6',
      durationMs: 100,
      attempts: 1,
    });

    await generateImagePrompt(sampleContext, true);

    // Verbose mode should log prompts and responses
    expect(consoleSpy).toHaveBeenCalled();
  });
});
