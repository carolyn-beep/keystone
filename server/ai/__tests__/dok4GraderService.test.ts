/**
 * Tests for FR2: DOK4 Grading Service Extraction (02-conditional-pipeline)
 *
 * Tests gradeDOK4Spov() extracted from dok4GradeJob.ts.
 * Storage and LLM-backed grading functions are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getSpovEvaluationContext: vi.fn(),
    updateDOK4SpovStatus: vi.fn().mockResolvedValue(undefined),
    saveDOK4GradeResult: vi.fn().mockResolvedValue(undefined),
    saveDOK4Rejection: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock DOK4 grader functions
vi.mock('../dok4Grader', () => ({
  validatePOV: vi.fn(),
  checkDOK4SourceTraceability: vi.fn(),
  checkLLMDivergence: vi.fn(),
  evaluateDOK4Quality: vi.fn(),
  assessAntimemetic: vi.fn(),
}));

// Mock the rewrite integration so the service never makes real LLM calls.
vi.mock('../readability/integrate', () => ({
  rewriteForPersist: vi.fn(async (text: string) => ({
    userFacing: `REWRITTEN:${text}`,
    raw: text,
  })),
}));

import { storage } from '../../storage';
import {
  validatePOV,
  checkDOK4SourceTraceability,
  checkLLMDivergence,
  evaluateDOK4Quality,
  assessAntimemetic,
} from '../dok4Grader';
import { gradeDOK4Spov } from '../dok4GraderService';
import { rewriteForPersist } from '../readability/integrate';

const mockRewrite = vi.mocked(rewriteForPersist);

// Test fixtures
const MOCK_CONTEXT = {
  spovText: 'The intersection of climate policy and economic incentives creates asymmetric outcomes',
  primaryDok3: { id: 1, text: 'Climate policy depends on economic incentives' },
  brainliftPurpose: 'Understanding climate economics',
  foundationIndex: 0.85,
  foundationCeiling: 4,
  dok1FoundationScore: 4.2,
  dok2FoundationScore: 3.8,
  dok3FoundationScore: 4.0,
  linkedDok2s: [
    { sourceName: 'Source A', points: ['Point about economics'], dok2Id: 10 },
    { sourceName: 'Source B', points: ['Point about policy'], dok2Id: 11 },
  ],
  sourceEvidence: [
    { sourceName: 'Source A', content: 'Economics evidence text' },
    { sourceName: 'Source B', content: 'Policy evidence text' },
  ],
};

describe('FR2: DOK4 Grading Service - gradeDOK4Spov()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: loads context, runs full pipeline, saves result, returns graded', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(MOCK_CONTEXT as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockResolvedValue({
      flagged: false,
      flaggedSource: null,
      overlapSummary: 'Good traceability',
    });
    vi.mocked(checkLLMDivergence).mockResolvedValue({
      question: 'What about climate?',
      vanillaResponse: 'Climate is complex',
    });
    vi.mocked(evaluateDOK4Quality).mockResolvedValue({
      score: 4,
      positionSummary: 'Strong position',
      frameworkDependency: 'Low',
      keyEvidence: ['Evidence A'],
      
      criteria: {},
      rationale: 'Well argued',
      feedback: 'Good work',
    });
    vi.mocked(assessAntimemetic).mockResolvedValue({
      barriers: ['Complexity'],
      strategies: ['Simplification'],
    });

    const result = await gradeDOK4Spov(1, 100);

    expect(result.status).toBe('graded');
    expect(result.score).toBe(4); // min(4, ceiling=4)
    expect(storage.getSpovEvaluationContext).toHaveBeenCalledWith(1);
    expect(storage.updateDOK4SpovStatus).toHaveBeenCalledWith(1, 100, 'grading');
    expect(storage.saveDOK4GradeResult).toHaveBeenCalledWith(1, expect.objectContaining({
      score: 4,
      qualityScoreRaw: 4,
      foundationCeiling: 4,
    }));
    expect(assessAntimemetic).toHaveBeenCalled(); // score >= 3
  });

  it('rewrites the rationale and persists rationale (rewritten) + rationaleRaw (original); score untouched', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(MOCK_CONTEXT as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockResolvedValue({
      flagged: false, flaggedSource: null, overlapSummary: '',
    });
    vi.mocked(checkLLMDivergence).mockResolvedValue({ question: 'Q', vanillaResponse: 'R' });
    vi.mocked(evaluateDOK4Quality).mockResolvedValue({
      score: 4, positionSummary: '', frameworkDependency: '', keyEvidence: [],
      criteria: {}, rationale: 'Well argued', feedback: 'Good work',
    });
    vi.mocked(assessAntimemetic).mockResolvedValue({ barriers: [], strategies: [] });

    await gradeDOK4Spov(1, 100);

    expect(mockRewrite).toHaveBeenCalledWith('Well argued', expect.objectContaining({
      level: 'DOK4', itemId: 1, brainliftId: 100,
    }));
    expect(storage.saveDOK4GradeResult).toHaveBeenCalledWith(1, expect.objectContaining({
      rationale: 'REWRITTEN:Well argued',
      rationaleRaw: 'Well argued',
      feedback: 'Good work',
      score: 4,
    }));
  });

  it('applies ceiling: raw score capped by foundationCeiling', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue({
      ...MOCK_CONTEXT,
      foundationCeiling: 3, // Lower ceiling
    } as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockResolvedValue({
      flagged: false, flaggedSource: null, overlapSummary: '',
    });
    vi.mocked(checkLLMDivergence).mockResolvedValue({
      question: 'Q', vanillaResponse: 'R',
    });
    vi.mocked(evaluateDOK4Quality).mockResolvedValue({
      score: 5, // Raw score higher than ceiling
      positionSummary: '', frameworkDependency: '', keyEvidence: [],
       criteria: {}, rationale: '', feedback: '',
    });
    vi.mocked(assessAntimemetic).mockResolvedValue({
      barriers: [], strategies: [],
    });

    const result = await gradeDOK4Spov(1, 100);

    expect(result.status).toBe('graded');
    expect(result.score).toBe(3); // min(5, 3)
  });

  it('rejection: POV validation fails returns rejected with category', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(MOCK_CONTEXT as any);
    vi.mocked(validatePOV).mockResolvedValue({
      accept: false,
      rejectionCategory: 'not_a_pov',
      rejectionReason: 'This is a factual statement, not a POV',
    });

    const result = await gradeDOK4Spov(1, 100);

    expect(result.status).toBe('rejected');
    expect(result.rejectionCategory).toBe('not_a_pov');
    expect(storage.saveDOK4Rejection).toHaveBeenCalledWith(1, expect.objectContaining({
      rejectionCategory: 'not_a_pov',
    }));
    // Should NOT proceed to traceability etc.
    expect(checkDOK4SourceTraceability).not.toHaveBeenCalled();
  });

  it('error: no evaluation context returns error status', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(null);

    const result = await gradeDOK4Spov(1, 100);

    expect(result.status).toBe('error');
    expect(result.error).toContain('No evaluation context');
    expect(storage.updateDOK4SpovStatus).toHaveBeenCalledWith(1, 100, 'error');
  });

  it('error: LLM failure during pipeline returns error status', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(MOCK_CONTEXT as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockRejectedValue(new Error('LLM API timeout'));

    const result = await gradeDOK4Spov(1, 100);

    expect(result.status).toBe('error');
    expect(result.error).toContain('LLM API timeout');
    expect(storage.updateDOK4SpovStatus).toHaveBeenCalledWith(1, 100, 'error');
  });

  it('onProgress callback receives step messages', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue(MOCK_CONTEXT as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockResolvedValue({
      flagged: false, flaggedSource: null, overlapSummary: '',
    });
    vi.mocked(checkLLMDivergence).mockResolvedValue({
      question: 'Q', vanillaResponse: 'R',
    });
    vi.mocked(evaluateDOK4Quality).mockResolvedValue({
      score: 4, positionSummary: '', frameworkDependency: '', keyEvidence: [],
       criteria: {}, rationale: '', feedback: '',
    });
    vi.mocked(assessAntimemetic).mockResolvedValue({
      barriers: [], strategies: [],
    });

    const onProgress = vi.fn();
    await gradeDOK4Spov(1, 100, onProgress);

    // Should receive multiple progress messages (at least 3 steps)
    expect(onProgress.mock.calls.length).toBeGreaterThanOrEqual(3);
    // Each call receives a string message
    for (const call of onProgress.mock.calls) {
      expect(typeof call[0]).toBe('string');
    }
  });

  it('antimemetic assessment gated on score >= 3', async () => {
    vi.mocked(storage.getSpovEvaluationContext).mockResolvedValue({
      ...MOCK_CONTEXT,
      foundationCeiling: 5,
    } as any);
    vi.mocked(validatePOV).mockResolvedValue({ accept: true });
    vi.mocked(checkDOK4SourceTraceability).mockResolvedValue({
      flagged: false, flaggedSource: null, overlapSummary: '',
    });
    vi.mocked(checkLLMDivergence).mockResolvedValue({
      question: 'Q', vanillaResponse: 'R',
    });
    vi.mocked(evaluateDOK4Quality).mockResolvedValue({
      score: 2, // Low score
      positionSummary: '', frameworkDependency: '', keyEvidence: [],
       criteria: {}, rationale: '', feedback: '',
    });

    await gradeDOK4Spov(1, 100);

    // score 2 < 3, so antimemetic should NOT be called
    expect(assessAntimemetic).not.toHaveBeenCalled();
    expect(storage.saveDOK4GradeResult).toHaveBeenCalledWith(1, expect.objectContaining({
      antimemeticAssessment: null,
    }));
  });
});
