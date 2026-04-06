/**
 * Tests for FR5: Single-Item Grading Jobs (dok1:grade-single, dok2:grade-single)
 *
 * Tests that grading jobs fetch the item, call the appropriate grader,
 * store results, and recompute the brainlift score.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// Mock dependencies before importing jobs
vi.mock('../../storage/base', () => ({
  db: { update: vi.fn(), select: vi.fn() },
  eq: vi.fn(),
  facts: { id: 'id', score: 'score', note: 'note', isGradeable: 'is_gradeable' },
}));

vi.mock('../../storage', () => ({
  storage: {
    getBrainliftById: vi.fn(),
    getFactByIdForBrainlift: vi.fn(),
    createFactVerification: vi.fn(),
    getDok2SummaryByIdForBrainlift: vi.fn(),
    getDok2PointsForSummary: vi.fn(),
    getRelatedDOK1sForSummary: vi.fn(),
  },
}));

vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn().mockResolvedValue({ content: 'evidence', error: null }),
}));

vi.mock('../../utils/resolve-youtube-transcript', () => ({
  resolveYouTubeTranscript: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: vi.fn().mockResolvedValue({
    modelResults: [{ model: 'test', score: 4, rationale: 'Good', status: 'verified', error: null }],
    consensus: { consensusScore: 4, confidenceLevel: 'high', needsReview: false, verificationNotes: 'Verified OK' },
  }),
}));

vi.mock('../../ai/dok2Grader', () => ({
  gradeDOK2Summary: vi.fn().mockResolvedValue({
    displayTitle: 'Test Summary',
    score: 4,
    diagnosis: 'Good synthesis',
    feedback: 'Well done',
    failReason: null,
    sourceVerified: true,
  }),
}));

vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
}));

import { dok1GradeSingleJob } from '../dok1GradeSingleJob';
import { dok2GradeSingleJob } from '../dok2GradeSingleJob';
import { storage } from '../../storage';
import { verifyFactWithAllModels } from '../../ai/factVerifier';
import { gradeDOK2Summary } from '../../ai/dok2Grader';
import { recomputeBrainliftScore } from '../../services/brainlift';

const mockHelpers = {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  job: { attempts: 1, max_attempts: 3 },
} as unknown as JobHelpers;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dok1GradeSingleJob', () => {
  it('fetches fact, verifies with all models, stores score, and recomputes brainlift score', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'The sky is blue', source: 'https://example.com', brainliftId: 10,
    });

    await dok1GradeSingleJob({ factId: 1, brainliftId: 10 }, mockHelpers);

    expect(storage.getFactByIdForBrainlift).toHaveBeenCalledWith(1, 10);
    expect(verifyFactWithAllModels).toHaveBeenCalledWith(
      'The sky is blue',
      'https://example.com',
      expect.any(String),
      expect.any(Boolean),
    );
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(10);
  });

  it('handles missing fact gracefully without calling grader or recompute', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue(null);

    await dok1GradeSingleJob({ factId: 999, brainliftId: 10 }, mockHelpers);

    expect(verifyFactWithAllModels).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});

describe('dok2GradeSingleJob', () => {
  it('fetches summary, points, related facts, grades, and recomputes brainlift score', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 5, brainliftId: 10, sourceName: 'Source A', sourceUrl: 'https://example.com',
    });
    (storage.getBrainliftById as any).mockResolvedValue({
      id: 10, description: 'Test brainlift purpose',
    });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([
      { text: 'Point 1', sortOrder: 0 }, { text: 'Point 2', sortOrder: 1 },
    ]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([
      { fact: 'Related fact', source: 'Source' },
    ]);

    await dok2GradeSingleJob({ summaryId: 5, brainliftId: 10 }, mockHelpers);

    expect(storage.getDok2SummaryByIdForBrainlift).toHaveBeenCalledWith(5, 10);
    expect(gradeDOK2Summary).toHaveBeenCalledWith(
      ['Point 1', 'Point 2'],
      [{ fact: 'Related fact', source: 'Source' }],
      'Test brainlift purpose',
      'https://example.com',
    );
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(10);
  });

  it('handles missing summary gracefully without calling grader or recompute', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue(null);

    await dok2GradeSingleJob({ summaryId: 999, brainliftId: 10 }, mockHelpers);

    expect(gradeDOK2Summary).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});
