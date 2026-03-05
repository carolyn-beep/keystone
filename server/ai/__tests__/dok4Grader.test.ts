/**
 * Tests for 03-ai-pipeline: DOK4 AI Grading Pipeline
 *
 * Tests all 5 LLM-powered grading functions plus shared utilities.
 * All LLM calls are mocked via global fetch mock.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DOK4EvaluationContext } from '@shared/dok4-types';

// ─── Mock Setup ──────────────────────────────────────────────────────────────

// We need to set OPENROUTER_API_KEY before importing the module
vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to create a successful OpenRouter response
function makeOpenRouterResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content } }],
    }),
  };
}

// Helper to create a failed response
function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: 'test error' }),
  };
}

// ─── Import module under test (after mocks) ─────────────────────────────────

// Dynamic import to ensure env is set before module loads
let mod: typeof import('../dok4Grader');

beforeEach(async () => {
  mockFetch.mockReset();
  // Re-import to get fresh module state
  mod = await import('../dok4Grader');
});

afterEach(() => {
  vi.restoreAllMocks();
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


// =============================================================================
// FR1: DOK4 Model Constants and Shared Utilities
// =============================================================================

describe('FR1: DOK4 Model Constants and Shared Utilities', () => {

  describe('DOK4_MODELS', () => {
    it('has all 4 model identifiers', async () => {
      const { DOK4_MODELS } = await import('@shared/schema');
      expect(DOK4_MODELS.OPUS).toBe('anthropic/claude-opus-4.6');
      expect(DOK4_MODELS.SONNET_FALLBACK).toBe('anthropic/claude-sonnet-4.5');
      expect(DOK4_MODELS.GEMINI_FLASH).toBe('google/gemini-2.0-flash-001');
      expect(DOK4_MODELS.SONNET_MID_FALLBACK).toBe('anthropic/claude-sonnet-4.5');
    });
  });

  describe('extractJSON', () => {
    it('strips markdown fences and extracts JSON', () => {
      const raw = '```json\n{"accept": true, "rejection_reason": null}\n```';
      const result = mod.extractJSON(raw);
      expect(result).toEqual({ accept: true, rejection_reason: null });
    });

    it('extracts JSON without markdown fences', () => {
      const raw = '{"accept": false, "rejection_reason": "Not a claim"}';
      const result = mod.extractJSON(raw);
      expect(result).toEqual({ accept: false, rejection_reason: 'Not a claim' });
    });

    it('extracts JSON with surrounding text', () => {
      const raw = 'Here is the result:\n{"flagged": true}\nEnd of response';
      const result = mod.extractJSON(raw);
      expect(result).toEqual({ flagged: true });
    });

    it('throws when no JSON found', () => {
      expect(() => mod.extractJSON('no json here')).toThrow('Could not find JSON');
    });
  });

  describe('callDOK4Model', () => {
    it('makes HTTP request with correct params including temperature', async () => {
      mockFetch.mockResolvedValueOnce(makeOpenRouterResponse('{"test": true}'));

      await mod.callDOK4Model('test-model', 'system prompt', 'user prompt', 0.3);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

      const body = JSON.parse(options.body);
      expect(body.model).toBe('test-model');
      expect(body.temperature).toBe(0.3);
      expect(body.max_tokens).toBeUndefined();
      expect(body.response_format.type).toBe('json_object');
      expect(body.messages[0].content).toBe('system prompt');
      expect(body.messages[1].content).toBe('user prompt');
    });

    it('uses json_schema response format when schema provided', async () => {
      mockFetch.mockResolvedValueOnce(makeOpenRouterResponse('{"test": true}'));

      const schema = { name: 'test', schema: { type: 'object', properties: { test: { type: 'boolean' } }, required: ['test'], additionalProperties: false } };
      await mod.callDOK4Model('test-model', 'sys', 'usr', 0.1, schema);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.response_format.type).toBe('json_schema');
      expect(body.response_format.json_schema.name).toBe('test');
      expect(body.response_format.json_schema.strict).toBe(true);
    });

    it('retries on transient failure (pRetry with 2 retries)', async () => {
      mockFetch
        .mockResolvedValueOnce(makeErrorResponse(500))
        .mockResolvedValueOnce(makeErrorResponse(500))
        .mockResolvedValueOnce(makeOpenRouterResponse('{"result": "ok"}'));

      const result = await mod.callDOK4Model('test-model', 'sys', 'usr', 0.1);
      expect(result).toBe('{"result": "ok"}');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('retries on JSON parse failure', async () => {
      mockFetch
        .mockResolvedValueOnce(makeOpenRouterResponse('not json'))
        .mockResolvedValueOnce(makeOpenRouterResponse('{"result": "ok"}'));

      const result = await mod.callDOK4Model('test-model', 'sys', 'usr', 0.1);
      expect(result).toBe('{"result": "ok"}');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on 429 rate limit', async () => {
      mockFetch.mockResolvedValue(makeErrorResponse(429));

      await expect(
        mod.callDOK4Model('test-model', 'sys', 'usr', 0.1)
      ).rejects.toThrow('RATE_LIMIT');
    });

    it('returns content string from successful response', async () => {
      mockFetch.mockResolvedValueOnce(makeOpenRouterResponse('{"valid": true}'));

      const result = await mod.callDOK4Model('test-model', 'sys', 'usr', 0.1);
      expect(result).toBe('{"valid": true}');
    });

    it('throws when response has no content', async () => {
      // Use mockResolvedValue (not Once) so all retry attempts get the same response
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: {} }] }),
      });

      await expect(
        mod.callDOK4Model('test-model', 'sys', 'usr', 0.1)
      ).rejects.toThrow('No response content');
    });
  });
});


// =============================================================================
// FR2: POV Validation
// =============================================================================

describe('FR2: POV Validation', () => {

  it('accepts clear SPOV claim with null reason/category', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: true,
      rejection_reason: null,
      rejection_category: null,
    })));

    const result = await mod.validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);

    expect(result.accept).toBe(true);
    expect(result.rejectionReason).toBeNull();
    expect(result.rejectionCategory).toBeNull();
  });

  it('rejects question without assertion as not_a_claim', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: false,
      rejection_reason: 'Your text asks a question rather than committing to a position. What do you believe about standardized testing?',
      rejection_category: 'not_a_claim',
    })));

    const result = await mod.validatePOV(
      'What if schools stopped using standardized tests?',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('not_a_claim');
  });

  it('rejects DOK3 restated as dok3_misclassification', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: false,
      rejection_reason: 'This text describes a pattern you noticed rather than a position you are taking. To make it a Spiky POV, commit to what should change.',
      rejection_category: 'dok3_misclassification',
    })));

    const result = await mod.validatePOV(
      'Educational metrics fail to capture compound skills.',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('dok3_misclassification');
  });

  it('rejects bare assertion as opinion_without_evidence', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: false,
      rejection_reason: 'Your claim lacks any supporting reasoning or evidence. Try grounding it in specific findings from your sources.',
      rejection_category: 'opinion_without_evidence',
    })));

    const result = await mod.validatePOV(
      'Testing is bad.',
      FIXTURE_DOK3_TEXT,
      FIXTURE_BRAINLIFT_PURPOSE,
    );

    expect(result.accept).toBe(false);
    expect(result.rejectionCategory).toBe('opinion_without_evidence');
  });

  it('includes custom feedback in rejection reason', async () => {
    const feedback = 'Your text describes how educational metrics undervalue compound skills. To make it a Spiky POV, commit to a position.';
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: false,
      rejection_reason: feedback,
      rejection_category: 'dok3_misclassification',
    })));

    const result = await mod.validatePOV('test', FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);

    expect(result.rejectionReason).toBe(feedback);
    expect(result.rejectionReason!.length).toBeGreaterThan(10);
  });

  it('falls back to Sonnet when primary model fails', async () => {
    // First call (Gemini) fails, second call (Sonnet) succeeds
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500)) // 3 attempts for primary (1 + 2 retries)
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        accept: true,
        rejection_reason: null,
        rejection_category: null,
      })));

    const result = await mod.validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE);
    expect(result.accept).toBe(true);
    // Should have called fetch 4 times (3 primary retries + 1 fallback)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('validates Zod schema rejects invalid LLM output', async () => {
    // Missing required fields
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      accept: 'yes', // should be boolean
    })));

    await expect(
      mod.validatePOV(FIXTURE_SPOV_TEXT, FIXTURE_DOK3_TEXT, FIXTURE_BRAINLIFT_PURPOSE)
    ).rejects.toThrow(); // ZodError
  });
});


// =============================================================================
// FR3: Source Traceability Check
// =============================================================================

describe('FR3: Source Traceability Check', () => {

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
    // Both sources return not flagged
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: false,
        reasoning: 'This source does not state the SPOV.',
        overlap_summary: null,
      })))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: false,
        reasoning: 'This source does not imply the SPOV.',
        overlap_summary: null,
      })));

    const result = await mod.checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(false);
    expect(result.flaggedSource).toBeNull();
    expect(result.overlapSummary).toBeNull();
  });

  it('returns flagged with source when position restates single source', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: true,
        reasoning: 'Smith directly states this position.',
        overlap_summary: 'The SPOV directly restates Smith\'s conclusion about testing reform.',
      })))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: false,
        reasoning: 'Jones does not state this position.',
        overlap_summary: null,
      })));

    const result = await mod.checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(true);
    expect(result.flaggedSource).toBe('Smith 2024');
    expect(result.overlapSummary).toBeTruthy();
  });

  it('returns unflagged for empty sources array with no LLM calls', async () => {
    const result = await mod.checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, []);

    expect(result.flagged).toBe(false);
    expect(result.flaggedSource).toBeNull();
    expect(result.overlapSummary).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns first flagged source when multiple flagged', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: true,
        reasoning: 'Smith states this.',
        overlap_summary: 'Smith overlap.',
      })))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: true,
        reasoning: 'Jones also states this.',
        overlap_summary: 'Jones overlap.',
      })));

    const result = await mod.checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);

    expect(result.flagged).toBe(true);
    // Should return the first flagged source found
    expect(result.flaggedSource).toBeTruthy();
  });

  it('falls back to Sonnet per-source when primary fails', async () => {
    // First source: Gemini fails (3 attempts), Sonnet succeeds
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: false,
        reasoning: 'Not flagged.',
        overlap_summary: null,
      })))
      // Second source: Gemini succeeds
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        flagged: false,
        reasoning: 'Not flagged.',
        overlap_summary: null,
      })));

    const result = await mod.checkDOK4SourceTraceability(FIXTURE_SPOV_TEXT, sources);
    expect(result.flagged).toBe(false);
  });
});


// =============================================================================
// FR4: LLM Divergence Check
// =============================================================================

describe('FR4: LLM Divergence Check', () => {

  it('returns valid question and vanilla response', async () => {
    // Call 1: question extraction
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      question: 'What is the best approach to measuring educational outcomes?',
    })));
    // Call 2: vanilla response
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      response: 'The best approach combines standardized testing with formative assessments to capture both knowledge retention and growth.',
    })));

    const result = await mod.checkLLMDivergence(FIXTURE_SPOV_TEXT);

    expect(result.question).toBeTruthy();
    expect(typeof result.question).toBe('string');
    expect(result.vanillaResponse).toBeTruthy();
    expect(typeof result.vanillaResponse).toBe('string');
  });

  it('makes two sequential calls with correct temperatures', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        question: 'How should educational outcomes be measured?',
      })))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        response: 'A balanced approach using multiple assessment types.',
      })));

    await mod.checkLLMDivergence(FIXTURE_SPOV_TEXT);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify first call has temperature 0.1
    const call1Body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(call1Body.temperature).toBe(0.1);

    // Verify second call has temperature 0.3
    const call2Body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(call2Body.temperature).toBe(0.3);
  });

  it('handles very short SPOV text', async () => {
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        question: 'Is testing bad?',
      })))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        response: 'Testing serves important evaluation purposes.',
      })));

    const result = await mod.checkLLMDivergence('Testing is bad.');

    expect(result.question).toBeTruthy();
    expect(result.vanillaResponse).toBeTruthy();
  });

  it('falls back to Sonnet on first call failure', async () => {
    // Primary fails for question extraction (3 attempts)
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      // Fallback succeeds for question
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        question: 'How should outcomes be measured?',
      })))
      // Primary succeeds for vanilla response
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        response: 'Through balanced assessment.',
      })));

    const result = await mod.checkLLMDivergence(FIXTURE_SPOV_TEXT);
    expect(result.question).toBeTruthy();
    expect(result.vanillaResponse).toBeTruthy();
  });

  it('falls back to Sonnet on second call failure', async () => {
    // Primary succeeds for question extraction
    mockFetch
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        question: 'How should outcomes be measured?',
      })))
      // Primary fails for vanilla response (3 attempts)
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      // Fallback succeeds for vanilla response
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
        response: 'Through balanced assessment.',
      })));

    const result = await mod.checkLLMDivergence(FIXTURE_SPOV_TEXT);
    expect(result.question).toBeTruthy();
    expect(result.vanillaResponse).toBeTruthy();
  });
});


// =============================================================================
// FR5: Quality Evaluation
// =============================================================================

describe('FR5: Quality Evaluation', () => {

  const qualityResponse = {
    position_summary: 'The student argues that standardized testing should be replaced with longitudinal skill-stack assessments.',
    framework_dependency: 'Compound Skills Measurement Gap',
    key_evidence: ['DOK1 fact about discrete knowledge', 'DOK2 synthesis about compound skills'],
    vulnerability_points: ['Limited evidence for specific timeline claims'],
    criteria: {
      S1: { assessment: 'strong', evidence: 'Position directly challenges current testing paradigm.' },
      S2: { assessment: 'strong', evidence: 'Vanilla LLM suggested balanced approach, student takes stronger stance.' },
      S3: { assessment: 'strong', evidence: 'Clear chain from DOK1 facts through DOK2 synthesis to position.' },
      S4: { assessment: 'strong', evidence: 'Commits to replacement, no hedging.' },
      S5: { assessment: 'partial', evidence: 'Draws from educational measurement and skill development domains.' },
      O1: { assessment: 'strong', evidence: 'Explains mechanism of compound skill emergence over time.' },
      O2: { assessment: 'strong', evidence: 'Voice distinct from sources, uses original framing.' },
    },
    score: 4,
    rationale: 'The student presents an original, well-grounded position that diverges from consensus. Foundation Index of 3.65 supports confidence in the evidence chain. Source traceability is clear with no flags.',
    feedback: 'Strengthen the ownership dimension by explaining the causal mechanism behind compound skill emergence more precisely.',
  };

  it('returns all 7 criteria with strong/partial/weak assessments', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(qualityResponse)));

    const result = await mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    const criteriaKeys = ['S1', 'S2', 'S3', 'S4', 'S5', 'O1', 'O2'];
    for (const key of criteriaKeys) {
      const criterion = result.criteria[key as keyof typeof result.criteria];
      expect(['strong', 'partial', 'weak']).toContain(criterion.assessment);
      expect(criterion.evidence).toBeTruthy();
    }
  });

  it('returns score in 1-5 range', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(qualityResponse)));

    const result = await mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('returns positionSummary, frameworkDependency, keyEvidence, vulnerabilityPoints', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(qualityResponse)));

    const result = await mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(result.positionSummary).toBeTruthy();
    expect(result.frameworkDependency).toBeTruthy();
    expect(result.keyEvidence).toBeInstanceOf(Array);
    expect(result.keyEvidence.length).toBeGreaterThan(0);
    expect(result.vulnerabilityPoints).toBeInstanceOf(Array);
  });

  it('returns rationale and feedback strings', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(qualityResponse)));

    const result = await mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);

    expect(typeof result.rationale).toBe('string');
    expect(result.rationale.length).toBeGreaterThan(10);
    expect(typeof result.feedback).toBe('string');
    expect(result.feedback.length).toBeGreaterThan(10);
  });

  it('validates Zod schema rejects invalid structure', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      score: 'four', // should be number
      criteria: {},
    })));

    await expect(
      mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT)
    ).rejects.toThrow();
  });

  it('falls back to Sonnet when Opus fails', async () => {
    // Opus fails (3 attempts = 1 initial + 2 retries), then Sonnet succeeds
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(qualityResponse)));

    const result = await mod.evaluateDOK4Quality(FIXTURE_EVALUATION_CONTEXT);
    expect(result.score).toBe(4);
  });
});


// =============================================================================
// FR6: Antimemetic Assessment
// =============================================================================

describe('FR6: Antimemetic Assessment', () => {

  const antimemeticResponse = {
    barrier_type: 'immunity',
    barrier_diagnosis: 'The position challenges deeply held beliefs about standardized testing that parents, administrators, and policymakers are personally invested in defending.',
    strategy: 'Lead with the shared goal of better student outcomes before introducing the critique of current testing. Use specific student success stories that illustrate what longitudinal assessment reveals.',
  };

  it('returns valid barrier_type', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(antimemeticResponse)));

    const result = await mod.assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(['immunity', 'low_transmission', 'high_drag']).toContain(result.barrier_type);
  });

  it('returns non-empty barrier_diagnosis', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(antimemeticResponse)));

    const result = await mod.assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(result.barrier_diagnosis).toBeTruthy();
    expect(result.barrier_diagnosis.length).toBeGreaterThan(10);
  });

  it('returns actionable strategy', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(antimemeticResponse)));

    const result = await mod.assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'Strong educational stance',
    );

    expect(result.strategy).toBeTruthy();
    expect(result.strategy.length).toBeGreaterThan(10);
  });

  it('validates Zod schema rejects invalid output', async () => {
    mockFetch.mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify({
      barrier_type: 'invalid_type', // not in enum
      barrier_diagnosis: 'test',
      strategy: 'test',
    })));

    await expect(
      mod.assessAntimemetic(FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'test')
    ).rejects.toThrow();
  });

  it('falls back to Sonnet when Opus fails', async () => {
    // Opus fails (3 attempts = 1 initial + 2 retries), then Sonnet succeeds
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOpenRouterResponse(JSON.stringify(antimemeticResponse)));

    const result = await mod.assessAntimemetic(
      FIXTURE_SPOV_TEXT, FIXTURE_BRAINLIFT_PURPOSE, 4, 'test',
    );

    expect(result.barrier_type).toBe('immunity');
  });
});
