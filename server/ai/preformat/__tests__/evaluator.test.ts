/**
 * Tests for 06-evaluator-upgrade: Evaluator Ternary Decision + Content Size
 *
 * Tests the upgraded evaluator that returns a ternary decision
 * (needs_formatting | no_formatting_needed | not_a_brainlift)
 * plus contentSizeChars. OpenRouter API is mocked via globalThis.fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { HierarchyNode } from '@shared/hierarchy-types';

// ═══════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════

// Mock the hierarchy extractor to avoid running the real extractor in tests
vi.mock('../../hierarchyExtractor', () => ({
  extractAllFromHierarchy: vi.fn().mockReturnValue({
    facts: [],
    dok2Summaries: [],
    dok3Insights: [],
    dok4Spovs: [],
    metadata: {
      dok1NodesFound: 0,
      dok2NodesFound: 0,
      dok3NodesFound: 0,
      dok4NodesFound: 0,
      totalFactsExtracted: 0,
      totalDOK2PointsExtracted: 0,
      totalDOK3InsightsExtracted: 0,
      totalDOK4SpovsExtracted: 0,
      sourcesAttributed: 0,
      categoriesFound: [],
    },
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeNode(
  name: string,
  children: HierarchyNode[] = [],
): HierarchyNode {
  return {
    id: `node_${Math.random().toString(36).slice(2, 8)}`,
    name,
    note: null,
    depth: 0,
    children,
    isDOK1Marker: false,
    isDOK2Marker: false,
    isDOK3Marker: false,
    isDOK4Marker: false,
    isSourceMarker: false,
    isCategoryMarker: false,
    isPurposeMarker: false,
    extractedUrl: null,
  };
}

/** Create a mock fetch returning a successful OpenRouter response */
function createMockFetch(responseBody: object) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(responseBody) } }],
    }),
  });
}

/** Create a mock fetch returning an HTTP error */
function createErrorFetch(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: async () => body,
  });
}

