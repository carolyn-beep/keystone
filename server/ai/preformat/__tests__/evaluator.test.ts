/**
 * Tests for evaluator (unified client migration)
 *
 * Tests the evaluator that returns a ternary decision
 * (needs_formatting | no_formatting_needed | not_a_brainlift)
 * plus contentSizeChars. callModel from unified client is mocked.
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

// Mock the unified AI client
vi.mock('../../client', () => ({
  callModel: vi.fn(),
}));

import { callModel } from '../../client';

const mockCallModel = vi.mocked(callModel);

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

/** Configure mock callModel to return a successful response */
function mockCallModelResponse(responseBody: object) {
  mockCallModel.mockResolvedValue({
    content: JSON.stringify(responseBody),
    model: 'anthropic/claude-opus-4-6',
    durationMs: 500,
    attempts: 1,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('evaluateNeedsPreformat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // FR1: Ternary Decision Type and JSON Schema
  // ─────────────────────────────────────────────────────────────────────

  describe('FR1: Ternary Decision Type and JSON Schema', () => {
    it('returns needs_formatting decision for a BrainLift with no DOK markers', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
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

      mockCallModelResponse({
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

      mockCallModelResponse({
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

    it('calls callModel with correct caller and responseFormat', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
        decision: 'needs_formatting',
        confidence: 'medium',
        reasons: ['test'],
      });

      await evaluateNeedsPreformat([makeNode('Test')]);

      expect(mockCallModel).toHaveBeenCalledTimes(1);
      const callArgs = mockCallModel.mock.calls[0][0];

      expect(callArgs.caller).toBe('preformat.evaluator');
      expect(callArgs.model).toBe('anthropic/claude-opus-4-6');
      expect(callArgs.temperature).toBe(0);

      // Verify the responseFormat has decision as enum
      const schema = (callArgs.responseFormat as { type: string; jsonSchema: { schema: Record<string, unknown> } }).jsonSchema.schema;
      expect((schema.properties as Record<string, unknown>)).toHaveProperty('decision');
      const decisionProp = (schema.properties as Record<string, Record<string, unknown>>).decision;
      expect(decisionProp.type).toBe('string');
      expect(decisionProp.enum).toEqual([
        'needs_formatting',
        'no_formatting_needed',
        'not_a_brainlift',
      ]);
    });

    it('system prompt describes all three decision outcomes', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
        decision: 'no_formatting_needed',
        confidence: 'high',
        reasons: [],
      });

      await evaluateNeedsPreformat([makeNode('Test')]);

      const callArgs = mockCallModel.mock.calls[0][0];
      const systemPrompt = callArgs.system!;

      expect(systemPrompt).toContain('needs_formatting');
      expect(systemPrompt).toContain('no_formatting_needed');
      expect(systemPrompt).toContain('not_a_brainlift');
    });

    it('result has decision, confidence, reasons, and contentSizeChars fields', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
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

      mockCallModelResponse({
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

      expect(result.contentSizeChars).toBeGreaterThan(0);
      expect(typeof result.contentSizeChars).toBe('number');
      expect(result.contentSizeChars).toBeGreaterThan(30);
      expect(result.contentSizeChars).toBeLessThan(100);
    });

    it('returns contentSizeChars of 0 for empty hierarchy', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
        decision: 'not_a_brainlift',
        confidence: 'high',
        reasons: ['Empty document'],
      });

      const result = await evaluateNeedsPreformat([]);

      expect(result.contentSizeChars).toBe(0);
    });

    it('captures full size even when hierarchy exceeds truncation limit', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModelResponse({
        decision: 'needs_formatting',
        confidence: 'medium',
        reasons: ['Large unstructured document'],
      });

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
      const callArgs = mockCallModel.mock.calls[0][0];
      const userMessage = callArgs.messages[0].content;
      expect(userMessage).toContain('[... truncated');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Error Cases
  // ─────────────────────────────────────────────────────────────────────

  describe('Error Cases', () => {
    it('throws when callModel fails', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModel.mockRejectedValue(new Error('API error 429'));

      await expect(evaluateNeedsPreformat([makeNode('Test')])).rejects.toThrow(
        'API error 429',
      );
    });

    it('throws when callModel returns unparseable JSON content', async () => {
      const { evaluateNeedsPreformat } = await import('../evaluator');

      mockCallModel.mockResolvedValue({
        content: 'not valid json {{{',
        model: 'anthropic/claude-opus-4-6',
        durationMs: 100,
        attempts: 1,
      });

      await expect(
        evaluateNeedsPreformat([makeNode('Test')]),
      ).rejects.toThrow();
    });
  });
});
