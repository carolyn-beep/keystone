/**
 * Tests for FR3: Shared Pipeline Function (02-conditional-pipeline)
 *
 * Tests runDOK3DOK4Pipeline() orchestration: sequential phases,
 * SSE events, error resilience, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    getDOK3Insights: vi.fn(),
    getDOK2Summaries: vi.fn(),
    getDOK4Spovs: vi.fn(),
  },
}));

// Mock DOK3 auto-linker
vi.mock('../../ai/dok3AutoLinker', () => ({
  autoLinkDOK3Insights: vi.fn(),
}));

// Mock DOK3 grader
vi.mock('../../ai/dok3Grader', () => ({
  gradeDOK3Insight: vi.fn(),
}));

// Mock DOK4 auto-linker
vi.mock('../../ai/dok4AutoLinker', () => ({
  autoLinkDOK4Spovs: vi.fn(),
}));

// Mock DOK4 grader service
vi.mock('../../ai/dok4GraderService', () => ({
  gradeDOK4Spov: vi.fn(),
}));

// Mock brainlift score recomputation
vi.mock('../brainlift', () => ({
  recomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
}));

import { storage } from '../../storage';
import { autoLinkDOK3Insights } from '../../ai/dok3AutoLinker';
import { gradeDOK3Insight } from '../../ai/dok3Grader';
import { autoLinkDOK4Spovs } from '../../ai/dok4AutoLinker';
import { gradeDOK4Spov } from '../../ai/dok4GraderService';
import { recomputeBrainliftScore } from '../brainlift';
import { runDOK3DOK4Pipeline } from '../grading-pipeline';

// Fixtures
const MOCK_DOK3_PENDING = [
  { id: 1, text: 'Insight about climate', status: 'pending_linking', brainliftId: 100 },
  { id: 2, text: 'Insight about energy', status: 'pending_linking', brainliftId: 100 },
];

const MOCK_DOK3_LINKED = [
  { id: 1, text: 'Insight about climate', status: 'linked', brainliftId: 100 },
  { id: 2, text: 'Insight about energy', status: 'linked', brainliftId: 100 },
];

const MOCK_DOK3_GRADED = [
  { id: 1, text: 'Insight about climate', status: 'graded', brainliftId: 100 },
  { id: 2, text: 'Insight about energy', status: 'graded', brainliftId: 100 },
];

const MOCK_DOK2_SUMMARIES = [
  { id: 10, sourceName: 'Source A', sourceUrl: 'https://a.com', displayTitle: 'Title A', points: [{ text: 'Point 1' }] },
  { id: 11, sourceName: 'Source B', sourceUrl: 'https://b.com', displayTitle: 'Title B', points: [{ text: 'Point 2' }] },
];

const MOCK_DOK4_PENDING = [
  { id: 201, text: 'SPOV about intersections', status: 'pending_linking', brainliftId: 100, workflowyNodeId: 'wf-1' },
  { id: 202, text: 'SPOV about asymmetries', status: 'pending_linking', brainliftId: 100, workflowyNodeId: 'wf-2' },
];

const MOCK_DOK4_LINKED = [
  { id: 201, text: 'SPOV about intersections', status: 'linked', brainliftId: 100, workflowyNodeId: 'wf-1' },
  { id: 202, text: 'SPOV about asymmetries', status: 'linked', brainliftId: 100, workflowyNodeId: 'wf-2' },
];

/**
 * getDOK3Insights is called 3 times:
 * 1. Phase 1: initial fetch (pending_linking)
 * 2. Phase 2: re-fetch after linking (linked)
 * 3. Phase 3: re-fetch for DOK4 linking (graded)
 *
 * getDOK4Spovs is called 2 times:
 * 1. Phase 3: fetch pending SPOVs (pending_linking)
 * 2. Phase 4: re-fetch linked SPOVs (linked)
 */
function setupHappyPathMocks() {
  vi.mocked(storage.getDOK3Insights)
    .mockResolvedValueOnce(MOCK_DOK3_PENDING as any)  // Phase 1
    .mockResolvedValueOnce(MOCK_DOK3_LINKED as any)    // Phase 2
    .mockResolvedValueOnce(MOCK_DOK3_GRADED as any);   // Phase 3

  vi.mocked(storage.getDOK2Summaries).mockResolvedValue(MOCK_DOK2_SUMMARIES as any);

  vi.mocked(storage.getDOK4Spovs)
    .mockResolvedValueOnce(MOCK_DOK4_PENDING as any)   // Phase 3
    .mockResolvedValueOnce(MOCK_DOK4_LINKED as any);   // Phase 4

  vi.mocked(autoLinkDOK3Insights).mockResolvedValue([
    { insightId: 1, dok2SummaryIds: [10, 11], flagged: false },
    { insightId: 2, dok2SummaryIds: [10, 11], flagged: false },
  ]);
  vi.mocked(gradeDOK3Insight).mockResolvedValue({ score: 4 } as any);
  vi.mocked(autoLinkDOK4Spovs).mockResolvedValue(undefined);
  vi.mocked(gradeDOK4Spov).mockResolvedValue({ status: 'graded', score: 4 });
}