/** Create a mock fetch returning an empty choices array */
function createEmptyResponseFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [] }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('evaluateNeedsPreformat', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'test-key-123';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv !== undefined) {
      process.env.OPENROUTER_API_KEY = originalEnv;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // FR1: Ternary Decision Type and JSON Schema
  // ─────────────────────────────────────────────────────────────────────

  describe('FR1: Ternary Decision Type and JSON Schema', () => {
    it('returns needs_formatting decision for a BrainLift with no DOK markers', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'needs_formatting',
        confidence: 'high',
        reasons: ['No DOK markers found in the hierarchy'],
      });

      const hierarchy = [
        makeNode('My BrainLift', [
          makeNode('Some random notes'),
          makeNode('More stuff'),
        ]),
      ];

      const result = await evaluateNeedsPreformat(hierarchy);

      expect(result.decision).toBe('needs_formatting');
      expect(result.confidence).toBe('high');
      expect(result.reasons).toEqual(['No DOK markers found in the hierarchy']);
      // Verify needsPreformat field does NOT exist
      expect('needsPreformat' in result).toBe(false);
    });

    it('returns no_formatting_needed decision for a well-structured BrainLift', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'no_formatting_needed',
        confidence: 'high',
        reasons: ['All DOK sections present and properly structured'],
      });

      const hierarchy = [
        makeNode('Well Structured BL', [
          makeNode('DOK4 - SPOV', [makeNode('My bold claim')]),
          makeNode('DOK3 - Insights', [makeNode('Cross-source insight')]),
          makeNode('DOK2 - Knowledge Tree', [
            makeNode('Category 1', [
              makeNode('Source: Book A', [
                makeNode('DOK1 - facts', [makeNode('fact 1')]),
              ]),
            ]),
          ]),
        ]),
      ];

      const result = await evaluateNeedsPreformat(hierarchy);

      expect(result.decision).toBe('no_formatting_needed');
      expect(result.confidence).toBe('high');
    });

    it('returns not_a_brainlift decision for non-BrainLift content', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'not_a_brainlift',
        confidence: 'high',
        reasons: ['Content appears to be a to-do list, not a knowledge base'],
      });

      const hierarchy = [
        makeNode('Shopping List', [
          makeNode('Buy milk'),
          makeNode('Buy eggs'),
          makeNode('Call dentist'),
        ]),
      ];

      const result = await evaluateNeedsPreformat(hierarchy);

      expect(result.decision).toBe('not_a_brainlift');
      expect(result.confidence).toBe('high');
      expect(result.reasons).toContain('Content appears to be a to-do list, not a knowledge base');
    });

    it('sends JSON schema with decision enum (not boolean) to the LLM', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      const mockFetch = createMockFetch({
        decision: 'needs_formatting',
        confidence: 'medium',
        reasons: ['test'],
      });
      globalThis.fetch = mockFetch;

      await evaluateNeedsPreformat([makeNode('Test')]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // Verify the JSON schema has decision as enum, not needsPreformat as boolean
      const schema = body.response_format.json_schema.schema;
      expect(schema.properties.decision).toBeDefined();
      expect(schema.properties.decision.type).toBe('string');
      expect(schema.properties.decision.enum).toEqual([
        'needs_formatting',
        'no_formatting_needed',
        'not_a_brainlift',
      ]);
      expect(schema.properties.needsPreformat).toBeUndefined();
      expect(schema.required).toContain('decision');
      expect(schema.required).not.toContain('needsPreformat');
    });

    it('includes contentSizeChars in JSON schema required fields', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      const mockFetch = createMockFetch({
        decision: 'no_formatting_needed',
        confidence: 'high',
        reasons: [],
      });
      globalThis.fetch = mockFetch;

      await evaluateNeedsPreformat([makeNode('Test')]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const schema = body.response_format.json_schema.schema;

      // contentSizeChars is NOT in the LLM schema — it's computed locally
      expect(schema.properties.contentSizeChars).toBeUndefined();
      expect(schema.required).not.toContain('contentSizeChars');
    });

    it('system prompt describes all three decision outcomes', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      const mockFetch = createMockFetch({
        decision: 'no_formatting_needed',
        confidence: 'high',
        reasons: [],
      });
      globalThis.fetch = mockFetch;

      await evaluateNeedsPreformat([makeNode('Test')]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemPrompt = body.messages[0].content;

      expect(systemPrompt).toContain('needs_formatting');
      expect(systemPrompt).toContain('no_formatting_needed');
      expect(systemPrompt).toContain('not_a_brainlift');
    });

    it('result has decision, confidence, reasons, and contentSizeChars fields', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'needs_formatting',
        confidence: 'low',
        reasons: ['reason1', 'reason2'],
      });

      const result = await evaluateNeedsPreformat([makeNode('Test Node')]);

      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reasons');
      expect(result).toHaveProperty('contentSizeChars');
      expect(typeof result.decision).toBe('string');
      expect(typeof result.confidence).toBe('string');
      expect(Array.isArray(result.reasons)).toBe(true);
      expect(typeof result.contentSizeChars).toBe('number');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // FR2: Content Size Measurement
  // ─────────────────────────────────────────────────────────────────────

  describe('FR2: Content Size Measurement', () => {
    it('contentSizeChars matches serialized hierarchy length', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'no_formatting_needed',
        confidence: 'high',
        reasons: [],
      });

      const hierarchy = [
        makeNode('Root', [
          makeNode('Child 1', [makeNode('Grandchild A')]),
          makeNode('Child 2'),
        ]),
      ];

      const result = await evaluateNeedsPreformat(hierarchy);

      // Manually compute expected size using serializeSubtree logic:
      // "- Root\n  - Child 1\n    - Grandchild A\n  - Child 2\n"
      // The exact size depends on serializeSubtree implementation
      expect(result.contentSizeChars).toBeGreaterThan(0);
      expect(typeof result.contentSizeChars).toBe('number');

      // Verify it's the right ballpark for the content
      // "- Root\n" = 7, "  - Child 1\n" = 12, "    - Grandchild A\n" = 20, "  - Child 2\n" = 12
      // Total: 51 chars approximately
      expect(result.contentSizeChars).toBeGreaterThan(30);
      expect(result.contentSizeChars).toBeLessThan(100);
    });

    it('returns contentSizeChars of 0 for empty hierarchy', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createMockFetch({
        decision: 'not_a_brainlift',
        confidence: 'high',
        reasons: ['Empty document'],
      });

      const result = await evaluateNeedsPreformat([]);

      expect(result.contentSizeChars).toBe(0);
    });

    it('captures full size even when hierarchy exceeds truncation limit', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      const mockFetch = createMockFetch({
        decision: 'needs_formatting',
        confidence: 'medium',
        reasons: ['Large unstructured document'],
      });
      globalThis.fetch = mockFetch;

      // Create a large hierarchy that will exceed the 50K char truncation limit
      const children: HierarchyNode[] = [];
      for (let i = 0; i < 1000; i++) {
        children.push(
          makeNode(`Node ${i} with some extra text to make it longer and pad the character count significantly beyond the truncation threshold`),
        );
      }
      const hierarchy = [makeNode('Large Document', children)];

      const result = await evaluateNeedsPreformat(hierarchy);

      // contentSizeChars should reflect the FULL size, not the truncated 50K
      expect(result.contentSizeChars).toBeGreaterThan(50000);

      // But the LLM should receive truncated content
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = body.messages[1].content;
      expect(userMessage).toContain('[... truncated');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Error Cases
  // ─────────────────────────────────────────────────────────────────────

  describe('Error Cases', () => {
    it('throws when OPENROUTER_API_KEY is missing', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      delete process.env.OPENROUTER_API_KEY;

      await expect(evaluateNeedsPreformat([makeNode('Test')])).rejects.toThrow(
        'OpenRouter API key not configured',
      );
    });

    it('throws descriptive error when LLM returns invalid JSON', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
      });

      await expect(
        evaluateNeedsPreformat([makeNode('Test')]),
      ).rejects.toThrow();
    });

    it('throws descriptive error when LLM returns empty response', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createEmptyResponseFetch();

      await expect(
        evaluateNeedsPreformat([makeNode('Test')]),
      ).rejects.toThrow('No response content from evaluation LLM');
    });

    it('throws with status code when API returns HTTP error', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      globalThis.fetch = createErrorFetch(429, 'Rate limit exceeded');

      await expect(
        evaluateNeedsPreformat([makeNode('Test')]),
      ).rejects.toThrow('Evaluation API error 429');
    });
  });
});
