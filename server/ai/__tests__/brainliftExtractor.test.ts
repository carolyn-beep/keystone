/**
 * Tests for FR1: Migrate brainliftExtractor to unified client
 *
 * Validates that the 3 LLM call sites in brainliftExtractor
 * (extractChunk, summarizePurposeForDisplay, findContradictions)
 * use callModel()/callModelWithFallback() with correct parameters.
 *
 * Mocks: server/ai/client module (callModel, callModelWithFallback)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified client
vi.mock('../client', () => ({
  callModel: vi.fn(),
  callModelWithFallback: vi.fn(),
}));

// Mock hierarchyExtractor to avoid pulling in the full module
vi.mock('../hierarchyExtractor', () => ({
  extractAllFromHierarchy: vi.fn().mockReturnValue({
    facts: [],
    dok2Summaries: [],
    dok3Insights: [],
    dok4Spovs: [],
    metadata: { dok1NodesFound: 0, dok2NodesFound: 0, dok3NodesFound: 0, dok4NodesFound: 0, sourcesAttributed: 0 },
  }),
  convertToExtractorFormat: vi.fn().mockReturnValue([]),
  extractPurposeFromHierarchy: vi.fn().mockReturnValue(null),
}));

// Mock pLimit to pass through
vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => T) => fn(),
}));

import { callModel, callModelWithFallback } from '../client';
import { extractBrainlift, findContradictions } from '../brainliftExtractor';

const mockCallModel = vi.mocked(callModel);
const mockCallModelWithFallback = vi.mocked(callModelWithFallback);

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console.log/error during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ═══════════════════════════════════════════════════════════════════════════
// extractChunk via extractBrainlift (LLM fallback path)
// ═══════════════════════════════════════════════════════════════════════════

describe('brainliftExtractor - extractChunk (via extractBrainlift LLM fallback)', () => {
  it('calls callModel with correct model, responseFormat, temperature, and caller', async () => {
    // Set up callModel to return valid JSON for chunk extraction
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({ facts: [{ fact: 'Test fact', source: 'Test source' }] }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });

    // Provide short content that won't be split into multiple chunks
    await extractBrainlift('Some content without DOK1 sections', 'test');

    // extractChunk should have been called since regex finds no facts, triggering LLM fallback
    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'qwen/qwen-plus',
        temperature: 0.1,
        caller: 'brainliftExtractor.chunkExtraction',
        responseFormat: expect.objectContaining({
          type: 'json_schema',
          jsonSchema: expect.objectContaining({
            name: 'dok1_facts',
            strict: true,
            schema: expect.objectContaining({
              type: 'object',
              properties: expect.objectContaining({
                facts: expect.any(Object),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('preserves JSON parsing fallback on malformed response', async () => {
    // Return content wrapped in markdown code block (malformed for direct JSON parse)
    mockCallModel.mockResolvedValue({
      content: '```json\n{"facts": [{"fact": "Extracted fact", "source": null}]}\n```',
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });

    const result = await extractBrainlift('Content without DOK1 markers', 'test');

    // Should still extract the fact via regex JSON fallback
    expect(result.facts.length).toBeGreaterThanOrEqual(1);
    expect(result.facts[0].fact).toBe('Extracted fact');
  });

  it('returns empty array on callModel failure', async () => {
    mockCallModel.mockRejectedValue(new Error('API timeout'));

    const result = await extractBrainlift('Content without DOK1 markers', 'test');

    // Should gracefully handle the error and return empty facts
    expect(result.facts).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// summarizePurposeForDisplay
// ═══════════════════════════════════════════════════════════════════════════

describe('brainliftExtractor - summarizePurposeForDisplay', () => {
  it('calls callModelWithFallback with correct models, maxTokens, timeout, retries, and caller for long purpose', async () => {
    // extractChunk uses callModel (LLM fallback for facts)
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({ facts: [{ fact: 'A fact', source: null }] }),
      model: 'qwen/qwen-plus',
      durationMs: 100,
      attempts: 1,
    });

    // summarizePurposeForDisplay uses callModelWithFallback
    mockCallModelWithFallback.mockResolvedValue({
      content: 'Short summary of purpose',
      model: 'qwen/qwen-plus',
      durationMs: 50,
      attempts: 1,
    });

    // Content with a long purpose that exceeds 200 chars threshold
    const longPurpose = 'A'.repeat(250);
    const content = `# My Brainlift\n\n## Purpose\n${longPurpose}\n\n## DOK 1\n- Some fact`;

    const result = await extractBrainlift(content, 'test');

    // Verify purpose summarization was called via callModelWithFallback
    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'],
        maxTokens: 80,
        timeout: 15_000,
        retries: 2,
        caller: 'brainliftExtractor.purposeSummary',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// findContradictions
// ═══════════════════════════════════════════════════════════════════════════

describe('brainliftExtractor - findContradictions', () => {
  it('calls callModel with correct model and caller', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({ result: 'NONE' }),
      model: 'anthropic/claude-sonnet-4',
      durationMs: 200,
      attempts: 1,
    });

    const facts = [
      { id: '1', fact: 'Education is important', score: 4 },
      { id: '2', fact: 'Learning requires effort', score: 3 },
    ];

    await findContradictions(facts);

    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4',
        timeout: 60_000,
        caller: 'brainliftExtractor.contradictions',
      }),
    );
  });

  it('returns empty array for fewer than 2 facts', async () => {
    const result = await findContradictions([{ id: '1', fact: 'Only one fact' }]);
    expect(result).toEqual([]);
    expect(mockCallModel).not.toHaveBeenCalled();
  });

  it('parses contradiction response correctly', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({
        title: 'Access vs Equity',
        tension: 'Wide access benefits (Fact 1.1) vs equity concerns (Fact 2.1)',
      }),
      model: 'anthropic/claude-sonnet-4',
      durationMs: 200,
      attempts: 1,
    });

    const facts = [
      { id: '1', fact: 'Access is universally beneficial' },
      { id: '2', fact: 'Access without equity increases inequality' },
    ];

    const result = await findContradictions(facts);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Access vs Equity');
    expect(result[0].factIds).toContain('1.1');
    expect(result[0].factIds).toContain('2.1');
  });

  it('returns empty array on callModel failure', async () => {
    mockCallModel.mockRejectedValue(new Error('API error'));

    const facts = [
      { id: '1', fact: 'Fact A' },
      { id: '2', fact: 'Fact B' },
    ];

    const result = await findContradictions(facts);
    expect(result).toEqual([]);
  });
});
