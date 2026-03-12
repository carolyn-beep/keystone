/**
 * Tests for DOK3 Auto-Linker (unified client migration)
 *
 * Tests DOK3->DOK2 semantic auto-linking with multi-source constraint.
 * Storage and unified client (callModel) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock storage module before importing the module under test
vi.mock('../../storage', () => ({
  storage: {
    linkDOK3Insight: vi.fn().mockResolvedValue({ id: 1, status: 'linked' }),
    setDOK3LinkingFlagged: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock the unified AI client
vi.mock('../client', () => ({
  callModel: vi.fn(),
}));

import { storage } from '../../storage';
import { callModel } from '../client';
import { autoLinkDOK3Insights } from '../dok3AutoLinker';
import type { DOK2Summary, DOK3Insight } from '../dok3AutoLinker';

const mockCallModel = vi.mocked(callModel);

// Helper to configure mock callModel response
function mockCallModelResponse(responseBody: object) {
  mockCallModel.mockResolvedValue({
    content: JSON.stringify(responseBody),
    model: 'anthropic/claude-haiku-4.5',
    durationMs: 100,
    attempts: 1,
  });
}

// Test fixtures
const DOK2_FIXTURES: DOK2Summary[] = [
  {
    id: 1,
    sourceName: 'Source A',
    sourceUrl: 'https://source-a.com',
    displayTitle: 'Summary about climate change',
    points: [{ text: 'Rising temperatures affect ecosystems' }, { text: 'Carbon emissions are increasing' }],
  },
  {
    id: 2,
    sourceName: 'Source B',
    sourceUrl: 'https://source-b.com',
    displayTitle: 'Summary about renewable energy',
    points: [{ text: 'Solar adoption is accelerating' }],
  },
  {
    id: 3,
    sourceName: 'Source A',
    sourceUrl: 'https://source-a.com',
    displayTitle: 'Summary about policy impacts',
    points: [{ text: 'Government regulations drive change' }],
  },
  {
    id: 4,
    sourceName: 'Source C',
    sourceUrl: 'https://source-c.com',
    displayTitle: 'Summary about economic effects',
    points: [{ text: 'Green economy creates jobs' }],
  },
];

const INSIGHT_FIXTURES: DOK3Insight[] = [
  { id: 101, text: 'Climate policy effectiveness depends on economic incentives across multiple sectors' },
  { id: 102, text: 'Renewable energy adoption correlates with government regulation strength' },
];

describe('DOK3 Auto-Linker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- FR1: LLM Semantic Scoring (via unified client) ---------------------

  describe('FR1: LLM Semantic Scoring', () => {
    it('calls callModel with correct caller and responseFormat', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.8 },
          { dok2Id: 2, score: 0.7 },
        ],
      });

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(mockCallModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'anthropic/claude-haiku-4.5',
          caller: 'dok3AutoLinker',
          temperature: 0,
          responseFormat: expect.objectContaining({
            type: 'json_schema',
            jsonSchema: expect.objectContaining({
              name: 'dok3_rankings',
            }),
          }),
        }),
      );
    });

    it('passes system prompt and user content via callModel options', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.8 },
          { dok2Id: 2, score: 0.7 },
        ],
      });

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      const callArgs = mockCallModel.mock.calls[0][0];
      expect(callArgs.system).toContain('DOK3');
      expect(callArgs.messages).toHaveLength(1);
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toContain('ID: 1');
      expect(callArgs.messages[0].content).toContain('ID: 2');
    });

    it('includes all DOK2 summaries with displayTitle + points in prompt', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.8 },
          { dok2Id: 2, score: 0.7 },
        ],
      });

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      const callArgs = mockCallModel.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;

      // All DOK2s should appear in the prompt
      expect(userContent).toContain('ID: 1');
      expect(userContent).toContain('ID: 2');
      expect(userContent).toContain('ID: 3');
      expect(userContent).toContain('ID: 4');
      // displayTitle included
      expect(userContent).toContain('Summary about climate change');
      // Points included
      expect(userContent).toContain('Rising temperatures affect ecosystems');
    });

    it('parses JSON response with rankings structure', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.85 },
          { dok2Id: 2, score: 0.72 },
          { dok2Id: 3, score: 0.3 },
          { dok2Id: 4, score: 0.1 },
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(1);
      // Should link DOK2s 1 and 2 (above threshold, from different sources)
      expect(results[0].dok2SummaryIds).toContain(1);
      expect(results[0].dok2SummaryIds).toContain(2);
    });

    it('uses category/points as fallback when displayTitle is null', async () => {
      const dok2sWithNullTitle: DOK2Summary[] = [
        {
          id: 10,
          sourceName: 'Source X',
          sourceUrl: 'https://source-x.com',
          displayTitle: null,
          points: [{ text: 'First point about energy policy' }],
        },
        {
          id: 11,
          sourceName: 'Source Y',
          sourceUrl: 'https://source-y.com',
          displayTitle: 'Valid title here',
          points: [{ text: 'Some point about regulation' }],
        },
      ];

      mockCallModelResponse({
        rankings: [
          { dok2Id: 10, score: 0.8 },
          { dok2Id: 11, score: 0.7 },
        ],
      });

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], dok2sWithNullTitle);

      const callArgs = mockCallModel.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;

      // Should still include the DOK2 with null displayTitle using point text
      expect(userContent).toContain('ID: 10');
      expect(userContent).toContain('First point about energy policy');
    });
  });

  // -- FR2: Multi-Source Link Selection -----------------------------------

  describe('FR2: Multi-Source Link Selection', () => {
    it('links insight to >=2 DOK2s from >=2 sources (happy path)', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.9 },  // Source A
          { dok2Id: 2, score: 0.8 },  // Source B
          { dok2Id: 3, score: 0.7 },  // Source A
          { dok2Id: 4, score: 0.6 },  // Source C
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(1);
      expect(results[0].flagged).toBe(false);
      expect(results[0].dok2SummaryIds.length).toBeGreaterThanOrEqual(2);

      // Verify storage was called with correct IDs
      expect(storage.linkDOK3Insight).toHaveBeenCalledWith(
        101, 1, expect.any(Array),
      );
    });

    it('selects additional DOK2s from other sources when top scorers are same source', async () => {
      // Top 2 scores are both from Source A
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.95 },  // Source A
          { dok2Id: 3, score: 0.90 },  // Source A
          { dok2Id: 2, score: 0.6 },   // Source B
          { dok2Id: 4, score: 0.55 },  // Source C
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results[0].flagged).toBe(false);
      // Must include at least one DOK2 from a different source
      const linkedIds = results[0].dok2SummaryIds;
      const sources = linkedIds.map(id => DOK2_FIXTURES.find(d => d.id === id)!.sourceName);
      const uniqueSources = new Set(sources);
      expect(uniqueSources.size).toBeGreaterThanOrEqual(2);
    });

    it('links best matches with flagged=true when only 1 source exists', async () => {
      const singleSourceDok2s: DOK2Summary[] = [
        { id: 20, sourceName: 'Only Source', sourceUrl: 'https://only.com', displayTitle: 'Title A', points: [{ text: 'Point A' }] },
        { id: 21, sourceName: 'Only Source', sourceUrl: 'https://only.com', displayTitle: 'Title B', points: [{ text: 'Point B' }] },
      ];

      mockCallModelResponse({
        rankings: [
          { dok2Id: 20, score: 0.9 },
          { dok2Id: 21, score: 0.8 },
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleSourceDok2s);

      expect(results[0].flagged).toBe(true);
      expect(results[0].dok2SummaryIds.length).toBeGreaterThanOrEqual(2);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });

    it('links top 2 DOK2s with flagged=true when all scores below threshold', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.4 },  // Source A - below 0.5
          { dok2Id: 2, score: 0.3 },  // Source B - below 0.5
          { dok2Id: 3, score: 0.2 },  // Source A - below 0.5
          { dok2Id: 4, score: 0.1 },  // Source C - below 0.5
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results[0].flagged).toBe(true);
      expect(results[0].dok2SummaryIds.length).toBeGreaterThanOrEqual(2);
      expect(storage.linkDOK3Insight).toHaveBeenCalled();
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });

    it('normalizes sources: lowercase, trim, trailing slash removal', async () => {
      const dok2sWithVariedSources: DOK2Summary[] = [
        { id: 30, sourceName: '  Source A  ', sourceUrl: 'https://source-a.com/', displayTitle: 'Title 1', points: [{ text: 'Point' }] },
        { id: 31, sourceName: 'source a', sourceUrl: 'https://SOURCE-A.COM', displayTitle: 'Title 2', points: [{ text: 'Point' }] },
        { id: 32, sourceName: 'Source B', sourceUrl: 'https://source-b.com', displayTitle: 'Title 3', points: [{ text: 'Point' }] },
      ];

      mockCallModelResponse({
        rankings: [
          { dok2Id: 30, score: 0.9 },
          { dok2Id: 31, score: 0.8 },
          { dok2Id: 32, score: 0.7 },
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], dok2sWithVariedSources);

      // DOK2 30 and 31 are the same source after normalization
      // So constraint requires DOK2 32 (Source B) to be included
      expect(results[0].flagged).toBe(false);
      expect(results[0].dok2SummaryIds).toContain(32);
    });
  });

  // -- FR3: Flagging ------------------------------------------------------

  describe('FR3: Flagging', () => {
    it('returns LinkResult with flagged=false when constraint met', async () => {
      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.9 },  // Source A
          { dok2Id: 2, score: 0.8 },  // Source B
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results[0].flagged).toBe(false);
      expect(storage.setDOK3LinkingFlagged).not.toHaveBeenCalled();
    });

    it('returns LinkResult with flagged=true when constraint not met', async () => {
      const singleSourceDok2s: DOK2Summary[] = [
        { id: 40, sourceName: 'Same Source', sourceUrl: 'https://same.com', displayTitle: 'Title', points: [{ text: 'Point' }] },
        { id: 41, sourceName: 'Same Source', sourceUrl: 'https://same.com', displayTitle: 'Title 2', points: [{ text: 'Point 2' }] },
      ];

      mockCallModelResponse({
        rankings: [
          { dok2Id: 40, score: 0.9 },
          { dok2Id: 41, score: 0.8 },
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleSourceDok2s);

      expect(results[0].flagged).toBe(true);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });

    it('links single DOK2 with flagged=true when only 1 DOK2 available', async () => {
      const singleDok2: DOK2Summary[] = [
        { id: 50, sourceName: 'Sole Source', sourceUrl: 'https://sole.com', displayTitle: 'Only Summary', points: [{ text: 'Only point' }] },
      ];

      mockCallModelResponse({
        rankings: [{ dok2Id: 50, score: 0.9 }],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleDok2);

      expect(results[0].flagged).toBe(true);
      expect(results[0].dok2SummaryIds).toEqual([50]);
      expect(storage.linkDOK3Insight).toHaveBeenCalledWith(101, 1, [50]);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });
  });

  // -- FR4: Error Resilience ----------------------------------------------

  describe('FR4: Error Resilience', () => {
    it('logs error and continues when callModel fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCallModel.mockRejectedValue(new Error('Network error'));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      // Should not throw, should return empty results for this insight
      expect(results).toHaveLength(0);
      expect(storage.linkDOK3Insight).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error and continues when callModel returns unparseable content', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockCallModel.mockResolvedValue({
        content: 'not valid json at all',
        model: 'anthropic/claude-haiku-4.5',
        durationMs: 100,
        attempts: 1,
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(0);
      expect(storage.linkDOK3Insight).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error and continues when storage.linkDOK3Insight fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (storage.linkDOK3Insight as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));

      mockCallModelResponse({
        rankings: [
          { dok2Id: 1, score: 0.9 },
          { dok2Id: 2, score: 0.8 },
        ],
      });

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns partial LinkResult array on mixed success/failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First insight: callModel fails
      // Second insight: callModel succeeds
      let callCount = 0;
      mockCallModel.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('LLM failed for first');
        }
        return {
          content: JSON.stringify({
            rankings: [
              { dok2Id: 1, score: 0.9 },
              { dok2Id: 2, score: 0.8 },
            ],
          }),
          model: 'anthropic/claude-haiku-4.5',
          durationMs: 100,
          attempts: 1,
        };
      });

      const results = await autoLinkDOK3Insights(1, INSIGHT_FIXTURES, DOK2_FIXTURES);

      // Only second insight should have results
      expect(results).toHaveLength(1);
      expect(results[0].insightId).toBe(102);
      consoleSpy.mockRestore();
    });
  });

  // -- Edge Cases ---------------------------------------------------------

  describe('Edge Cases', () => {
    it('returns empty array when insights is empty', async () => {
      const results = await autoLinkDOK3Insights(1, [], DOK2_FIXTURES);

      expect(results).toEqual([]);
      expect(mockCallModel).not.toHaveBeenCalled();
    });

    it('returns empty array when dok2Summaries is empty', async () => {
      const results = await autoLinkDOK3Insights(1, INSIGHT_FIXTURES, []);

      expect(results).toEqual([]);
      expect(mockCallModel).not.toHaveBeenCalled();
    });
  });
});
