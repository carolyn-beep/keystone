/**
 * Tests for DOK4 AI Grading Pipeline (02-migrate-dok4)
 *
 * Tests all 5 LLM-powered grading functions plus shared utilities.
 * LLM calls are mocked via unified AI client mock (callModelWithFallback).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DOK4EvaluationContext } from '@shared/dok4-types';
import { AllModelsFailed } from '../client/errors';

// ─── Mock Setup ──────────────────────────────────────────────────────────────

// Mock the unified AI client
const mockCallModelWithFallback = vi.fn();
vi.mock('../client', () => ({
  callModelWithFallback: (...args: unknown[]) => mockCallModelWithFallback(...args),
}));

// Helper to create a successful CallModelResult
function makeCallResult(content: string, model = 'google/gemini-2.0-flash-001') {
  return {
    content,
    model,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    costUsd: 0.001,
    durationMs: 500,
    attempts: 1,
  };
}

// Import module under test (after mocks)
import {
  extractJSON,
  validatePOV,
  checkDOK4SourceTraceability,
  checkLLMDivergence,
  evaluateDOK4Quality,
  assessAntimemetic,
} from '../dok4Grader';

beforeEach(() => {
  mockCallModelWithFallback.mockReset();
});


// ─── Test Fixtures ───────────────────────────────────────────────────────────

const FIXTURE_SPOV_TEXT = 'Schools should replace standardized testing with longitudinal skill-stack assessments because current metrics systematically undervalue compound skills that emerge over time.';

const FIXTURE_DOK3_TEXT = 'Educational metrics designed for discrete knowledge measurement fail to capture compound skills that emerge from sustained practice across multiple domains.';

const FIXTURE_BRAINLIFT_PURPOSE = 'Exploring alternative approaches to educational assessment and measurement.';

const FIXTURE_EVALUATION_CONTEXT: DOK4EvaluationContext = {
  brainliftPurpose: FIXTURE_BRAINLIFT_PURPOSE,
  spovText: FIXTURE_SPOV_TEXT,
  primaryDok3: {
    id: 1,
    text: FIXTURE_DOK3_TEXT,
    score: 4,
    frameworkName: 'Compound Skills Measurement Gap',
    frameworkDescription: 'A framework identifying how discrete testing fails compound skill assessment.',
  },
  additionalDok3s: [
    { id: 2, text: 'Longitudinal tracking reveals skill emergence patterns invisible to point-in-time tests.', score: 3 },
  ],
  linkedDok2s: [
    {
      id: 1,
      sourceName: 'Smith 2024 - Testing Reform',
      sourceUrl: 'https://example.com/smith2024',
      grade: 4,
      points: ['Current tests measure discrete knowledge', 'Compound skills take 6-12 months to emerge'],
      dok1Facts: [
        { id: 1, fact: 'Standardized tests measure discrete knowledge retrieval', score: 5, source: 'Smith 2024' },
        { id: 2, fact: 'Compound skills emerge over 6-12 month periods', score: 4, source: 'Smith 2024' },
      ],
    },
    {
      id: 2,
      sourceName: 'Jones 2023 - Skill Stacks',
      sourceUrl: 'https://example.com/jones2023',
      grade: 3,
      points: ['Skill stacks create emergent capabilities', 'Assessment must track trajectories'],
      dok1Facts: [
        { id: 3, fact: 'Skill stacking produces capabilities greater than sum of parts', score: 4, source: 'Jones 2023' },
      ],
    },
  ],
  sourceEvidence: [
    { sourceName: 'Smith 2024 - Testing Reform', sourceUrl: 'https://example.com/smith2024', content: 'Smith argues that standardized tests only capture discrete knowledge...' },
    { sourceName: 'Jones 2023 - Skill Stacks', sourceUrl: 'https://example.com/jones2023', content: 'Jones defines skill stacking as combining disparate skills...' },
  ],
  foundationIndex: 3.65,
  foundationCeiling: 4,
  dok1FoundationScore: 4.33,
  dok2FoundationScore: 3.5,
  dok3FoundationScore: 4,
  traceabilityResult: { flagged: false, flaggedSource: null, overlapSummary: null },
  divergenceResult: {
    question: 'What is the best approach to measuring educational outcomes?',
    vanillaResponse: 'The best approach to measuring educational outcomes combines standardized testing with formative assessments...',
  },
};

// Model ID constants for assertions
const MID_TIER_MODELS = ['google/gemini-2.0-flash-001', 'anthropic/claude-sonnet-4.5'];
const DIVERGENCE_TIER_MODELS = ['google/gemini-2.0-flash-001', 'anthropic/claude-haiku-4.5'];
const QUALITY_TIER_MODELS = ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.5'];


// =============================================================================
// extractJSON utility (unchanged — domain-level JSON extraction)
// =============================================================================

describe('extractJSON', () => {
  it('strips markdown fences and extracts JSON', () => {
    const raw = '```json\n{"accept": true, "rejection_reason": null}\n```';
    const result = extractJSON(raw);
    expect(result).toEqual({ accept: true, rejection_reason: null });
  });

  it('extracts JSON without markdown fences', () => {
    const raw = '{"accept": false, "rejection_reason": "Not a claim"}';
    const result = extractJSON(raw);
    expect(result).toEqual({ accept: false, rejection_reason: 'Not a claim' });
  });

  it('extracts JSON with surrounding text', () => {
    const raw = 'Here is the result:\n{"flagged": true}\nEnd of response';
    const result = extractJSON(raw);
    expect(result).toEqual({ flagged: true });
  });

  it('throws when no JSON found', () => {
    expect(() => extractJSON('no json here')).toThrow('Could not find JSON');
  });
});


// =============================================================================
// POV Validation
// =============================================================================

describe('POV Validation', () => {

  it('accepts clear SPOV claim with null reason/category', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: true,
      rejection_reason: null,
      rejection_category: null,
    })));

    const result = await validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);

    expect(result.accept).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.rejectionCategory).toBeNull();
  });

  it('calls callModelWithFallback with mid-tier models and correct options', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: true,
      rejection_reason: null,
      rejection_category: null,
    })));

    await validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);

    expect(mockCallModelWithFallback).toHaveBeenCalledOnce();
    const opts = mockCallModelWithFallback.mock.calls[0][0];
    expect(opts.models).toEqual(MID_TIER_MODELS);
    expect(opts.temperature).toBe(0);
    expect(opts.timeout).toBe(60_000);
    expect(opts.retries).toBe(2);
    expect(opts.caller).toBe('dok4Grader.povValidation');
    expect(opts.responseFormat.type).toBe('json_schema');
    expect(opts.responseFormat.jsonSchema.name).toBe('pov_validation');
    expect(opts.system).toBeTruthy();
    expect(opts.messages).toHaveLength(1);
    expect(opts.messages[0].role).toBe('user');
  });

  it('rejects question without assertion as not_a_claim', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: false,
      rejection_reason: 'Your text asks a question rather than committing to a position.',
      rejection_category: 'not_a_claim',
    })));

    const result = await validatePOV(
      'What if schools stopped using standardized tests?',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('not_a_claim');
  });

  it('rejects DOK3 restated as dok3_misclassification', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: false,
      rejection_reason: 'This text describes a pattern you noticed rather than a position you are taking.',
      rejection_category: 'dok3_misclassification',
    })));

    const result = await validatePOV(
      'Educational metrics fail to capture compound skills.',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('dok3_misclassification');
  });

  it('rejects bare assertion as opinion_without_evidence', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: false,
      rejection_reason: 'Your claim lacks any supporting reasoning or evidence.',
      rejection_category: 'opinion_without_evidence',
    })));

    const result = await validatePOV(
      'Testing is bad.',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('opinion_without_evidence');
  });

  it('includes custom feedback in rejection reason', async () => {
    const feedback = 'Your text describes how educational metrics undervalue compound skills. To make it a Spiky POV, commit to a position.';
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: false,
      rejection_reason: feedback,
      rejection_category: 'dok3_misclassification',
    })));

    const result = await validatePOV('test', FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);

    expect(result.rejectionReason).toBe(feedback);
    expect(result.rejectionReason!.length).toBeGreaterThan(10);
  });

  it('validates Zod schema rejects invalid LLM output', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      accept: 'yes', // should be boolean
    })));

    await expect(
      validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE)
    ).rejects.toThrow(); // ZodError
  });

  it('propagates AllModelsFailed when unified client rejects both models', async () => {
    mockCallModelWithFallback.mockRejectedValueOnce(
      new AllModelsFailed(MID_TIER_MODELS, [new Error('Gemini failed'), new Error('Sonnet failed')])
    );

    await expect(
      validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE)
    ).rejects.toThrow(AllModelsFailed);
  });
});


// =============================================================================
// Source Traceability Check
// =============================================================================

describe('Source Traceability Check', () => {

  const sources = [
    {
      sourceName: 'Smith 2024',
      dok2Points: ['Current tests measure discrete knowledge'],
      content: 'Smith argues that standardized tests only capture discrete knowledge...',
    },
    {
      sourceName: 'Jones 2023',
      dok2Points: ['Skill stacks create emergent capabilities'],
      content: 'Jones defines skill stacking as combining disparate skills...',
    },
  ];

  it('returns unflagged for original position', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: false,
        reasoning: 'This source does not state the SPOV.',
        overlap_summary: null,
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: false,
        reasoning: 'This source does not imply the SPOV.',
        overlap_summary: null,
      })));

    const result = await checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(false);
    expect(result.flaggedSource).toBeNull();
    expect(result.overlapSummary).toBeNull();
  });

  it('calls callModelWithFallback per source with mid-tier models', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: false, reasoning: 'Clear.', overlap_summary: null,
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: false, reasoning: 'Clear.', overlap_summary: null,
      })));

    await checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(mockCallModelWithFallback).toHaveBeenCalledTimes(2);
    for (const call of mockCallModelWithFallback.mock.calls) {
      const opts = call[0];
      expect(opts.models).toEqual(MID_TIER_MODELS);
      expect(opts.temperature).toBe(0.1);
      expect(opts.timeout).toBe(60_000);
      expect(opts.retries).toBe(2);
      expect(opts.caller).toBe('dok4Grader.traceability');
      expect(opts.responseFormat.type).toBe('json_schema');
      expect(opts.responseFormat.jsonSchema.name).toBe('traceability_check');
    }
  });

  it('returns flagged with source when position restates single source', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: true,
        reasoning: 'Smith directly states this position.',
        overlap_summary: 'The SPOV directly restates Smith\'s conclusion about testing reform.',
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: false,
        reasoning: 'Jones does not state this position.',
        overlap_summary: null,
      })));

    const result = await checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(true);
    expect(result.flaggedSource).toBe('Smith 2024');
    expect(result.overlapSummary).toBeTruthy();
  });

  it('returns unflagged for empty sources array with no LLM calls', async () => {
    const result = await checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, []);

    expect(result.flagged).toBe(false);
    expect(result.flaggedSource).toBeNull();
    expect(result.overlapSummary).toBeNull();
    expect(mockCallModelWithFallback).not.toHaveBeenCalled();
  });

  it('returns first flagged source when multiple flagged', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: true,
        reasoning: 'Smith states this.',
        overlap_summary: 'Smith overlap.',
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        flagged: true,
        reasoning: 'Jones also states this.',
        overlap_summary: 'Jones overlap.',
      })));

    const result = await checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(true);
    expect(result.flaggedSource).toBeTruthy();
  });

  it('propagates AllModelsFailed for individual source check', async () => {
    mockCallModelWithFallback.mockRejectedValue(
      new AllModelsFailed(MID_TIER_MODELS, [new Error('fail')])
    );

    await expect(
      checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources)
    ).rejects.toThrow(AllModelsFailed);
  });
});


// =============================================================================
// LLM Divergence Check
// =============================================================================

describe('LLM Divergence Check', () => {

  it('returns valid question and vanilla response', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        question: 'What is the best approach to measuring educational outcomes?',
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        response: 'The best approach combines standardized testing with formative assessments.',
      })));

    const result = await checkLLMDivergence(FIXTURE_SPOV_TEXT);

    expect(result.question).toBeTruthy();
    expect(typeof result.question).toBe('string');
    expect(result.vanillaResponse).toBeTruthy();
    expect(typeof result.vanillaResponse).toBe('string');
  });

  it('makes two sequential calls with correct temperatures and caller strings', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        question: 'How should educational outcomes be measured?',
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        response: 'A balanced approach using multiple assessment types.',
      })));

    await checkLLMDivergence(FIXTURE_SPOV_TEXT);

    expect(mockCallModelWithFallback).toHaveBeenCalledTimes(2);

    // First call: question extraction, temperature 0.1
    const opts1 = mockCallModelWithFallback.mock.calls[0][0];
    expect(opts1.models).toEqual(DIVERGENCE_TIER_MODELS);
    expect(opts1.temperature).toBe(0.1);
    expect(opts1.timeout).toBe(30_000);
    expect(opts1.retries).toBe(2);
    expect(opts1.caller).toBe('dok4Grader.divergenceQuestion');
    expect(opts1.responseFormat.jsonSchema.name).toBe('divergence_question');

    // Second call: vanilla response, temperature 0.3
    const opts2 = mockCallModelWithFallback.mock.calls[1][0];
    expect(opts2.models).toEqual(DIVERGENCE_TIER_MODELS);
    expect(opts2.temperature).toBe(0.3);
    expect(opts2.timeout).toBe(30_000);
    expect(opts2.retries).toBe(2);
    expect(opts2.caller).toBe('dok4Grader.divergenceVanilla');
    expect(opts2.responseFormat.jsonSchema.name).toBe('divergence_vanilla');
  });

  it('handles very short SPOV text', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        question: 'Is testing bad?',
      })))
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        response: 'Testing serves important evaluation purposes.',
      })));

    const result = await checkLLMDivergence('Testing is bad.');

    expect(result.question).toBeTruthy();
    expect(result.vanillaResponse).toBeTruthy();
  });

  it('propagates AllModelsFailed on question extraction failure', async () => {
    mockCallModelWithFallback.mockRejectedValueOnce(
      new AllModelsFailed(DIVERGENCE_TIER_MODELS, [new Error('fail')])
    );

    await expect(
      checkLLMDivergence(FIXTURE_SPOV_TEXT)
    ).rejects.toThrow(AllModelsFailed);
  });

  it('propagates AllModelsFailed on vanilla response failure', async () => {
    mockCallModelWithFallback
      .mockResolvedValueOnce(makeCallResult(JSON.stringify({
        question: 'How should outcomes be measured?',
      })))
      .mockRejectedValueOnce(
        new AllModelsFailed(DIVERGENCE_TIER_MODELS, [new Error('fail')])
      );

    await expect(
      checkLLMDivergence(FIXTURE_SPOV_TEXT)
    ).rejects.toThrow(AllModelsFailed);
  });
});


// =============================================================================
// Quality Evaluation
// =============================================================================

describe('Quality Evaluation', () => {

  const qualityResponse = {
    position_summary: 'The student argues that standardized testing should be replaced with longitudinal skill-stack assessments.',
    framework_dependency: 'Compound Skills Measurement Gap',
    key_evidence: ['DOK1 fact about discrete knowledge', 'DOK2 synthesis about compound skills'],
    criteria: {
      S1: { assessment: 'strong', evidence: 'Position directly challenges current testing paradigm.' },
      S4: { assessment: 'strong', evidence: 'Commits to replacement, no hedging.' },
      P1: { assessment: 'strong', evidence: 'Stated as a single quotable line.' },
      S2: { assessment: 'strong', evidence: 'Vanilla LLM suggested balanced approach, student takes stronger stance.' },
      S3: { assessment: 'strong', evidence: 'Clear chain from DOK1 facts through DOK2 synthesis to position.' },
      O2: { assessment: 'strong', evidence: 'Voice distinct from sources, uses original framing.' },
    },
    score: 4,
    rationale: 'The student presents an original, well-grounded position that diverges from consensus.',
    feedback: 'Sharpen the line further by cutting the qualifier in the second clause.',
  };

  it('calls callModelWithFallback with quality-tier models', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(
      makeCallResult(JSON.stringify(qualityResponse), 'anthropic/claude-opus-4.6')
    );

    await evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(mockCallModelWithFallback).toHaveBeenCalledOnce();
    const opts = mockCallModelWithFallback.mock.calls[0][0];
    expect(opts.models).toEqual(QUALITY_TIER_MODELS);
    expect(opts.temperature).toBe(0.1);
    expect(opts.timeout).toBe(60_000);
    expect(opts.retries).toBe(2);
    expect(opts.caller).toBe('dok4Grader.qualityEvaluation.v2');
    expect(opts.responseFormat.type).toBe('json_schema');
    expect(opts.responseFormat.jsonSchema.name).toBe('quality_evaluation');
  });

  it('returns all 6 criteria with strong/partial/weak assessments', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(qualityResponse)));

    const result = await evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    const criteriaKeys: (keyof typeof result.criteria)[] = ['S1', 'S4', 'P1', 'S2', 'S3', 'O2'];
    for (const key of criteriaKeys) {
      const criterion = result.criteria[key];
      expect(['strong', 'partial', 'weak']).toContain(criterion.assessment);
      expect(criterion.evidence).toBeTruthy();
    }
  });

  it('returns score in 1-5 range', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(qualityResponse)));

    const result = await evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('returns positionSummary, frameworkDependency, keyEvidence', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(qualityResponse)));

    const result = await evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(result.positionSummary).toBeTruthy();
    expect(result.frameworkDependency).toBeTruthy();
    expect(result.keyEvidence).toBeInstanceOf(Array);
    expect(result.keyEvidence.length).toBeGreaterThan(0);
  });

  it('returns rationale and feedback strings', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(qualityResponse)));

    const result = await evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(typeof result.rationale).toBe('string');
    expect(result.rationale.length).toBeGreaterThan(10);
    expect(typeof result.feedback).toBe('string');
    expect(result.feedback.length).toBeGreaterThan(10);
  });

  it('validates Zod schema rejects invalid structure', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      score: 'four', // should be number
      criteria: {},
    })));

    await expect(
      evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT)
    ).rejects.toThrow();
  });

  it('propagates AllModelsFailed when both models fail', async () => {
    mockCallModelWithFallback.mockRejectedValueOnce(
      new AllModelsFailed(QUALITY_TIER_MODELS, [new Error('Opus failed'), new Error('Sonnet failed')])
    );

    await expect(
      evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT)
    ).rejects.toThrow(AllModelsFailed);
  });
});


// =============================================================================
// Antimemetic Assessment
// =============================================================================

describe('Antimemetic Assessment', () => {

  const antimemeticResponse = {
    barrier_type: 'immunity',
    barrier_diagnosis: 'The position challenges deeply held beliefs about standardized testing that parents, administrators, and policymakers are personally invested in defending.',
    strategy: 'Lead with the shared goal of better student outcomes before introducing the critique of current testing. Use specific student success stories that illustrate what longitudinal assessment reveals.',
  };

  it('calls callModelWithFallback with quality-tier models', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(
      makeCallResult(JSON.stringify(antimemeticResponse), 'anthropic/claude-opus-4.6')
    );

    await assessAntimemetic(FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance');

    expect(mockCallModelWithFallback).toHaveBeenCalledOnce();
    const opts = mockCallModelWithFallback.mock.calls[0][0];
    expect(opts.models).toEqual(QUALITY_TIER_MODELS);
    expect(opts.temperature).toBe(0.3);
    expect(opts.timeout).toBe(60_000);
    expect(opts.retries).toBe(2);
    expect(opts.caller).toBe('dok4Grader.antimemetic');
    expect(opts.responseFormat.type).toBe('json_schema');
    expect(opts.responseFormat.jsonSchema.name).toBe('antimemetic_assessment');
  });

  it('returns valid barrier_type', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(antimemeticResponse)));

    const result = await assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(['immunity', 'low_transmission', 'high_drag']).toContain(result.barrier_type);
  });

  it('returns non-empty barrier_diagnosis', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(antimemeticResponse)));

    const result = await assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(result.barrier_diagnosis).toBeTruthy();
    expect(result.barrier_diagnosis.length).toBeGreaterThan(10);
  });

  it('returns actionable strategy', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify(antimemeticResponse)));

    const result = await assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(result.strategy).toBeTruthy();
    expect(result.strategy.length).toBeGreaterThan(10);
  });

  it('validates Zod schema rejects invalid output', async () => {
    mockCallModelWithFallback.mockResolvedValueOnce(makeCallResult(JSON.stringify({
      barrier_type: 'invalid_type', // not in enum
      barrier_diagnosis: 'test',
      strategy: 'test',
    })));

    await expect(
      assessAntimemetic(FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'test')
    ).rejects.toThrow();
  });

  it('propagates AllModelsFailed when both models fail', async () => {
    mockCallModelWithFallback.mockRejectedValueOnce(
      new AllModelsFailed(QUALITY_TIER_MODELS, [new Error('Opus failed'), new Error('Sonnet failed')])
    );

    await expect(
      assessAntimemetic(FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'test')
    ).rejects.toThrow(AllModelsFailed);
  });
});
