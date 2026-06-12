/**
 * Tests for 02-context-aware-regrading
 *
 * Validates that all DOK grading pipelines (DOK1-4) correctly inject
 * previous evaluation context into prompts when provided, and remain
 * backwards compatible when omitted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PreviousEvaluation } from '@shared/types/regrading';

// ─── FR1: PreviousEvaluation Type + Helpers ─────────────────────────────────

describe('FR1: PreviousEvaluation shared type and helpers', () => {
  it('exports PreviousEvaluation type with all required fields', async () => {
    const { formatPreviousEvaluationSection, formatRegradingRules } = await import('@shared/types/regrading');

    const prev: PreviousEvaluation = {
      previousScore: 3,
      previousFeedback: 'Needs more synthesis',
      oldText: 'old content',
      newText: 'new improved content',
      editNumber: 1,
    };

    // Type check: all required fields exist
    expect(prev.previousScore).toBe(3);
    expect(prev.previousFeedback).toBe('Needs more synthesis');
    expect(prev.oldText).toBe('old content');
    expect(prev.newText).toBe('new improved content');
    expect(prev.editNumber).toBe(1);

    // Helpers are exported
    expect(typeof formatPreviousEvaluationSection).toBe('function');
    expect(typeof formatRegradingRules).toBe('function');
  });

  it('formatPreviousEvaluationSection includes all fields when present', async () => {
    const { formatPreviousEvaluationSection } = await import('@shared/types/regrading');

    const prev: PreviousEvaluation = {
      previousScore: 4,
      previousFeedback: 'Good but needs clarity',
      previousDiagnosis: 'Strong synthesis, weak articulation',
      previousRationale: 'Framework is visible but evidence is thin',
      previousCriteriaBreakdown: {
        V1: { assessment: 'strong', evidence: 'Clear framework' },
        C1: { assessment: 'weak', evidence: 'Missing DOK1 support' },
      },
      oldText: 'Original insight text',
      newText: 'Revised insight text with more evidence',
      editNumber: 2,
    };

    const section = formatPreviousEvaluationSection(prev);

    expect(section).toContain('PREVIOUS EVALUATION');
    expect(section).toContain('Re-grade #2');
    expect(section).toContain('Previous Score: 4/5');
    expect(section).toContain('Good but needs clarity');
    expect(section).toContain('Strong synthesis, weak articulation');
    expect(section).toContain('Framework is visible but evidence is thin');
    expect(section).toContain('V1: strong');
    expect(section).toContain('C1: weak');
    expect(section).toContain('Original insight text');
    expect(section).toContain('Revised insight text with more evidence');
  });

  it('formatPreviousEvaluationSection omits optional fields when absent', async () => {
    const { formatPreviousEvaluationSection } = await import('@shared/types/regrading');

    const prev: PreviousEvaluation = {
      previousScore: 2,
      previousFeedback: 'Copy-paste detected',
      oldText: 'copied text',
      newText: 'rewritten text',
      editNumber: 1,
    };

    const section = formatPreviousEvaluationSection(prev);

    expect(section).toContain('PREVIOUS EVALUATION');
    expect(section).toContain('Re-grade #1');
    expect(section).toContain('Previous Score: 2/5');
    expect(section).toContain('Copy-paste detected');
    expect(section).not.toContain('Previous Diagnosis');
    expect(section).not.toContain('Previous Rationale');
    expect(section).not.toContain('Previous Criteria');
  });

  it('formatRegradingRules returns hard floor rule text', async () => {
    const { formatRegradingRules } = await import('@shared/types/regrading');

    const rules = formatRegradingRules();

    expect(rules).toContain('RE-GRADING RULES');
    expect(rules).toContain('MUST be >= the previous score');
    expect(rules).toContain('NEW PROBLEMS');
    expect(rules).toContain('previous feedback');
  });
});

// ─── FR2: DOK1 Regrading Prompt Support ─────────────────────────────────────

describe('FR2: DOK1 regrading prompt support', () => {
  const mockCallModelWithFallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function importFactVerifier() {
    vi.doMock('../../ai/client/index', () => ({
      callModelWithFallback: mockCallModelWithFallback,
    }));
    return await import('../../ai/factVerifier');
  }

  it('includes re-grading rules in system prompt when previousEvaluation provided', async () => {
    const { verifyFactWithAllModels } = await importFactVerifier();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ score: 4, rationale: 'Improved', isNonGradeable: false }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    const prev: PreviousEvaluation = {
      previousScore: 3,
      previousFeedback: 'Needs source support',
      oldText: 'old fact',
      newText: 'new fact with evidence',
      editNumber: 1,
    };

    await verifyFactWithAllModels('new fact with evidence', 'Source A', 'Evidence text', false, prev);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.system).toContain('RE-GRADING RULES');
    expect(callArgs.system).toContain('MUST be >= the previous score');
  });

  it('appends PREVIOUS EVALUATION section to user prompt when provided', async () => {
    const { verifyFactWithAllModels } = await importFactVerifier();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ score: 4, rationale: 'Improved', isNonGradeable: false }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    const prev: PreviousEvaluation = {
      previousScore: 2,
      previousFeedback: 'Claim is oversimplified',
      oldText: 'old fact text',
      newText: 'new fact text with nuance',
      editNumber: 1,
    };

    await verifyFactWithAllModels('new fact text with nuance', 'Source B', 'Evidence', false, prev);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    const userPrompt = callArgs.messages[0].content;
    expect(userPrompt).toContain('PREVIOUS EVALUATION');
    expect(userPrompt).toContain('Previous Score: 2/5');
    expect(userPrompt).toContain('Claim is oversimplified');
    expect(userPrompt).toContain('old fact text');
    expect(userPrompt).toContain('new fact text with nuance');
  });

  it('produces identical prompts when previousEvaluation is undefined (backwards compatible)', async () => {
    const { verifyFactWithAllModels } = await importFactVerifier();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ score: 4, rationale: 'Good', isNonGradeable: false }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    await verifyFactWithAllModels('some fact', 'Source', 'Evidence', false);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.system).not.toContain('RE-GRADING RULES');
    expect(callArgs.messages[0].content).not.toContain('PREVIOUS EVALUATION');
  });
});

// ─── FR3: DOK2 Regrading Prompt Support ─────────────────────────────────────

describe('FR3: DOK2 regrading prompt support', () => {
  const mockCallModelWithFallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function importDok2Grader() {
    vi.doMock('../../ai/client/index', () => ({
      callModelWithFallback: mockCallModelWithFallback,
    }));
    vi.doMock('../../ai/evidenceFetcher', () => ({
      fetchEvidenceForFact: vi.fn().mockResolvedValue({ content: '', error: null }),
    }));
    return await import('../../ai/dok2Grader');
  }

  it('includes re-grading rules in system prompt when previousEvaluation provided', async () => {
    const { gradeDOK2Summary } = await importDok2Grader();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ displayTitle: 'Test', score: 4, diagnosis: 'Good', feedback: 'Well done', failReason: null }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    const prev: PreviousEvaluation = {
      previousScore: 3,
      previousFeedback: 'Needs unique lens',
      previousDiagnosis: 'Generic synthesis',
      oldText: 'old summary',
      newText: 'new summary with unique perspective',
      editNumber: 1,
    };

    await gradeDOK2Summary(['Point 1'], [{ fact: 'Fact 1', source: 'Src' }], 'Purpose', null, undefined, undefined, prev);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.system).toContain('RE-GRADING RULES');
    expect(callArgs.system).toContain('MUST be >= the previous score');
  });

  it('appends PREVIOUS EVALUATION section with diagnosis to user prompt', async () => {
    const { gradeDOK2Summary } = await importDok2Grader();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ displayTitle: 'Test', score: 4, diagnosis: 'Good', feedback: 'Done', failReason: null }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    const prev: PreviousEvaluation = {
      previousScore: 2,
      previousFeedback: 'Improve synthesis',
      previousDiagnosis: 'Copy-paste detected',
      oldText: 'old summary points',
      newText: 'new summary with real synthesis',
      editNumber: 2,
    };

    await gradeDOK2Summary(['Point 1'], [{ fact: 'F1' }], 'Purpose', null, undefined, undefined, prev);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    const userPrompt = callArgs.messages[0].content;
    expect(userPrompt).toContain('PREVIOUS EVALUATION');
    expect(userPrompt).toContain('Re-grade #2');
    expect(userPrompt).toContain('Copy-paste detected');
  });

  it('produces identical behavior when previousEvaluation is undefined', async () => {
    const { gradeDOK2Summary } = await importDok2Grader();

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({ displayTitle: 'Test', score: 3, diagnosis: 'OK', feedback: 'Fine', failReason: null }),
      model: 'qwen/qwen-plus',
      durationMs: 300,
      attempts: 1,
    });

    await gradeDOK2Summary(['Point 1'], [{ fact: 'F1' }], 'Purpose');

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.system).not.toContain('RE-GRADING RULES');
    expect(callArgs.messages[0].content).not.toContain('PREVIOUS EVALUATION');
  });
});

// ─── FR4: DOK3 Regrading Prompt Wiring ──────────────────────────────────────

describe('FR4: DOK3 regrading prompt wiring', () => {
  it('buildDOK3UserPrompt formats previous evaluation section when non-null', async () => {
    const { buildDOK3UserPrompt } = await import('../../../server/prompts/dok3-grading');

    const evidence = {
      linkedDok2s: [
        { sourceName: 'Source A', grade: 4, points: ['Point 1'], dok1Facts: [{ fact: 'Fact 1', score: 4 }] },
      ],
      sourceEvidence: new Map<string, { sourceName: string; content: string }>(),
      foundationMetrics: { dok1Score: 4.0, dok2Score: 3.5, index: 3.7 },
      traceabilityStatus: 'clear',
      previousEvaluation: {
        previousScore: 3,
        previousFeedback: 'Strengthen evidence chain',
        previousRationale: 'Framework visible but weakly grounded',
        previousCriteriaBreakdown: {
          V1: { assessment: 'strong', evidence: 'Clear framework' },
          C1: { assessment: 'weak', evidence: 'Gaps in evidence' },
        },
        oldText: 'Original insight',
        newText: 'Revised insight with better evidence',
        editNumber: 1,
      },
    };

    const prompt = buildDOK3UserPrompt('Test purpose', 'Some insight text', evidence);

    expect(prompt).toContain('PREVIOUS EVALUATION');
    expect(prompt).toContain('Re-grade #1');
    expect(prompt).toContain('Previous Score: 3/5');
    expect(prompt).toContain('Strengthen evidence chain');
    expect(prompt).toContain('Framework visible but weakly grounded');
    expect(prompt).toContain('Original insight');
    expect(prompt).toContain('Revised insight with better evidence');
  });

  it('buildDOK3UserPrompt includes criteria breakdown in previous evaluation section', async () => {
    const { buildDOK3UserPrompt } = await import('../../../server/prompts/dok3-grading');

    const evidence = {
      linkedDok2s: [
        { sourceName: 'S', grade: 3, points: ['P1'], dok1Facts: [{ fact: 'F1', score: 3 }] },
      ],
      sourceEvidence: new Map<string, { sourceName: string; content: string }>(),
      foundationMetrics: { dok1Score: 3.0, dok2Score: 3.0, index: 3.0 },
      traceabilityStatus: 'clear',
      previousEvaluation: {
        previousScore: 2,
        previousFeedback: 'Borrowed framework',
        previousCriteriaBreakdown: {
          V1: { assessment: 'weak', evidence: 'No original framework' },
          V2: { assessment: 'weak', evidence: 'Same as source lens' },
          P1: { assessment: 'partial', evidence: 'Some added explanatory power' },
        },
        oldText: 'old',
        newText: 'new',
        editNumber: 1,
      },
    };

    const prompt = buildDOK3UserPrompt('Purpose', 'Insight', evidence);

    expect(prompt).toContain('V1: weak');
    expect(prompt).toContain('V2: weak');
    expect(prompt).toContain('P1: partial');
  });

  it('buildDOK3UserPrompt produces identical output when previousEvaluation is null', async () => {
    const { buildDOK3UserPrompt } = await import('../../../server/prompts/dok3-grading');

    const evidence = {
      linkedDok2s: [
        { sourceName: 'Source A', grade: 4, points: ['P1'], dok1Facts: [{ fact: 'F1', score: 4 }] },
      ],
      sourceEvidence: new Map<string, { sourceName: string; content: string }>(),
      foundationMetrics: { dok1Score: 4.0, dok2Score: 3.5, index: 3.7 },
      traceabilityStatus: 'clear',
      previousEvaluation: null,
    };

    const prompt = buildDOK3UserPrompt('Purpose', 'Insight text', evidence);

    expect(prompt).not.toContain('PREVIOUS EVALUATION');
    expect(prompt).not.toContain('Re-grade');
  });

  it('DOK3 system prompt contains hard floor rule language', async () => {
    const { DOK3_GRADING_SYSTEM_PROMPT } = await import('../../../server/prompts/dok3-grading');

    expect(DOK3_GRADING_SYSTEM_PROMPT).toContain('MUST be >= the previous score');
  });
});

// ─── FR5: DOK4 Regrading Prompt Support ─────────────────────────────────────

describe('FR5: DOK4 regrading prompt support', () => {
  it('buildQualityEvaluationUserPrompt appends PREVIOUS EVALUATION when context has previousEvaluation', async () => {
    const { buildQualityEvaluationUserPrompt } = await import('../../../server/prompts/dok4-grading');
    const { DOK4EvaluationContext } = await import('@shared/dok4-types').catch(() => ({}));

    const context = makeMinimalDOK4Context({
      previousEvaluation: {
        previousScore: 3,
        previousFeedback: 'Reasoning has gaps',
        previousRationale: 'Evidence trail incomplete',
        previousCriteriaBreakdown: {
          S1: { assessment: 'strong', evidence: 'Contested position' },
          S3: { assessment: 'weak', evidence: 'Missing DOK1 links' },
          // Legacy v1 key — should be scrubbed from the prompt by the formatter
          // so the v2 grader is not nudged toward criteria that no longer exist.
          O1: { assessment: 'partial', evidence: 'Some causal reasoning' },
        },
        oldText: 'Original SPOV',
        newText: 'Revised SPOV with better grounding',
        editNumber: 1,
      },
    });

    const prompt = buildQualityEvaluationUserPrompt(context);

    expect(prompt).toContain('PREVIOUS EVALUATION');
    expect(prompt).toContain('Re-grade #1');
    expect(prompt).toContain('Previous Score: 3/5');
    expect(prompt).toContain('Reasoning has gaps');
    expect(prompt).toContain('Evidence trail incomplete');
    expect(prompt).toContain('S1: strong');
    expect(prompt).toContain('S3: weak');
    // Legacy O1 must be scrubbed: the v2 grader does not produce O1, so surfacing
    // it in regrade context would confuse the model.
    expect(prompt).not.toContain('O1: partial');
    expect(prompt).not.toContain('Some causal reasoning');
    expect(prompt).toContain('Original SPOV');
    expect(prompt).toContain('Revised SPOV with better grounding');
  });

  it('buildQualityEvaluationUserPrompt produces identical output when previousEvaluation is undefined', async () => {
    const { buildQualityEvaluationUserPrompt } = await import('../../../server/prompts/dok4-grading');

    const context = makeMinimalDOK4Context();

    const prompt = buildQualityEvaluationUserPrompt(context);

    expect(prompt).not.toContain('PREVIOUS EVALUATION');
    expect(prompt).not.toContain('Re-grade');
  });

  it('DOK4 quality evaluation system prompt includes re-grading rules when present in context', async () => {
    // The system prompt itself is static. Re-grading rules are conditionally prepended.
    // We test via the evaluateDOK4Quality function which assembles the full call.
    const mockCallModelWithFallback = vi.fn();

    vi.doMock('../../ai/client', () => ({
      callModelWithFallback: mockCallModelWithFallback,
    }));

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        position_summary: 'Test position',
        framework_dependency: 'Test framework',
        key_evidence: ['evidence 1'],
        criteria: {
          S1: { assessment: 'strong', evidence: 'e' },
          S4: { assessment: 'strong', evidence: 'e' },
          P1: { assessment: 'strong', evidence: 'e' },
          S2: { assessment: 'partial', evidence: 'e' },
          S3: { assessment: 'strong', evidence: 'e' },
          O2: { assessment: 'partial', evidence: 'e' },
        },
        score: 4,
        rationale: 'Good SPOV',
        feedback: 'Minor improvements needed',
      }),
      model: 'anthropic/claude-opus-4.6',
      durationMs: 1000,
      attempts: 1,
    });

    const { evaluateDOK4Quality } = await import('../../ai/dok4Grader');

    const context = makeMinimalDOK4Context({
      previousEvaluation: {
        previousScore: 3,
        previousFeedback: 'Needs grounding',
        oldText: 'old',
        newText: 'new',
        editNumber: 1,
      },
    });

    await evaluateDOK4Quality(context);

    const callArgs = mockCallModelWithFallback.mock.calls[0][0];
    expect(callArgs.system).toContain('RE-GRADING RULES');
    expect(callArgs.system).toContain('MUST be >= the previous score');
  });
});

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeMinimalDOK4Context(overrides?: Record<string, unknown>) {
  return {
    brainliftPurpose: 'Test purpose',
    spovText: 'Test SPOV text',
    primaryDok3: {
      id: 1,
      text: 'Primary insight',
      score: 4,
      frameworkName: 'Test Framework',
      frameworkDescription: 'A test framework',
    },
    additionalDok3s: [],
    linkedDok2s: [{
      id: 1,
      sourceName: 'Source A',
      sourceUrl: null,
      grade: 4,
      points: ['Point 1'],
      dok1Facts: [{ id: 1, fact: 'Fact 1', score: 4, source: 'Src' }],
    }],
    sourceEvidence: [],
    foundationIndex: 3.8,
    foundationCeiling: 4,
    dok1FoundationScore: 4.0,
    dok2FoundationScore: 3.5,
    dok3FoundationScore: 4.0,
    traceabilityResult: null,
    divergenceResult: null,
    ...overrides,
  };
}
