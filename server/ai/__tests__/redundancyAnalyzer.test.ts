/**
 * Tests for FR4: Migrate redundancyAnalyzer to unified client
 *
 * Validates that analyzeFactRedundancy() uses callModel()
 * with the correct model and parameters, and that JSON parsing
 * and error handling are preserved.
 *
 * Mocks: server/ai/client module (callModel)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified client
vi.mock('../client', () => ({
  callModel: vi.fn(),
}));

import { callModel } from '../client';
import { analyzeFactRedundancy } from '../redundancyAnalyzer';

const mockCallModel = vi.mocked(callModel);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.OPENROUTER_API_KEY = 'test-key';
});

describe('redundancyAnalyzer', () => {
  const sampleFacts = [
    { id: 1, originalId: '1', fact: 'Students learn better with practice', score: 4, source: 'Research A', category: 'Learning' },
    { id: 2, originalId: '2', fact: 'Practice improves student outcomes', score: 3, source: 'Research B', category: 'Learning' },
    { id: 3, originalId: '3', fact: 'Sleep affects memory consolidation', score: 5, source: 'Research C', category: 'Memory' },
  ] as any[];

  it('calls callModel with correct model, temperature, maxTokens, and caller', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({
        redundancyGroups: [
          {
            groupName: 'Practice and learning outcomes',
            factIds: [1, 2],
            primaryFactId: 1,
            similarityScore: '90%',
            reason: 'Facts 1 and 2 describe the same finding about practice.',
          },
        ],
        coreFactIds: [1, 3],
      }),
      model: 'anthropic/claude-sonnet-4',
      durationMs: 300,
      attempts: 1,
    });

    await analyzeFactRedundancy(sampleFacts);

    expect(mockCallModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-sonnet-4',
        temperature: 0.1,
        maxTokens: 4000,
        caller: 'redundancyAnalyzer',
      }),
    );
  });

  it('throws when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(analyzeFactRedundancy(sampleFacts))
      .rejects.toThrow('OpenRouter API key not configured');

    expect(mockCallModel).not.toHaveBeenCalled();

    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  it('returns correct structure for fewer than 2 facts', async () => {
    const singleFact = [{ id: 1, originalId: '1', fact: 'Only fact', score: 5, source: 'X', category: 'Y' }] as any[];

    const result = await analyzeFactRedundancy(singleFact);

    expect(result).toEqual({
      redundancyGroups: [],
      uniqueFactCount: 1,
      redundantFactCount: 0,
      coreFactIds: [1],
    });
    expect(mockCallModel).not.toHaveBeenCalled();
  });

  it('parses redundancy groups from callModel response', async () => {
    mockCallModel.mockResolvedValue({
      content: JSON.stringify({
        redundancyGroups: [
          {
            groupName: 'Practice benefits',
            factIds: [1, 2],
            primaryFactId: 1,
            similarityScore: '92%',
            reason: 'Both about practice improving learning.',
          },
        ],
        coreFactIds: [1, 3],
      }),
      model: 'anthropic/claude-sonnet-4',
      durationMs: 250,
      attempts: 1,
    });

    const result = await analyzeFactRedundancy(sampleFacts);

    expect(result.redundancyGroups).toHaveLength(1);
    expect(result.redundancyGroups[0].groupName).toBe('Practice benefits');
    expect(result.redundancyGroups[0].factIds).toEqual([1, 2]);
    expect(result.redundancyGroups[0].primaryFactId).toBe(1);
    expect(result.coreFactIds).toEqual([1, 3]);
  });

  it('re-throws on callModel failure', async () => {
    mockCallModel.mockRejectedValue(new Error('API timeout'));

    await expect(analyzeFactRedundancy(sampleFacts))
      .rejects.toThrow('API timeout');
  });

  it('handles JSON wrapped in markdown code blocks', async () => {
    mockCallModel.mockResolvedValue({
      content: '```json\n{"redundancyGroups": [], "coreFactIds": [1, 2, 3]}\n```',
      model: 'anthropic/claude-sonnet-4',
      durationMs: 200,
      attempts: 1,
    });

    const result = await analyzeFactRedundancy(sampleFacts);
    expect(result.redundancyGroups).toHaveLength(0);
    expect(result.coreFactIds).toEqual([1, 2, 3]);
  });
});