describe('FR3: Shared Pipeline Function - runDOK3DOK4Pipeline()', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('executes sequential phases: DOK3 link -> DOK3 grade -> DOK4 link -> DOK4 grade', async () => {
    const callOrder: string[] = [];
    setupHappyPathMocks();

    vi.mocked(autoLinkDOK3Insights).mockImplementation(async () => {
      callOrder.push('dok3_link');
      return [{ insightId: 1, dok2SummaryIds: [10], flagged: false }];
    });
    vi.mocked(gradeDOK3Insight).mockImplementation(async () => {
      callOrder.push('dok3_grade');
      return { score: 4 } as any;
    });
    vi.mocked(autoLinkDOK4Spovs).mockImplementation(async () => {
      callOrder.push('dok4_link');
    });
    vi.mocked(gradeDOK4Spov).mockImplementation(async () => {
      callOrder.push('dok4_grade');
      return { status: 'graded', score: 4 };
    });

    await runDOK3DOK4Pipeline(100, 'test-slug');

    // Verify phase ordering
    const firstDok3Link = callOrder.indexOf('dok3_link');
    const firstDok3Grade = callOrder.indexOf('dok3_grade');
    const firstDok4Link = callOrder.indexOf('dok4_link');
    const firstDok4Grade = callOrder.indexOf('dok4_grade');

    expect(firstDok3Link).toBeLessThan(firstDok3Grade);
    expect(firstDok3Grade).toBeLessThan(firstDok4Link);
    expect(firstDok4Link).toBeLessThan(firstDok4Grade);
  });

  it('emits SSE events at each phase with completed/total', async () => {
    setupHappyPathMocks();
    const onProgress = vi.fn();

    await runDOK3DOK4Pipeline(100, 'test-slug', onProgress);

    // Check for dok3_linking event
    const dok3LinkEvents = onProgress.mock.calls.filter(
      (c: any) => c[0]?.stage === 'dok3_linking'
    );
    expect(dok3LinkEvents.length).toBeGreaterThan(0);

    // Check for grading_dok3 events with completed/total
    const dok3GradeEvents = onProgress.mock.calls.filter(
      (c: any) => c[0]?.stage === 'grading_dok3'
    );
    expect(dok3GradeEvents.length).toBeGreaterThan(0);
    const lastDok3Grade = dok3GradeEvents[dok3GradeEvents.length - 1][0];
    expect(lastDok3Grade.completed).toBeDefined();
    expect(lastDok3Grade.total).toBeDefined();

    // Check for grading_dok4 events with completed/total
    const dok4GradeEvents = onProgress.mock.calls.filter(
      (c: any) => c[0]?.stage === 'grading_dok4'
    );
    expect(dok4GradeEvents.length).toBeGreaterThan(0);
    const lastDok4Grade = dok4GradeEvents[dok4GradeEvents.length - 1][0];
    expect(lastDok4Grade.completed).toBeDefined();
    expect(lastDok4Grade.total).toBeDefined();
  });

  it('calls recomputeBrainliftScore at end', async () => {
    setupHappyPathMocks();
    await runDOK3DOK4Pipeline(100, 'test-slug');

    expect(recomputeBrainliftScore).toHaveBeenCalledWith(100);
    expect(recomputeBrainliftScore).toHaveBeenCalledTimes(1);
  });

  it('no DOK3 insights: skips DOK3 phases, proceeds to DOK4', async () => {
    // All getDOK3Insights calls return empty
    vi.mocked(storage.getDOK3Insights).mockResolvedValue([]);
    vi.mocked(storage.getDOK2Summaries).mockResolvedValue(MOCK_DOK2_SUMMARIES as any);
    vi.mocked(storage.getDOK4Spovs)
      .mockResolvedValueOnce([] as any)  // No pending SPOVs either (no DOK3 to link to)
      .mockResolvedValueOnce([] as any);

    await runDOK3DOK4Pipeline(100, 'test-slug');

    expect(autoLinkDOK3Insights).not.toHaveBeenCalled();
    expect(gradeDOK3Insight).not.toHaveBeenCalled();
    expect(recomputeBrainliftScore).toHaveBeenCalled();
  });

  it('no DOK4 SPOVs: skips DOK4 phases', async () => {
    setupHappyPathMocks();
    // Override DOK4 returns to be empty
    vi.mocked(storage.getDOK4Spovs)
      .mockReset()
      .mockResolvedValue([] as any);

    await runDOK3DOK4Pipeline(100, 'test-slug');

    expect(autoLinkDOK4Spovs).not.toHaveBeenCalled();
    expect(gradeDOK4Spov).not.toHaveBeenCalled();
    // DOK3 phases should still run
    expect(autoLinkDOK3Insights).toHaveBeenCalled();
    expect(recomputeBrainliftScore).toHaveBeenCalled();
  });

  it('individual DOK3 grading errors do not block remaining items', async () => {
    setupHappyPathMocks();
    vi.mocked(gradeDOK3Insight)
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce({ score: 4 } as any);

    await runDOK3DOK4Pipeline(100, 'test-slug');

    // Both insights were attempted
    expect(gradeDOK3Insight).toHaveBeenCalledTimes(2);
    // DOK4 phases still ran
    expect(gradeDOK4Spov).toHaveBeenCalled();
  });

  it('DOK3 grading errors do not block DOK4 phases', async () => {
    setupHappyPathMocks();
    vi.mocked(gradeDOK3Insight).mockRejectedValue(new Error('All DOK3 grading failed'));

    await runDOK3DOK4Pipeline(100, 'test-slug');

    // DOK4 should still run
    expect(gradeDOK4Spov).toHaveBeenCalled();
    expect(recomputeBrainliftScore).toHaveBeenCalled();
  });

  it('individual DOK4 grading errors do not block remaining items', async () => {
    setupHappyPathMocks();
    vi.mocked(gradeDOK4Spov)
      .mockResolvedValueOnce({ status: 'error', error: 'LLM fail' })
      .mockResolvedValueOnce({ status: 'graded', score: 4 });

    await runDOK3DOK4Pipeline(100, 'test-slug');

    expect(gradeDOK4Spov).toHaveBeenCalledTimes(2);
    expect(recomputeBrainliftScore).toHaveBeenCalled();
  });
});
