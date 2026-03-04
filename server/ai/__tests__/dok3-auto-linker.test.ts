/**
 * Tests for 01-dok3-auto-linker
 *
 * Tests DOK3→DOK2 semantic auto-linking with multi-source constraint.
 * Storage calls and LLM (OpenRouter) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage module before importing the module under test
vi.mock('../../storage', () => ({
  storage: {
    linkDOK3Insight: vi.fn().mockResolvedValue({ id: 1, status: 'linked' }),
    setDOK3LinkingFlagged: vi.fn().mockResolvedValue(undefined),
  },
}));

import { storage } from '../../storage';
import { autoLinkDOK3Insights } from '../dok3AutoLinker';
import type { DOK2Summary, DOK3Insight } from '../dok3AutoLinker';

// Helper to create mock LLM response
function createMockFetch(responseBody: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: responseBody } }],
    }),
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
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── FR1: LLM Semantic Scoring ──────────────────────────────────────

  describe('FR1: LLM Semantic Scoring', () => {
    it('calls LLM with system + user messages in correct format', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.8 },
          { dok2Id: 2, score: 0.7 },
        ],
      }));

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );

      // Parse the request body to verify prompt structure
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.model).toBe('anthropic/claude-haiku-4.5');
      expect(body.temperature).toBe(0);
    });

    it('includes all DOK2 summaries with displayTitle + points in prompt', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.8 },
          { dok2Id: 2, score: 0.7 },
        ],
      }));

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const userPrompt: string = body.messages[1].content;

      // All DOK2s should appear in the prompt
      expect(userPrompt).toContain('ID: 1');
      expect(userPrompt).toContain('ID: 2');
      expect(userPrompt).toContain('ID: 3');
      expect(userPrompt).toContain('ID: 4');
      // displayTitle included
      expect(userPrompt).toContain('Summary about climate change');
      // Points included
      expect(userPrompt).toContain('Rising temperatures affect ecosystems');
    });

    it('parses JSON response with rankings structure', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.85 },
          { dok2Id: 2, score: 0.72 },
          { dok2Id: 3, score: 0.3 },
          { dok2Id: 4, score: 0.1 },
        ],
      }));

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

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 10, score: 0.8 },
          { dok2Id: 11, score: 0.7 },
        ],
      }));

      await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], dok2sWithNullTitle);

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      const userPrompt: string = body.messages[1].content;

      // Should still include the DOK2 with null displayTitle using point text
      expect(userPrompt).toContain('ID: 10');
      expect(userPrompt).toContain('First point about energy policy');
    });
  });

  // ── FR2: Multi-Source Link Selection ───────────────────────────────

  describe('FR2: Multi-Source Link Selection', () => {
    it('links insight to ≥2 DOK2s from ≥2 sources (happy path)', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.9 },  // Source A
          { dok2Id: 2, score: 0.8 },  // Source B
          { dok2Id: 3, score: 0.7 },  // Source A
          { dok2Id: 4, score: 0.6 },  // Source C
        ],
      }));

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
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.95 },  // Source A
          { dok2Id: 3, score: 0.90 },  // Source A
          { dok2Id: 2, score: 0.6 },   // Source B
          { dok2Id: 4, score: 0.55 },  // Source C
        ],
      }));

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

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 20, score: 0.9 },
          { dok2Id: 21, score: 0.8 },
        ],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleSourceDok2s);

      expect(results[0].flagged).toBe(true);
      expect(results[0].dok2SummaryIds.length).toBeGreaterThanOrEqual(2);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });

    it('links top 2 DOK2s with flagged=true when all scores below threshold', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.4 },  // Source A - below 0.5
          { dok2Id: 2, score: 0.3 },  // Source B - below 0.5
          { dok2Id: 3, score: 0.2 },  // Source A - below 0.5
          { dok2Id: 4, score: 0.1 },  // Source C - below 0.5
        ],
      }));

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

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 30, score: 0.9 },
          { dok2Id: 31, score: 0.8 },
          { dok2Id: 32, score: 0.7 },
        ],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], dok2sWithVariedSources);

      // DOK2 30 and 31 are the same source after normalization
      // So constraint requires DOK2 32 (Source B) to be included
      expect(results[0].flagged).toBe(false);
      expect(results[0].dok2SummaryIds).toContain(32);
    });
  });

  // ── FR3: Flagging ──────────────────────────────────────────────────

  describe('FR3: Flagging', () => {
    it('returns LinkResult with flagged=false when constraint met', async () => {
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.9 },  // Source A
          { dok2Id: 2, score: 0.8 },  // Source B
        ],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results[0].flagged).toBe(false);
      expect(storage.setDOK3LinkingFlagged).not.toHaveBeenCalled();
    });

    it('returns LinkResult with flagged=true when constraint not met', async () => {
      const singleSourceDok2s: DOK2Summary[] = [
        { id: 40, sourceName: 'Same Source', sourceUrl: 'https://same.com', displayTitle: 'Title', points: [{ text: 'Point' }] },
        { id: 41, sourceName: 'Same Source', sourceUrl: 'https://same.com', displayTitle: 'Title 2', points: [{ text: 'Point 2' }] },
      ];

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 40, score: 0.9 },
          { dok2Id: 41, score: 0.8 },
        ],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleSourceDok2s);

      expect(results[0].flagged).toBe(true);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });

    it('links single DOK2 with flagged=true when only 1 DOK2 available', async () => {
      const singleDok2: DOK2Summary[] = [
        { id: 50, sourceName: 'Sole Source', sourceUrl: 'https://sole.com', displayTitle: 'Only Summary', points: [{ text: 'Only point' }] },
      ];

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [{ dok2Id: 50, score: 0.9 }],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], singleDok2);

      expect(results[0].flagged).toBe(true);
      expect(results[0].dok2SummaryIds).toEqual([50]);
      expect(storage.linkDOK3Insight).toHaveBeenCalledWith(101, 1, [50]);
      expect(storage.setDOK3LinkingFlagged).toHaveBeenCalledWith(101, 1);
    });
  });

  // ── FR4: Error Resilience ──────────────────────────────────────────

  describe('FR4: Error Resilience', () => {
    it('logs error and continues when LLM API fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      // Should not throw, should return empty results for this insight
      expect(results).toHaveLength(0);
      expect(storage.linkDOK3Insight).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error and continues when LLM returns malformed JSON', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      globalThis.fetch = createMockFetch('not valid json at all');

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(0);
      expect(storage.linkDOK3Insight).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs error and continues when storage.linkDOK3Insight fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (storage.linkDOK3Insight as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('DB error'));

      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok2Id: 1, score: 0.9 },
          { dok2Id: 2, score: 0.8 },
        ],
      }));

      const results = await autoLinkDOK3Insights(1, [INSIGHT_FIXTURES[0]], DOK2_FIXTURES);

      expect(results).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns partial LinkResult array on mixed success/failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First insight: LLM fails
      // Second insight: LLM succeeds
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('LLM failed for first'));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({
              rankings: [
                { dok2Id: 1, score: 0.9 },
                { dok2Id: 2, score: 0.8 },
              ],
            }) } }],
          }),
        });
      });

      const results = await autoLinkDOK3Insights(1, INSIGHT_FIXTURES, DOK2_FIXTURES);

      // Only second insight should have results
      expect(results).toHaveLength(1);
      expect(results[0].insightId).toBe(102);
      consoleSpy.mockRestore();
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('returns empty array when insights is empty', async () => {
      const results = await autoLinkDOK3Insights(1, [], DOK2_FIXTURES);

      expect(results).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('returns empty array when dok2Summaries is empty', async () => {
      const results = await autoLinkDOK3Insights(1, INSIGHT_FIXTURES, []);

      expect(results).toEqual([]);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
