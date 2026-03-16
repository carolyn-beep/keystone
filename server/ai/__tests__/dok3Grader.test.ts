/**
 * Tests for 03-migrate-dok3: DOK3 Grader Migration to Unified AI Client
 *
 * Validates that dok3Grader.ts uses callModelWithFallback from the unified
 * client instead of inline fetch + pRetry. Tests cover:
 * - FR1: Source traceability uses callModelWithFallback with correct params
 * - FR2: Conceptual coherence uses callModelWithFallback with correct params
 * - FR3: Infrastructure removal (no pRetry, no DOK3_MODELS imports)
 * - FR4: Pipeline orchestration preserved
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DOK3EvaluationContext } from '../../storage/dok3';

// ─── Mock Setup ──────────────────────────────────────────────────────────────

// Mock the unified client module
const mockCallModelWithFallback = vi.fn();
vi.mock('../client', () => ({
  callModelWithFallback: (...args: unknown[]) => mockCallModelWithFallback(...args),
}));

// Mock storage
const mockStorage = {
  updateDOK3InsightStatus: vi.fn().mockResolvedValue(undefined),
  checkFoundationGraded: vi.fn().mockResolvedValue({ ready: true, pendingDok2Count: 0, pendingDok1Count: 0 }),
  getInsightEvaluationContext: vi.fn(),
  saveDOK3GradeResult: vi.fn().mockResolvedValue(undefined),
  getDOK3Insights: vi.fn(),
};

vi.mock('../../storage', () => ({
  storage: new Proxy({}, {
    get: (_target, prop) => {
      return (mockStorage as Record<string, unknown>)[prop as string];
    },
  }),
}));

// Mock p-limit (still used for concurrency control)
vi.mock('p-limit', () => ({
  default: () => <T>(fn: () => Promise<T>) => fn(),
}));

// ─── Import module under test (after mocks) ─────────────────────────────────

import {
  checkSourceTraceability,
  computeFoundationIndex,
  computeFinalScore,
  gradeDOK3Insight,
} from '../dok3Grader';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const FIXTURE_INSIGHT_TEXT = 'Cross-source analysis reveals that compound skills emerge over time and are not captured by standardized testing.';

const FIXTURE_BRAINLIFT_PURPOSE = 'Research into alternative educational assessment methods.';

function makeEvaluationContext(overrides?: Partial<DOK3EvaluationContext>): DOK3EvaluationContext {
  return {
    insight: { id: 1, text: FIXTURE_INSIGHT_TEXT, brainliftId: 10 },
    brainliftPurpose: FIXTURE_BRAINLIFT_PURPOSE,
    linkedDok2s: [
      {
        id: 100,
        sourceName: 'Smith 2024',
        sourceUrl: 'https://example.com/smith2024',
        displayTitle: null,
        grade: 4,
        points: ['Standardized tests miss compound skills'],
        dok1Facts: [
          { id: 1, fact: 'Tests measure discrete knowledge', score: 5, isGradeable: true },
          { id: 2, fact: 'Compound skills take months to emerge', score: 4, isGradeable: true },
        ],
      },
      {
        id: 101,
        sourceName: 'Jones 2023',
        sourceUrl: 'https://example.com/jones2023',
        displayTitle: null,
        grade: 3,
        points: ['Skill stacks create emergent capabilities'],
        dok1Facts: [
          { id: 3, fact: 'Skill stacking produces greater capabilities', score: 4, isGradeable: true },
        ],
      },
    ],
    sourceEvidence: new Map([
      ['https://example.com/smith2024', 'Full text content from Smith 2024...'],
      ['https://example.com/jones2023', 'Full text content from Jones 2023...'],
    ]),
    ...overrides,
  };
}

const TRACEABILITY_RESPONSE = JSON.stringify({
  flagged: false,
  reasoning: 'The insight synthesizes across multiple sources.',
});

const TRACEABILITY_FLAGGED_RESPONSE = JSON.stringify({
  flagged: true,
  reasoning: 'This insight is fully contained in the source.',
});

const EVALUATION_RESPONSE = JSON.stringify({
  framework_name: 'Compound Skills Gap',
  framework_description: 'Assessment framework for compound skill measurement.',
  criteria: {
    V1: { assessment: 'strong', evidence: 'Clear cross-source synthesis.' },
    V2: { assessment: 'strong', evidence: 'Supports brainlift purpose.' },
    V3: { assessment: 'partial', evidence: 'Some novel framing.' },
    C1: { assessment: 'strong', evidence: 'Logically coherent argument.' },
    C2: { assessment: 'strong', evidence: 'Well-structured reasoning.' },
    P1: { assessment: 'partial', evidence: 'Moderate actionability.' },
    P2: { assessment: 'strong', evidence: 'Clear practical implications.' },
  },
  score: 4,
  rationale: 'Strong cross-source synthesis with clear practical value.',
  feedback: 'Consider strengthening the novel framing aspect.',
});

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCallModelWithFallback.mockReset();
  Object.values(mockStorage).forEach(fn => fn.mockClear());
  mockStorage.checkFoundationGraded.mockResolvedValue({ ready: true, pendingDok2Count: 0, pendingDok1Count: 0 });
  mockStorage.updateDOK3InsightStatus.mockResolvedValue(undefined);
  mockStorage.saveDOK3GradeResult.mockResolvedValue(undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Source Traceability Migration
// ═══════════════════════════════════════════════════════════════════════════

describe('FR1: checkSourceTraceability — unified client', () => {
  it('calls callModelWithFallback with correct models for each source', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });

    const context = makeEvaluationContext();
    await checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context);

    // Should be called once per unique source (2 sources in fixture)
    expect(mockCallModelWithFallback).toHaveBeenCalledTimes(2);

    // Check first call has correct models array
    const firstCall = mockCallModelWithFallback.mock.calls[0][0];
    expect(firstCall.models).toEqual([
      'google/gemini-2.0-flash-001',
      'anthropic/claude-sonnet-4.5',
    ]);
  });

  it('passes correct system prompt, temperature, responseFormat, and caller', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });

    const context = makeEvaluationContext();
    await checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];

    // System prompt
    expect(callArgs.system).toBeDefined();
    expect(typeof callArgs.system).toBe('string');

    // Temperature
    expect(callArgs.temperature).toBe(0.1);

    // Response format
    expect(callArgs.responseFormat).toBeDefined();
    expect(callArgs.responseFormat.type).toBe('json_schema');
    expect(callArgs.responseFormat.jsonSchema).toBeDefined();
    expect(callArgs.responseFormat.jsonSchema.name).toBe('dok3_traceability');

    // Caller tag
    expect(callArgs.caller).toBe('dok3Grader.traceability');

    // Timeout and retries
    expect(callArgs.timeout).toBe(60_000);
    expect(callArgs.retries).toBe(2);
  });

  it('passes user message with source-specific content', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });

    const context = makeEvaluationContext();
    await checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.messages).toHaveLength(1);
    expect(callArgs.messages[0].role).toBe('user');
    expect(typeof callArgs.messages[0].content).toBe('string');
  });

  it('returns { flagged: false } when no sources are flagged', async () => {
    mockCallModelWithFallback.mockResolvedValue({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });

    const context = makeEvaluationContext();
    const result = await checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context);

    expect(result.flagged).toBe(false);
    expect(result.flaggedSource).toBeNull();
  });

  it('returns { flagged: true } when a source is flagged', async () => {
    // First source: flagged. Second source: not flagged.
    mockCallModelWithFallback
      .mockResolvedValueOnce({
        content: TRACEABILITY_FLAGGED_RESPONSE,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 500,
        attempts: 1,
      })
      .mockResolvedValueOnce({
        content: TRACEABILITY_RESPONSE,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 500,
        attempts: 1,
      });

    const context = makeEvaluationContext();
    const result = await checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context);

    expect(result.flagged).toBe(true);
    expect(result.flaggedSource).toBeTruthy();
  });

  it('propagates error when a source LLM call fails completely', async () => {
    // First source succeeds, second fails
    mockCallModelWithFallback
      .mockResolvedValueOnce({
        content: TRACEABILITY_RESPONSE,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 500,
        attempts: 1,
      })
      .mockRejectedValueOnce(new Error('All models failed'));

    const context = makeEvaluationContext();
    await expect(checkSourceTraceability(FIXTURE_INSIGHT_TEXT, context)).rejects.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR2: Conceptual Coherence Migration
// ═══════════════════════════════════════════════════════════════════════════

describe('FR2: evaluateConceptualCoherence — unified client (via gradeDOK3Insight)', () => {
  // We test coherence indirectly through gradeDOK3Insight since evaluateConceptualCoherence is not exported

  function setupFullPipelineMocks(context: DOK3EvaluationContext) {
    mockStorage.getInsightEvaluationContext.mockResolvedValue(context);

    // First N calls = traceability (one per source), last call = coherence evaluation
    const sourceCount = new Set(
      context.linkedDok2s.map(d =>
        d.sourceUrl
          ? d.sourceUrl.toLowerCase().replace(/\/+$/, '')
          : d.sourceName.toLowerCase().trim()
      )
    ).size;

    for (let i = 0; i < sourceCount; i++) {
      mockCallModelWithFallback.mockResolvedValueOnce({
        content: TRACEABILITY_RESPONSE,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 500,
        attempts: 1,
      });
    }

    // Coherence evaluation call
    mockCallModelWithFallback.mockResolvedValueOnce({
      content: EVALUATION_RESPONSE,
      model: 'anthropic/claude-opus-4.6',
      durationMs: 2000,
      attempts: 1,
    });
  }

  it('calls callModelWithFallback with correct models for coherence', async () => {
    const context = makeEvaluationContext();
    setupFullPipelineMocks(context);

    await gradeDOK3Insight(1, 10);

    // Find the coherence call (last one)
    const lastCall = mockCallModelWithFallback.mock.calls[mockCallModelWithFallback.mock.calls.length - 1][0];
    expect(lastCall.models).toEqual([
      'anthropic/claude-opus-4.6',
      'anthropic/claude-sonnet-4.5',
    ]);
  });

  it('passes correct temperature, responseFormat, and caller for coherence', async () => {
    const context = makeEvaluationContext();
    setupFullPipelineMocks(context);

    await gradeDOK3Insight(1, 10);

    const lastCall = mockCallModelWithFallback.mock.calls[mockCallModelWithFallback.mock.calls.length - 1][0];

    expect(lastCall.temperature).toBe(0.1);
    expect(lastCall.timeout).toBe(60_000);
    expect(lastCall.retries).toBe(2);
    expect(lastCall.responseFormat.type).toBe('json_schema');
    expect(lastCall.responseFormat.jsonSchema.name).toBe('dok3_evaluation');
    expect(lastCall.caller).toBe('dok3Grader.coherence');
  });

  it('uses model from callModelResult for evaluatorModel', async () => {
    const context = makeEvaluationContext();
    setupFullPipelineMocks(context);

    const result = await gradeDOK3Insight(1, 10);

    expect(result.evaluatorModel).toBe('anthropic/claude-opus-4.6');
  });

  it('captures fallback model when primary fails', async () => {
    const context = makeEvaluationContext();
    mockStorage.getInsightEvaluationContext.mockResolvedValue(context);

    // Traceability calls
    mockCallModelWithFallback.mockResolvedValueOnce({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });
    mockCallModelWithFallback.mockResolvedValueOnce({
      content: TRACEABILITY_RESPONSE,
      model: 'google/gemini-2.0-flash-001',
      durationMs: 500,
      attempts: 1,
    });

    // Coherence evaluation -- fallback model used
    mockCallModelWithFallback.mockResolvedValueOnce({
      content: EVALUATION_RESPONSE,
      model: 'anthropic/claude-sonnet-4.5',
      durationMs: 1500,
      attempts: 2,
    });

    const result = await gradeDOK3Insight(1, 10);
    expect(result.evaluatorModel).toBe('anthropic/claude-sonnet-4.5');
  });

  it('parses evaluation response through extractJSON and Zod schema', async () => {
    const context = makeEvaluationContext();
    setupFullPipelineMocks(context);

    const result = await gradeDOK3Insight(1, 10);

    // Verify the parsed result structure
    expect(result.frameworkName).toBe('Compound Skills Gap');
    expect(result.frameworkDescription).toBe('Assessment framework for compound skill measurement.');
    expect(result.criteriaBreakdown).toBeDefined();
    expect(result.criteriaBreakdown.V1.assessment).toBe('strong');
    expect(result.rationale).toBe('Strong cross-source synthesis with clear practical value.');
    expect(result.feedback).toBe('Consider strengthening the novel framing aspect.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Infrastructure Removal
// ═══════════════════════════════════════════════════════════════════════════

describe('FR3: infrastructure removal verification', () => {
  it('dok3Grader.ts does not import pRetry or AbortError', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../dok3Grader.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]p-retry['"]/);
    expect(content).not.toMatch(/\bAbortError\b/);
  });

  it('dok3Grader.ts does not import DOK3_MODELS from shared/schema', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../dok3Grader.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).not.toMatch(/DOK3_MODELS/);
  });

  it('dok3Grader.ts imports callModelWithFallback from ./client', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../dok3Grader.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/import\s+.*callModelWithFallback.*from\s+['"]\.\/client['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR4: Pipeline Orchestration
// ═══════════════════════════════════════════════════════════════════════════

describe('FR4: gradeDOK3Insight — pipeline orchestration preserved', () => {
  function setupFullMocks(context: DOK3EvaluationContext) {
    mockStorage.getInsightEvaluationContext.mockResolvedValue(context);

    const sourceCount = new Set(
      context.linkedDok2s.map(d =>
        d.sourceUrl
          ? d.sourceUrl.toLowerCase().replace(/\/+$/, '')
          : d.sourceName.toLowerCase().trim()
      )
    ).size;

    for (let i = 0; i < sourceCount; i++) {
      mockCallModelWithFallback.mockResolvedValueOnce({
        content: TRACEABILITY_RESPONSE,
        model: 'google/gemini-2.0-flash-001',
        durationMs: 500,
        attempts: 1,
      });
    }

    mockCallModelWithFallback.mockResolvedValueOnce({
      content: EVALUATION_RESPONSE,
      model: 'anthropic/claude-opus-4.6',
      durationMs: 2000,
      attempts: 1,
    });
  }

  it('calls steps in correct order: foundation -> traceability -> coherence -> final score', async () => {
    const context = makeEvaluationContext();
    setupFullMocks(context);

    const result = await gradeDOK3Insight(1, 10);

    // Foundation metrics are computed (pure math)
    expect(result.foundationIntegrityIndex).toBeDefined();
    expect(result.dok1FoundationScore).toBeDefined();
    expect(result.dok2SynthesisScore).toBeDefined();

    // Traceability was checked
    expect(result.traceabilityFlagged).toBe(false);

    // Evaluation was done (score computed)
    expect(result.score).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('fires progress callbacks at expected stages', async () => {
    const context = makeEvaluationContext();
    setupFullMocks(context);

    const progressEvents: Array<{ stage: string }> = [];
    const onProgress = vi.fn((event: { stage: string }) => {
      progressEvents.push(event);
    });

    await gradeDOK3Insight(1, 10, onProgress);

    const stages = progressEvents.map(e => e.stage);
    expect(stages).toContain('dok3:foundation');
    expect(stages).toContain('dok3:traceability');
    expect(stages).toContain('dok3:evaluation');
    expect(stages).toContain('dok3:complete');

    // Verify order
    const foundationIdx = stages.indexOf('dok3:foundation');
    const traceIdx = stages.indexOf('dok3:traceability');
    const evalIdx = stages.indexOf('dok3:evaluation');
    const completeIdx = stages.indexOf('dok3:complete');
    expect(foundationIdx).toBeLessThan(traceIdx);
    expect(traceIdx).toBeLessThan(evalIdx);
    expect(evalIdx).toBeLessThan(completeIdx);
  });

  it('sets insight status to error on pipeline failure', async () => {
    const context = makeEvaluationContext();
    mockStorage.getInsightEvaluationContext.mockResolvedValue(context);

    // All LLM calls fail
    mockCallModelWithFallback.mockRejectedValue(new Error('All models failed'));

    await expect(gradeDOK3Insight(1, 10)).rejects.toThrow();
    expect(mockStorage.updateDOK3InsightStatus).toHaveBeenCalledWith(1, 10, 'error');
  });

  it('applies ceiling to raw score from evaluation', async () => {
    const context = makeEvaluationContext({
      linkedDok2s: [
        {
          id: 100,
          sourceName: 'Low Quality Source',
          sourceUrl: 'https://example.com/low',
          displayTitle: null,
          grade: 2,
          points: ['Some point'],
          dok1Facts: [
            { id: 1, fact: 'Low quality fact', score: 2, isGradeable: true },
          ],
        },
      ],
      sourceEvidence: new Map([
        ['https://example.com/low', 'Content...'],
      ]),
    });
    setupFullMocks(context);

    const result = await gradeDOK3Insight(1, 10);

    // With low foundation scores, ceiling should be <= 3
    // Raw eval score is 4, so final should be capped
    expect(result.ceiling).toBeLessThanOrEqual(4);
    expect(result.score).toBeLessThanOrEqual(result.ceiling);
  });

  it('saves grade result to storage', async () => {
    const context = makeEvaluationContext();
    setupFullMocks(context);

    await gradeDOK3Insight(1, 10);

    expect(mockStorage.saveDOK3GradeResult).toHaveBeenCalledOnce();
    const [insightId, gradeData] = mockStorage.saveDOK3GradeResult.mock.calls[0];
    expect(insightId).toBe(1);
    expect(gradeData.score).toBeDefined();
    expect(gradeData.frameworkName).toBe('Compound Skills Gap');
    expect(gradeData.evaluatorModel).toBe('anthropic/claude-opus-4.6');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Pure Math Functions (unchanged — regression tests)
// ═══════════════════════════════════════════════════════════════════════════

describe('computeFoundationIndex — regression', () => {
  it('computes weighted median of DOK1 scores and mean of DOK2 grades', () => {
    const context = makeEvaluationContext();
    const result = computeFoundationIndex(context);

    // DOK1: scores [5, 4, 4], weighted median = 4
    // DOK2: grades [4, 3], mean = 3.5
    // Index: 0.4 * 4 + 0.6 * 3.5 = 1.6 + 2.1 = 3.7
    expect(result.dok1Score).toBe(4);
    expect(result.dok2Score).toBe(3.5);
    expect(result.index).toBeCloseTo(3.7, 2);
    expect(result.ceiling).toBe(4); // 3.0 <= 3.7 < 4.0 => ceiling 4
  });
});

describe('computeFinalScore — regression', () => {
  it('caps score at ceiling', () => {
    expect(computeFinalScore(5, 3)).toBe(3);
    expect(computeFinalScore(4, 4)).toBe(4);
    expect(computeFinalScore(2, 5)).toBe(2);
  });

  it('clamps between 1 and 5', () => {
    expect(computeFinalScore(0, 5)).toBe(1);
    expect(computeFinalScore(6, 5)).toBe(5);
  });
});
