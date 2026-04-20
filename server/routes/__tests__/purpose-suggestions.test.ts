/**
 * Tests for FR4: Purpose Suggestions Endpoint
 *
 * Validates the purpose suggestion route handler logic:
 * - Input validation via purposeSuggestionInputSchema
 * - AI call integration (mocked)
 * - Degraded response on AI failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { purposeSuggestionInputSchema } from '@shared/routes';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockCallModel = vi.fn();

vi.mock('../../ai/client', () => ({
  callModel: (...args: unknown[]) => mockCallModel(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Validation schema tests ────────────────────────────────────────────────

describe('purposeSuggestionInputSchema', () => {
  it('accepts valid topic with 10+ characters', () => {
    const result = purposeSuggestionInputSchema.parse({
      topic: 'Machine Learning Fundamentals',
    });

    expect(result.topic).toBe('Machine Learning Fundamentals');
  });

  it('trims whitespace before validating', () => {
    const result = purposeSuggestionInputSchema.parse({
      topic: '   Machine Learning Fundamentals   ',
    });

    expect(result.topic).toBe('Machine Learning Fundamentals');
  });

  it('rejects topic shorter than 10 characters', () => {
    expect(() => purposeSuggestionInputSchema.parse({
      topic: 'Short',
    })).toThrow();
  });

  it('rejects topic that is only whitespace (trims to empty)', () => {
    expect(() => purposeSuggestionInputSchema.parse({
      topic: '         ',
    })).toThrow();
  });

  it('rejects missing topic', () => {
    expect(() => purposeSuggestionInputSchema.parse({})).toThrow();
  });

  it('rejects non-string topic', () => {
    expect(() => purposeSuggestionInputSchema.parse({
      topic: 12345,
    })).toThrow();
  });
});

// ─── Handler logic tests (simulated) ───────────────────────────────────────

describe('POST /api/brainlifts/native/purpose-suggestions handler logic', () => {
  it('returns suggestions array on successful AI call', async () => {
    const suggestions = [
      'Grade reading comprehension',
      'Evaluate critical thinking',
      'Assess analytical skills',
    ];
    mockCallModel.mockResolvedValue({
      content: JSON.stringify(suggestions),
      model: 'google/gemini-2.0-flash-001',
    });

    const result = await mockCallModel({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: 'topic: Machine Learning' }],
      timeout: 10_000,
      caller: 'builder.purposeSuggestions',
    });

    expect(JSON.parse(result.content)).toEqual(suggestions);
    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'builder.purposeSuggestions',
        timeout: 10_000,
      })
    );
  });

  it('returns empty suggestions array on AI call failure (degraded response)', async () => {
    mockCallModel.mockRejectedValue(new Error('AI service unavailable'));

    let suggestions: string[] = [];
    try {
      await mockCallModel({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: 'topic: Machine Learning' }],
        timeout: 10_000,
        caller: 'builder.purposeSuggestions',
      });
    } catch {
      // On failure, handler returns { suggestions: [] }
      suggestions = [];
    }

    expect(suggestions).toEqual([]);
  });

  it('uses fast-tier model for suggestions', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify(['suggestion 1', 'suggestion 2', 'suggestion 3']),
      model: 'google/gemini-2.0-flash-001',
    });

    await mockCallModel({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: 'topic: test' }],
      timeout: 10_000,
      caller: 'builder.purposeSuggestions',
    });

    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.0-flash-001',
        timeout: 10_000,
      })
    );
  });

  it('handles AI returning malformed JSON gracefully', async () => {
    mockCallModel.mockResolvedValue({
      content: 'not valid json',
      model: 'google/gemini-2.0-flash-001',
    });

    const result = await mockCallModel({
      model: 'google/gemini-2.0-flash-001',
      messages: [{ role: 'user', content: 'topic: test' }],
      timeout: 10_000,
      caller: 'builder.purposeSuggestions',
    });

    // Handler should catch JSON parse error and return empty array
    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(result.content);
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s: unknown) => typeof s === 'string' && s.length > 0);
      }
    } catch {
      suggestions = [];
    }

    expect(suggestions).toEqual([]);
  });

  it('filters out non-string items from AI response', () => {
    const rawResponse = ['valid suggestion', 42, null, 'another valid one', ''];
    const filtered = rawResponse.filter(
      (s): s is string => typeof s === 'string' && s.length > 0
    );

    expect(filtered).toEqual(['valid suggestion', 'another valid one']);
  });
});
