/**
 * Tests for FR8: Regrade Jobs
 *
 * Tests that regrade jobs call the appropriate grading function
 * with previousEvaluation context and handle missing items gracefully.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// Mock dependencies before importing jobs
vi.mock('../../storage', () => ({
  storage: {
    getBrainliftById: vi.fn(),
    getFactByIdForBrainlift: vi.fn(),
    getDok2SummaryByIdForBrainlift: vi.fn(),
    getDOK3Insights: vi.fn(),
    getDOK4Spovs: vi.fn(),
    getDok2PointsForSummary: vi.fn(),
    getRelatedDOK1sForSummary: vi.fn(),
    updateDOK3InsightStatus: vi.fn(),
    updateFactGrading: vi.fn(),
    updateDOK2Grading: vi.fn(),
    checkFoundationGraded: vi.fn(),
    getDOK3EvaluationContext: vi.fn(),
    getSpovEvaluationContext: vi.fn(),
    updateDOK4SpovStatus: vi.fn(),
    saveDOK4GradeResult: vi.fn(),
  },
}));

vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn().mockResolvedValue({
    url: null,
    content: 'evidence',
    error: null,
    fetchedAt: new Date('2026-05-04T00:00:00.000Z'),
    mode: 'direct_source',
    originalSourceUrl: null,
  }),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: vi.fn().mockResolvedValue({
    modelResults: [{ model: 'test', score: 4, rationale: 'Good', status: 'verified', error: null }],
    consensus: { consensusScore: 4, confidenceLevel: 'high', needsReview: false, verificationNotes: 'OK' },
  }),
}));

vi.mock('../../ai/dok2Grader', () => ({
  gradeDOK2Summary: vi.fn().mockResolvedValue({
    displayTitle: 'Test',
    score: 4,
    diagnosis: 'Good synthesis',
    feedback: 'Well done',
    failReason: null,
    sourceVerified: true,
  }),
}));

vi.mock('../../ai/dok3Grader', () => ({
  gradeDOK3Insight: vi.fn().mockResolvedValue({
    score: 4,
    rationale: 'Good insight',
    feedback: 'Well done',
  }),
}));

vi.mock('../../ai/dok4GraderService', () => ({
  gradeDOK4Spov: vi.fn().mockResolvedValue({
    status: 'graded',
    score: 4,
  }),
}));

vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
}));

// Mock withJob so the pangram:analyze enqueue hook in dok2/dok3/dok4 regrade
// jobs does not insert real rows into graphile_worker on the dev DB.
vi.mock('../../utils/withJob', () => {
  const queue = vi.fn().mockResolvedValue('job-id');
  const withOptions = vi.fn(() => ({ queue }));
  const forPayload = vi.fn(() => ({ withOptions, queue }));
  return { withJob: vi.fn(() => ({ forPayload })) };
});

vi.mock('../../ai/pangram/enqueue', () => ({
  enqueuePangramAnalysis: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../events/dok3GradingEmitter', () => ({
  dok3GradingEmitter: {
    isGradingActive: vi.fn().mockReturnValue(false),
    startGrading: vi.fn(),
    emitEvent: vi.fn(),
  },
}));

vi.mock('../../events/dok4GradingEmitter', () => ({
  dok4GradingEmitter: {
    isGradingActive: vi.fn().mockReturnValue(false),
    startGrading: vi.fn(),
    emitEvent: vi.fn(),
  },
}));

import { dok1RegradeJob } from '../dok1RegradeJob';
import { dok2RegradeJob } from '../dok2RegradeJob';
import { dok3RegradeJob } from '../dok3RegradeJob';
import { dok4RegradeJob } from '../dok4RegradeJob';
import { storage } from '../../storage';
import { verifyFactWithAllModels } from '../../ai/factVerifier';
import { gradeDOK2Summary } from '../../ai/dok2Grader';
import { recomputeBrainliftScore } from '../../services/brainlift';
import type { PreviousEvaluation } from '@shared/types/regrading';

const mockHelpers = {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  job: { attempts: 1, max_attempts: 3 },
} as unknown as JobHelpers;

const testPrevEval: PreviousEvaluation = {
  previousScore: 3,
  previousFeedback: 'Needs improvement',
  oldText: 'Old text',
  newText: 'New text',
  editNumber: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dok1RegradeJob', () => {
  it('calls verifyFactWithAllModels with previousEvaluation', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'New text', source: 'Source', brainliftId: 10,
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 10 });

    await dok1RegradeJob(
      { factId: 1, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(verifyFactWithAllModels).toHaveBeenCalledWith(
      'New text',
      'Source',
      expect.objectContaining({
        content: 'evidence',
        mode: 'direct_source',
      }),
      false,
      testPrevEval,
    );
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ dokLevel: 1, itemId: 1 }),
    );
  });

  it('exits gracefully when fact is missing (deleted between queue and execution)', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue(null);

    // Should not throw
    await dok1RegradeJob(
      { factId: 999, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(verifyFactWithAllModels).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});

describe('dok2RegradeJob', () => {
  it('calls gradeDOK2Summary with previousEvaluation', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 1, brainliftId: 10, sourceName: 'Source', sourceUrl: 'https://example.com',
    });
    (storage.getBrainliftById as any).mockResolvedValue({
      id: 10, description: 'Test purpose',
    });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([
      { text: 'Point 1' }, { text: 'Point 2' },
    ]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([
      { fact: 'Related fact', source: 'Source' },
    ]);

    await dok2RegradeJob(
      { summaryId: 1, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(gradeDOK2Summary).toHaveBeenCalledWith(
      ['Point 1', 'Point 2'],
      [{ fact: 'Related fact', source: 'Source' }],
      'Test purpose',
      'https://example.com',
      undefined,
      undefined,
      testPrevEval,
    );
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ dokLevel: 2, itemId: 1 }),
    );
  });

  it('exits gracefully when summary is missing', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue(null);

    await dok2RegradeJob(
      { summaryId: 999, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(gradeDOK2Summary).not.toHaveBeenCalled();
  });
});

describe('dok3RegradeJob', () => {
  it('exits gracefully when insight is missing', async () => {
    (storage.getDOK3Insights as any).mockResolvedValue([]);

    await dok3RegradeJob(
      { insightId: 999, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});

describe('dok4RegradeJob', () => {
  it('exits gracefully when SPOV is missing', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([]);

    await dok4RegradeJob(
      { spovId: 999, brainliftId: 10, previousEvaluation: testPrevEval },
      mockHelpers,
    );

    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});
