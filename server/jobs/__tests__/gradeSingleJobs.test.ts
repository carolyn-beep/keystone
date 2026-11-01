/**
 * Tests for FR5: Single-Item Grading Jobs (dok1:grade-single, dok2:grade-single)
 *
 * Tests that grading jobs fetch the item, call the appropriate grader,
 * store results, and recompute the brainlift score.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// Captures the most recent db.update(...).set(payload) so wiring tests can assert
// the persisted column values (note/note_raw, diagnosis/diagnosis_raw, score).
const setSpy = vi.fn();

// Mock dependencies before importing jobs
vi.mock('../../storage/base', () => ({
  db: {
    update: vi.fn(() => ({
      set: (payload: any) => {
        setSpy(payload);
        return { where: vi.fn().mockResolvedValue(undefined) };
      },
    })),
    select: vi.fn(),
  },
  eq: vi.fn(),
  facts: { id: 'id', score: 'score', note: 'note', isGradeable: 'is_gradeable', gradingStatus: 'grading_status' },
  dok2Summaries: { id: 'id', gradingStatus: 'grading_status' },
}));

// Mock the rewrite integration so wiring tests never make real LLM calls.
// Default: identity rewrite (userFacing = REWRITTEN:<text>, raw = original).
vi.mock('../../ai/readability/integrate', () => ({
  rewriteForPersist: vi.fn(async (text: string) => ({
    userFacing: `REWRITTEN:${text}`,
    raw: text,
  })),
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
  fetchEvidenceForFact: vi.fn().mockResolvedValue({
    url: 'https://example.com',
    content: 'evidence',
    error: null,
    fetchedAt: new Date('2026-05-04T00:00:00.000Z'),
    mode: 'direct_source',
    originalSourceUrl: 'https://example.com',
  }),
}));

vi.mock('../../utils/resolve-youtube-transcript', () => ({
  resolveYouTubeTranscript: vi.fn().mockResolvedValue(null),
}));

// Mock withJob so the pangram:analyze enqueue hook in dok2/dok3/dok4 grade
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
import { rewriteForPersist } from '../../ai/readability/integrate';

const mockRewrite = vi.mocked(rewriteForPersist);

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
      expect.objectContaining({
        content: 'evidence',
        mode: 'direct_source',
        originalSourceUrl: 'https://example.com',
      }),
      false,
    );
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ dokLevel: 1, itemId: 1 }),
    );
  });

  it('handles missing fact gracefully without calling grader or recompute', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue(null);

    await dok1GradeSingleJob({ factId: 999, brainliftId: 10 }, mockHelpers);

    expect(verifyFactWithAllModels).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });

  it('rewrites the rationale and persists note (rewritten) + note_raw (original finalNote); score untouched', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'The sky is blue', source: 'https://example.com', brainliftId: 10,
    });

    await dok1GradeSingleJob({ factId: 1, brainliftId: 10 }, mockHelpers);

    // Rewrite runs on the rationale prose only (not the appended source link).
    expect(mockRewrite).toHaveBeenCalledWith('Verified OK', expect.objectContaining({
      level: 'DOK1', itemId: 1, brainliftId: 10,
    }));

    const payload = setSpy.mock.calls.at(-1)![0];
    // note_raw = original finalNote (rationale + source link), note = rewritten + source link.
    expect(payload.noteRaw).toBe('Verified OK\n\nSource: [https://example.com](https://example.com)');
    expect(payload.note).toBe('REWRITTEN:Verified OK\n\nSource: [https://example.com](https://example.com)');
    // Score is set from the grader consensus and never touched by the rewrite.
    expect(payload.score).toBe(4);
  });

  it('does not lose the grade when the rewrite engine fails (falls back to original)', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'The sky is blue', source: 'https://example.com', brainliftId: 10,
    });
    // Helper contract: never throws; returns original in both fields on failure.
    mockRewrite.mockResolvedValueOnce({ userFacing: 'Verified OK', raw: 'Verified OK' });

    await dok1GradeSingleJob({ factId: 1, brainliftId: 10 }, mockHelpers);

    const payload = setSpy.mock.calls.at(-1)![0];
    expect(payload.note).toBe('Verified OK\n\nSource: [https://example.com](https://example.com)');
    expect(payload.score).toBe(4);
    expect(payload.gradingStatus).toBe('graded');
  });

  it('re-throws non-final failures so graphile-worker retries', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'The sky is blue', source: 'https://example.com', brainliftId: 10,
    });
    (verifyFactWithAllModels as any).mockRejectedValueOnce(new Error('transient'));

    const nonFinalHelpers = {
      ...mockHelpers,
      job: { attempts: 1, max_attempts: 3 },
    } as unknown as JobHelpers;

    await expect(
      dok1GradeSingleJob({ factId: 1, brainliftId: 10 }, nonFinalHelpers),
    ).rejects.toThrow('transient');
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });

  it('keeps terminal behavior on final failure attempt', async () => {
    (storage.getFactByIdForBrainlift as any).mockResolvedValue({
      id: 1, fact: 'The sky is blue', source: 'https://example.com', brainliftId: 10,
    });
    (verifyFactWithAllModels as any).mockRejectedValueOnce(new Error('permanent'));

    const finalHelpers = {
      ...mockHelpers,
      job: { attempts: 3, max_attempts: 3 },
    } as unknown as JobHelpers;

    await expect(
      dok1GradeSingleJob({ factId: 1, brainliftId: 10 }, finalHelpers),
    ).resolves.toBeUndefined();
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ dokLevel: 1, itemId: 1 }),
    );
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
    expect(recomputeBrainliftScore).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ dokLevel: 2, itemId: 5 }),
    );
  });

  it('handles missing summary gracefully without calling grader or recompute', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue(null);

    await dok2GradeSingleJob({ summaryId: 999, brainliftId: 10 }, mockHelpers);

    expect(gradeDOK2Summary).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });

  it('rewrites the diagnosis and persists diagnosis (rewritten) + diagnosis_raw (original); score/feedback untouched', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 5, brainliftId: 10, sourceName: 'Source A', sourceUrl: 'https://example.com',
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 10, description: 'Purpose' });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([{ text: 'P1', sortOrder: 0 }]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);

    await dok2GradeSingleJob({ summaryId: 5, brainliftId: 10 }, mockHelpers);

    expect(mockRewrite).toHaveBeenCalledWith('Good synthesis', expect.objectContaining({
      level: 'DOK2', itemId: 5, brainliftId: 10,
    }));

    const payload = setSpy.mock.calls.at(-1)![0];
    expect(payload.diagnosis).toBe('REWRITTEN:Good synthesis');
    expect(payload.diagnosisRaw).toBe('Good synthesis');
    // Score and feedback are persisted as graded; the rewrite touches neither.
    expect(payload.grade).toBe(4);
    expect(payload.feedback).toBe('Well done');
  });

  it('re-throws non-final failures so graphile-worker retries', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 5, brainliftId: 10, sourceName: 'Source A', sourceUrl: 'https://example.com',
    });
    (storage.getBrainliftById as any).mockResolvedValue({
      id: 10, description: 'Test brainlift purpose',
    });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([
      { text: 'Point 1', sortOrder: 0 },
    ]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);
    (gradeDOK2Summary as any).mockRejectedValueOnce(new Error('transient'));

    const nonFinalHelpers = {
      ...mockHelpers,
      job: { attempts: 2, max_attempts: 3 },
    } as unknown as JobHelpers;

    await expect(
      dok2GradeSingleJob({ summaryId: 5, brainliftId: 10 }, nonFinalHelpers),
    ).rejects.toThrow('transient');
    expect(recomputeBrainliftScore).not.toHaveBeenCalled();
  });
});
