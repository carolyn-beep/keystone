/**
 * Tests for FR4: DOK4 Auto-Linker
 *
 * Tests explicit link resolution and semantic matching.
 * Storage calls are mocked. LLM calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage module before importing the module under test
vi.mock('../../storage', () => ({
  storage: {
    linkDOK4Spov: vi.fn().mockResolvedValue(undefined),
    updateDOK4SpovStatus: vi.fn().mockResolvedValue(undefined),
  },
}));

import { storage } from '../../storage';
import { autoLinkDOK4Spovs } from '../dok4AutoLinker';

// Helper to create mock LLM response for semantic matching
function createMockFetch(responseBody: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: responseBody } }],
    }),
  });
}

describe('autoLinkDOK4Spovs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: set env var so LLM calls won't fail on missing key
    process.env.OPENROUTER_API_KEY = 'test-key';
  });

  describe('explicit link resolution', () => {
    it('creates links using DOK3 position mapping (1-indexed)', async () => {
      const dok3Insights = [
        { id: 101, text: 'Insight about NIL revenue' },
        { id: 102, text: 'Insight about athlete compensation' },
        { id: 103, text: 'Insight about academic impact' },
      ];

      await autoLinkDOK4Spovs(
        1, // brainliftId
        [10], // spovIds
        ['NIL space is detrimental to student athletes'], // spovTexts
        dok3Insights,
        [[2, 3]], // explicitLinkRefs: Insight 2 and Insight 3 (1-indexed positions)
      );

      // Should have called linkDOK4Spov with the correct DOK3 IDs
      expect(storage.linkDOK4Spov).toHaveBeenCalledWith(
        10, // spovId
        1, // brainliftId
        expect.arrayContaining([
          { dok3InsightId: 102, isPrimary: true }, // First explicit = primary
          { dok3InsightId: 103, isPrimary: false },
        ]),
      );
    });

    it('designates first explicit link as primary', async () => {
      const dok3Insights = [
        { id: 201, text: 'First insight text here' },
        { id: 202, text: 'Second insight text here' },
      ];

      await autoLinkDOK4Spovs(
        1, [20], ['Some SPOV'], dok3Insights,
        [[2, 1]], // Insight 2 first, then Insight 1
      );

      expect(storage.linkDOK4Spov).toHaveBeenCalledWith(
        20, 1,
        expect.arrayContaining([
          { dok3InsightId: 202, isPrimary: true }, // Index 2 -> id 202, listed first = primary
          { dok3InsightId: 201, isPrimary: false },
        ]),
      );
    });

    it('falls back to semantic when explicit ref is out of range', async () => {
      const dok3Insights = [
        { id: 301, text: 'Only insight available here' },
      ];

      // Mock fetch for semantic matching fallback
      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [{ dok3Id: 301, score: 0.8 }],
      }));

      try {
        await autoLinkDOK4Spovs(
          1, [30], ['Some SPOV text for linking'], dok3Insights,
          [[99]], // Insight 99 doesn't exist (only 1 insight)
        );

        // Should still create a link via semantic fallback
        expect(storage.linkDOK4Spov).toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('semantic matching', () => {
    it('creates links for relevant matches (mock LLM)', async () => {
      const dok3Insights = [
        { id: 401, text: 'NIL revenue distribution is inequitable' },
        { id: 402, text: 'Student athlete mental health suffers under NIL pressure' },
        { id: 403, text: 'Unrelated insight about curriculum design' },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok3Id: 401, score: 0.9 },
          { dok3Id: 402, score: 0.75 },
          { dok3Id: 403, score: 0.2 },
        ],
      }));

      try {
        await autoLinkDOK4Spovs(
          1, [40], ['The NIL space is detrimental to student athletes'],
          dok3Insights,
          [null], // No explicit refs -> semantic matching
        );

        expect(storage.linkDOK4Spov).toHaveBeenCalledWith(
          40, 1,
          expect.arrayContaining([
            expect.objectContaining({ dok3InsightId: 401, isPrimary: true }), // Highest score = primary
            expect.objectContaining({ dok3InsightId: 402, isPrimary: false }),
          ]),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('designates highest-relevance DOK3 as primary', async () => {
      const dok3Insights = [
        { id: 501, text: 'Low relevance insight about topic' },
        { id: 502, text: 'High relevance insight about topic' },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok3Id: 501, score: 0.3 },
          { dok3Id: 502, score: 0.95 },
        ],
      }));

      try {
        await autoLinkDOK4Spovs(
          1, [50], ['SPOV about this specific topic here'],
          dok3Insights,
          [null],
        );

        const linkCall = (storage.linkDOK4Spov as ReturnType<typeof vi.fn>).mock.calls[0];
        const links = linkCall[2] as Array<{ dok3InsightId: number; isPrimary: boolean }>;
        const primaryLink = links.find(l => l.isPrimary);
        expect(primaryLink?.dok3InsightId).toBe(502);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('edge cases', () => {
    it('SPOV stays pending_linking when no DOK3 insights exist', async () => {
      await autoLinkDOK4Spovs(
        1, [60], ['Some SPOV text for testing linking'],
        [], // No DOK3 insights
        [null],
      );

      // Should NOT call linkDOK4Spov
      expect(storage.linkDOK4Spov).not.toHaveBeenCalled();
    });

    it('LLM failure keeps SPOV as pending_linking (non-throwing)', async () => {
      const dok3Insights = [
        { id: 701, text: 'Some insight about the topic' },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('LLM API down'));

      try {
        // Should NOT throw
        await expect(
          autoLinkDOK4Spovs(
            1, [70], ['SPOV text that needs semantic matching'],
            dok3Insights,
            [null],
          )
        ).resolves.not.toThrow();

        // Should NOT have created any links
        expect(storage.linkDOK4Spov).not.toHaveBeenCalled();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles multiple SPOVs with mixed explicit/semantic', async () => {
      const dok3Insights = [
        { id: 801, text: 'First insight about education' },
        { id: 802, text: 'Second insight about technology' },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = createMockFetch(JSON.stringify({
        rankings: [
          { dok3Id: 801, score: 0.85 },
          { dok3Id: 802, score: 0.6 },
        ],
      }));

      try {
        await autoLinkDOK4Spovs(
          1,
          [80, 81], // Two SPOVs
          ['SPOV with explicit links reference', 'SPOV needing semantic match analysis'],
          dok3Insights,
          [[1], null], // First has explicit, second needs semantic
        );

        // Both SPOVs should get linked
        expect(storage.linkDOK4Spov).toHaveBeenCalledTimes(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
