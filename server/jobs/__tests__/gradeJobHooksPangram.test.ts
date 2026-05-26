/**
 * Tests for FR5: Grade/regrade jobs enqueue pangram:analyze after grade success.
 *
 * Covers all 6 jobs:
 *   dok2GradeSingleJob, dok2RegradeJob,
 *   dok3GradeJob,       dok3RegradeJob,
 *   dok4GradeJob,       dok4RegradeJob.
 *
 * Mocking strategy mirrors the existing gradeSingleJobs.test.ts /
 * regradeJobs.test.ts setup so this file is self-contained.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../storage/base', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    select: vi.fn(),
  },
  eq: vi.fn(),
  dok2Summaries: { id: 'id', gradingStatus: 'grading_status' },
  facts: { id: 'id' },
}));

vi.mock('../../storage', () => ({
  storage: {
    getBrainliftById: vi.fn(),
    getDok2SummaryByIdForBrainlift: vi.fn(),
    getDok2PointsForSummary: vi.fn(),
    getRelatedDOK1sForSummary: vi.fn(),
    getDOK3Insights: vi.fn(),
    getDOK4Spovs: vi.fn(),
    updateDOK3InsightStatus: vi.fn(),
    updateDOK4SpovStatus: vi.fn(),
    updateDOK2Grading: vi.fn(),
    checkFoundationGraded: vi.fn().mockResolvedValue({ ready: true }),
  },
}));

vi.mock('../../ai/dok2Grader', () => ({
  gradeDOK2Summary: vi.fn().mockResolvedValue({
    displayTitle: 'T',
    score: 4,
    diagnosis: 'd',
    feedback: 'f',
    failReason: null,
    sourceVerified: true,
  }),
}));

vi.mock('../../ai/dok3Grader', () => ({
  gradeDOK3Insight: vi.fn().mockResolvedValue({
    score: 4,
    rationale: 'r',
    feedback: 'f',
  }),
}));

vi.mock('../../ai/dok4GraderService', () => ({
  gradeDOK4Spov: vi.fn().mockResolvedValue({ status: 'graded', score: 4 }),
}));

vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../storage/dok4', () => ({
  triggerDependentDOK4Grading: vi.fn().mockResolvedValue(0),
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

// Spy on withJob to detect pangram:analyze enqueues.
const queueMock = vi.fn().mockResolvedValue('job-id');
const withOptionsMock = vi.fn(() => ({ queue: queueMock }));
const forPayloadMock = vi.fn(() => ({ withOptions: withOptionsMock, queue: queueMock }));
const withJobMock = vi.fn(() => ({ forPayload: forPayloadMock }));
vi.mock('../../utils/withJob', () => ({
  withJob: (name: string) => withJobMock(name),
}));

// ── Imports under test ────────────────────────────────────────────────────

import { dok2GradeSingleJob } from '../dok2GradeSingleJob';
import { dok2RegradeJob } from '../dok2RegradeJob';
import { dok3GradeJob } from '../dok3GradeJob';
import { dok3RegradeJob } from '../dok3RegradeJob';
import { dok4GradeJob } from '../dok4GradeJob';
import { dok4RegradeJob } from '../dok4RegradeJob';
import { storage } from '../../storage';
import { gradeDOK2Summary } from '../../ai/dok2Grader';
import { gradeDOK3Insight } from '../../ai/dok3Grader';
import { gradeDOK4Spov } from '../../ai/dok4GraderService';
import type { PreviousEvaluation } from '@shared/types/regrading';

const mockHelpers = {
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  job: { attempts: 1, max_attempts: 3 },
} as unknown as JobHelpers;

const prevEval: PreviousEvaluation = {
  previousScore: 3,
  previousFeedback: 'meh',
  oldText: 'old',
  newText: 'new',
  editNumber: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm the chain shape after clearAllMocks resets call counts (mock
  // implementations persist).
  withJobMock.mockReturnValue({ forPayload: forPayloadMock });
  forPayloadMock.mockReturnValue({ withOptions: withOptionsMock, queue: queueMock });
  withOptionsMock.mockReturnValue({ queue: queueMock });
  queueMock.mockResolvedValue('job-id');
});

function expectPangramEnqueued(payload: { entityType: string; entityId: number; brainliftId: number }) {
  expect(withJobMock).toHaveBeenCalledWith('pangram:analyze');
  expect(forPayloadMock).toHaveBeenCalledWith(payload);
  expect(queueMock).toHaveBeenCalledTimes(1);
}

function expectNoPangramEnqueue() {
  const pangramCalls = withJobMock.mock.calls.filter((c) => c[0] === 'pangram:analyze');
  expect(pangramCalls).toHaveLength(0);
}

// ── DOK2 grade single ─────────────────────────────────────────────────────

describe('dok2GradeSingleJob pangram hook', () => {
  it('enqueues pangram:analyze once on grade success', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 1,
      brainliftId: 10,
      sourceName: 'src',
      sourceUrl: 'https://x.test',
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 10, displayPurpose: 'p' });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([{ text: 'p1', sortOrder: 1 }]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);

    await dok2GradeSingleJob({ summaryId: 1, brainliftId: 10 }, mockHelpers);

    expectPangramEnqueued({ entityType: 'dok2_summary', entityId: 1, brainliftId: 10 });
  });

  it('does NOT enqueue when grade work throws', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 1,
      brainliftId: 10,
      sourceName: 'src',
      sourceUrl: 'https://x.test',
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 10 });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);
    (gradeDOK2Summary as any).mockRejectedValueOnce(new Error('grade boom'));

    // dok2GradeSingleJob re-throws on non-final attempts; the pangram hook
    // sits in the success branch and must not run.
    await dok2GradeSingleJob({ summaryId: 1, brainliftId: 10 }, mockHelpers).catch(() => {});
    expectNoPangramEnqueue();
  });
});

// ── DOK2 regrade ──────────────────────────────────────────────────────────

describe('dok2RegradeJob pangram hook', () => {
  it('enqueues pangram:analyze once on regrade success', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 2,
      brainliftId: 11,
      sourceName: 'src',
      sourceUrl: 'https://x.test',
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 11, description: 'p' });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([{ text: 'p1' }]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);

    await dok2RegradeJob(
      { summaryId: 2, brainliftId: 11, previousEvaluation: prevEval },
      mockHelpers,
    );

    expectPangramEnqueued({ entityType: 'dok2_summary', entityId: 2, brainliftId: 11 });
  });

  it('does NOT enqueue when grade work throws', async () => {
    (storage.getDok2SummaryByIdForBrainlift as any).mockResolvedValue({
      id: 2,
      brainliftId: 11,
      sourceName: 'src',
      sourceUrl: 'https://x.test',
    });
    (storage.getBrainliftById as any).mockResolvedValue({ id: 11 });
    (storage.getDok2PointsForSummary as any).mockResolvedValue([]);
    (storage.getRelatedDOK1sForSummary as any).mockResolvedValue([]);
    (gradeDOK2Summary as any).mockRejectedValueOnce(new Error('boom'));

    await dok2RegradeJob(
      { summaryId: 2, brainliftId: 11, previousEvaluation: prevEval },
      mockHelpers,
    );
    expectNoPangramEnqueue();
  });
});

// ── DOK3 grade ────────────────────────────────────────────────────────────

describe('dok3GradeJob pangram hook', () => {
  it('enqueues pangram:analyze once on grade success', async () => {
    await dok3GradeJob({ insightId: 30, brainliftId: 12 }, mockHelpers);
    expectPangramEnqueued({ entityType: 'dok3_insight', entityId: 30, brainliftId: 12 });
  });

  it('does NOT enqueue when grade work throws', async () => {
    (gradeDOK3Insight as any).mockRejectedValueOnce(new Error('boom'));
    await dok3GradeJob({ insightId: 31, brainliftId: 12 }, mockHelpers).catch(() => {});
    expectNoPangramEnqueue();
  });
});

// ── DOK3 regrade ──────────────────────────────────────────────────────────

describe('dok3RegradeJob pangram hook', () => {
  it('enqueues pangram:analyze once on regrade success', async () => {
    (storage.getDOK3Insights as any).mockResolvedValue([{ id: 32 }]);

    await dok3RegradeJob(
      { insightId: 32, brainliftId: 13, previousEvaluation: prevEval },
      mockHelpers,
    );

    expectPangramEnqueued({ entityType: 'dok3_insight', entityId: 32, brainliftId: 13 });
  });

  it('does NOT enqueue when grade work throws', async () => {
    (storage.getDOK3Insights as any).mockResolvedValue([{ id: 33 }]);
    (gradeDOK3Insight as any).mockRejectedValueOnce(new Error('boom'));

    await dok3RegradeJob(
      { insightId: 33, brainliftId: 13, previousEvaluation: prevEval },
      mockHelpers,
    );
    expectNoPangramEnqueue();
  });
});

// ── DOK4 grade ────────────────────────────────────────────────────────────

describe('dok4GradeJob pangram hook', () => {
  it('enqueues pangram:analyze once on graded result', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([{ id: 40, status: 'linked' }]);
    (gradeDOK4Spov as any).mockResolvedValue({ status: 'graded', score: 4 });

    await dok4GradeJob({ spovId: 40, brainliftId: 14 }, mockHelpers);

    expectPangramEnqueued({ entityType: 'dok4_spov', entityId: 40, brainliftId: 14 });
  });

  it('does NOT enqueue when SPOV is rejected', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([{ id: 41, status: 'linked' }]);
    (gradeDOK4Spov as any).mockResolvedValue({ status: 'rejected', rejectionCategory: 'observation' });

    await dok4GradeJob({ spovId: 41, brainliftId: 14 }, mockHelpers);
    expectNoPangramEnqueue();
  });

  it('does NOT enqueue when grade returns error status', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([{ id: 42, status: 'linked' }]);
    (gradeDOK4Spov as any).mockResolvedValue({ status: 'error', error: 'boom' });

    await dok4GradeJob({ spovId: 42, brainliftId: 14 }, mockHelpers).catch(() => {});
    expectNoPangramEnqueue();
  });
});

// ── DOK4 regrade ──────────────────────────────────────────────────────────

describe('dok4RegradeJob pangram hook', () => {
  it('enqueues pangram:analyze once on regrade success', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([{ id: 50 }]);

    await dok4RegradeJob(
      { spovId: 50, brainliftId: 15, previousEvaluation: prevEval },
      mockHelpers,
    );

    expectPangramEnqueued({ entityType: 'dok4_spov', entityId: 50, brainliftId: 15 });
  });

  it('does NOT enqueue when grade work throws', async () => {
    (storage.getDOK4Spovs as any).mockResolvedValue([{ id: 51 }]);
    (gradeDOK4Spov as any).mockRejectedValueOnce(new Error('boom'));

    await dok4RegradeJob(
      { spovId: 51, brainliftId: 15, previousEvaluation: prevEval },
      mockHelpers,
    );
    expectNoPangramEnqueue();
  });
});

// Cascade-level hash-and-skip is verified inside
// server/jobs/__tests__/pangramAnalyzeJob.test.ts ('hash-and-skip' suite).
// Running the job N times with prior status=done + matching hash makes zero
// analyzeText calls, which is the FR5 cascade-cost assertion.
