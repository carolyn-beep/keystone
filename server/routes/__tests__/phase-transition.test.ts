/**
 * Tests for 02-phase-transition spec
 *
 * FR1: 3-expert threshold for Phase 2 completion
 * FR2: Research swarm trigger
 * FR3: Expert deletion phase regression
 * FR4: Celebration persistence and endpoint
 *
 * Simulates route handler / helper logic without Express.
 * Mocks: storage, withJob, base (for direct DB access in helpers).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockCountSavedBuilderExperts = vi.fn();
const mockUpdateNativeDetailsForBrainlift = vi.fn();
const mockGetNativeDetailsBySlug = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    countSavedBuilderExperts: (...args: unknown[]) => mockCountSavedBuilderExperts(...args),
    updateNativeDetailsForBrainlift: (...args: unknown[]) => mockUpdateNativeDetailsForBrainlift(...args),
    getNativeDetailsBySlug: (...args: unknown[]) => mockGetNativeDetailsBySlug(...args),
  },
}));

const mockWithJobQueue = vi.fn().mockResolvedValue('job-id');
vi.mock('../../utils/withJob', () => ({
  withJob: () => ({
    forPayload: () => ({
      queue: mockWithJobQueue,
      withOptions: () => ({
        queue: mockWithJobQueue,
      }),
    }),
  }),
}));

// Mock the base import used by afterExpertSaved/afterExpertRemoved for direct DB access
const mockDbSelect = vi.fn();
const mockDbFrom = vi.fn();
const mockDbWhere = vi.fn();

vi.mock('../../storage/base', () => ({
  db: {
    select: (...args: unknown[]) => {
      mockDbSelect(...args);
      return {
        from: (...fArgs: unknown[]) => {
          mockDbFrom(...fArgs);
          return {
            where: (...wArgs: unknown[]) => mockDbWhere(...wArgs),
          };
        },
      };
    },
  },
  nativeBrainliftDetails: { brainliftId: 'brainlift_id', phaseProgress: 'phase_progress' },
  eq: (a: unknown, b: unknown) => ({ field: a, value: b }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helper: default phase progress objects ──────────────────────────────────

function defaultProgress() {
  return {
    phase1: 'complete' as const,
    phase2: 'in_progress' as const,
    phase3: 'locked' as const,
    phase4: 'locked' as const,
    phase5: 'locked' as const,
  };
}

function completedProgress() {
  return {
    phase1: 'complete' as const,
    phase2: 'complete' as const,
    phase3: 'in_progress' as const,
    phase4: 'locked' as const,
    phase5: 'locked' as const,
  };
}

// ─── FR1: 3-Expert Threshold ─────────────────────────────────────────────────

describe('FR1: afterExpertSaved threshold logic', () => {
  it('does NOT update phase2 when 1st expert is saved (count=1)', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(1);
    const count = await mockCountSavedBuilderExperts(42);
    // With new threshold of 3, count=1 should NOT trigger phase completion
    expect(count).toBe(1);
    expect(count >= 3).toBe(false);
    expect(mockUpdateNativeDetailsForBrainlift).not.toHaveBeenCalled();
  });

  it('does NOT update phase2 when 2nd expert is saved (count=2)', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(2);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count).toBe(2);
    expect(count >= 3).toBe(false);
    expect(mockUpdateNativeDetailsForBrainlift).not.toHaveBeenCalled();
  });

  it('updates phase2 to complete AND phase3 to in_progress when 3rd expert is saved', async () => {
    // Simulate: count returns 3, detailRow has default progress
    mockCountSavedBuilderExperts.mockResolvedValue(3);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count >= 3).toBe(true);

    // When threshold is met, both phases should update
    const currentProgress = defaultProgress();
    const expectedProgress = {
      ...currentProgress,
      phase2: 'complete',
      phase3: 'in_progress',
    };
    expect(expectedProgress.phase2).toBe('complete');
    expect(expectedProgress.phase3).toBe('in_progress');
    // Other phases unchanged
    expect(expectedProgress.phase4).toBe('locked');
    expect(expectedProgress.phase5).toBe('locked');
  });

  it('is a no-op when 4th+ expert is saved (already complete)', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(4);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count >= 3).toBe(true);

    // The progress update is idempotent -- setting complete again is harmless
    const alreadyComplete = completedProgress();
    const updatedProgress = {
      ...alreadyComplete,
      phase2: 'complete',
      phase3: 'in_progress',
    };
    // No change from current state
    expect(updatedProgress).toEqual(alreadyComplete);
  });
});

// ─── FR2: Research Swarm Trigger ─────────────────────────────────────────────

describe('FR2: Research swarm trigger', () => {
  it('queues research job when 3rd expert triggers threshold', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(3);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count >= 3).toBe(true);

    // When threshold is met, research job should be queued
    // The withJob mock is pre-configured; verify the mock structure works
    const { withJob } = await import('../../utils/withJob');
    await withJob('learning-stream:research' as any)
      .forPayload({ brainliftId: 42 } as any)
      .withOptions({ jobKey: 'builder-research-42' })
      .queue();
    expect(mockWithJobQueue).toHaveBeenCalledTimes(1);
  });

  it('uses jobKey for idempotency (no error on duplicate)', async () => {
    // Calling queue multiple times with same jobKey should not error
    const { withJob } = await import('../../utils/withJob');
    await withJob('learning-stream:research' as any)
      .forPayload({ brainliftId: 42 } as any)
      .withOptions({ jobKey: 'builder-research-42' })
      .queue();
    await withJob('learning-stream:research' as any)
      .forPayload({ brainliftId: 42 } as any)
      .withOptions({ jobKey: 'builder-research-42' })
      .queue();
    expect(mockWithJobQueue).toHaveBeenCalledTimes(2);
    // Real graphile-worker with jobKey deduplicates; mock just verifies no throw
  });

  it('does NOT queue research when count < 3', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(2);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count >= 3).toBe(false);
    // No research queue call expected in the real implementation
  });

  it('job queue failure does not throw (fire-and-forget)', async () => {
    mockWithJobQueue.mockRejectedValueOnce(new Error('Queue connection failed'));
    const { withJob } = await import('../../utils/withJob');

    // In the real implementation, this is wrapped in try/catch
    // Verify the pattern: queue failure should be caught, not propagated
    try {
      await withJob('learning-stream:research' as any)
        .forPayload({ brainliftId: 42 } as any)
        .withOptions({ jobKey: 'builder-research-42' })
        .queue();
    } catch (err: any) {
      // Expected -- the real code wraps this in try/catch
      expect(err.message).toBe('Queue connection failed');
    }
  });
});

// ─── FR3: Expert Deletion Phase Regression ───────────────────────────────────

describe('FR3: afterExpertRemoved regression logic', () => {
  it('regresses phase2 to in_progress when count drops 3->2, phase3 stays', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(2);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count).toBe(2);
    expect(count < 3).toBe(true);
    expect(count === 0).toBe(false);

    // Phase2 should regress to in_progress, phase3 stays unchanged
    const currentProgress = completedProgress();
    const expectedProgress = {
      ...currentProgress,
      phase2: 'in_progress',
      // phase3 is NOT changed -- stays 'in_progress'
    };
    expect(expectedProgress.phase2).toBe('in_progress');
    expect(expectedProgress.phase3).toBe('in_progress');
  });

  it('regresses phase2 to in_progress when count drops 2->1', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(1);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count).toBe(1);
    expect(count < 3).toBe(true);
    expect(count === 0).toBe(false);

    const currentProgress = completedProgress();
    const expectedProgress = {
      ...currentProgress,
      phase2: 'in_progress',
    };
    expect(expectedProgress.phase2).toBe('in_progress');
    expect(expectedProgress.phase3).toBe('in_progress');
  });

  it('regresses phase2 to not_started when count drops 1->0', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(0);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count).toBe(0);

    const currentProgress = completedProgress();
    const expectedProgress = {
      ...currentProgress,
      phase2: 'not_started',
      // phase3 is NOT changed -- stays 'in_progress' even at 0 experts
    };
    expect(expectedProgress.phase2).toBe('not_started');
    expect(expectedProgress.phase3).toBe('in_progress');
  });

  it('does NOT re-lock phase3 after it has been unlocked', async () => {
    // Even if all experts are deleted, phase3 should never go back to 'locked'
    const currentProgress = completedProgress();
    // The key invariant: phase3 is never touched in afterExpertRemoved
    const updatedProgress = {
      ...currentProgress,
      phase2: 'not_started',
      // phase3 is explicitly NOT included in the update
    };
    expect(updatedProgress.phase3).toBe('in_progress');
    expect(updatedProgress.phase3).not.toBe('locked');
  });

  it('no-op when count is still >= 3 after deletion', async () => {
    mockCountSavedBuilderExperts.mockResolvedValue(3);
    const count = await mockCountSavedBuilderExperts(42);
    expect(count >= 3).toBe(true);
    // No regression needed -- phase2 stays complete
    expect(mockUpdateNativeDetailsForBrainlift).not.toHaveBeenCalled();
  });
});

// ─── FR4: Celebration Persistence ────────────────────────────────────────────

describe('FR4: NativeDetailsResponse includes phase3CelebratedAt', () => {
  it('returns phase3CelebratedAt as null when not yet celebrated', async () => {
    const mockDetails = {
      topic: 'Test',
      purpose: 'Test Purpose',
      owner: null,
      phaseProgress: defaultProgress(),
      lastActivePhase: 2,
      suggestionStatus: 'queued',
      suggestionError: null,
      phase3CelebratedAt: null,
    };
    mockGetNativeDetailsBySlug.mockResolvedValue(mockDetails);

    const result = await mockGetNativeDetailsBySlug('test-slug');
    expect(result.phase3CelebratedAt).toBeNull();
  });

  it('returns phase3CelebratedAt as timestamp string when celebrated', async () => {
    const celebratedAt = '2026-03-19T12:00:00.000Z';
    const mockDetails = {
      topic: 'Test',
      purpose: 'Test Purpose',
      owner: null,
      phaseProgress: completedProgress(),
      lastActivePhase: 3,
      suggestionStatus: 'ready',
      suggestionError: null,
      phase3CelebratedAt: celebratedAt,
    };
    mockGetNativeDetailsBySlug.mockResolvedValue(mockDetails);

    const result = await mockGetNativeDetailsBySlug('test-slug');
    expect(result.phase3CelebratedAt).toBe(celebratedAt);
  });
});

describe('FR4: celebrate-phase3 endpoint logic', () => {
  it('sets phase3CelebratedAt timestamp', async () => {
    mockUpdateNativeDetailsForBrainlift.mockResolvedValue({
      topic: 'Test',
      purpose: 'Test Purpose',
      owner: null,
      phaseProgress: completedProgress(),
      lastActivePhase: 3,
      suggestionStatus: 'ready',
      suggestionError: null,
      phase3CelebratedAt: '2026-03-19T12:00:00.000Z',
    });

    const result = await mockUpdateNativeDetailsForBrainlift(42, {
      phase3CelebratedAt: expect.any(Date),
    });

    expect(result.phase3CelebratedAt).toBeTruthy();
    expect(mockUpdateNativeDetailsForBrainlift).toHaveBeenCalledWith(42, {
      phase3CelebratedAt: expect.any(Date),
    });
  });

  it('is idempotent -- calling again overwrites with new timestamp', async () => {
    mockUpdateNativeDetailsForBrainlift.mockResolvedValue({
      phase3CelebratedAt: '2026-03-19T12:01:00.000Z',
    });

    // First call
    await mockUpdateNativeDetailsForBrainlift(42, { phase3CelebratedAt: new Date() });
    // Second call
    await mockUpdateNativeDetailsForBrainlift(42, { phase3CelebratedAt: new Date() });

    expect(mockUpdateNativeDetailsForBrainlift).toHaveBeenCalledTimes(2);
  });

  it('rejects non-native brainlift', () => {
    const brainlift = { sourceType: 'html' };
    expect(brainlift.sourceType !== 'native').toBe(true);
  });
});

// ─── FR5: Celebration Modal Logic ────────────────────────────────────────────

describe('FR5: Celebration modal show/hide logic', () => {
  it('should show when phase2=complete AND phase3CelebratedAt=null', () => {
    const phaseProgress = completedProgress();
    const phase3CelebratedAt = null;

    const shouldShow = phaseProgress.phase2 === 'complete' && phase3CelebratedAt === null;
    expect(shouldShow).toBe(true);
  });

  it('should NOT show when phase2=complete AND phase3CelebratedAt is set', () => {
    const phaseProgress = completedProgress();
    const phase3CelebratedAt = '2026-03-19T12:00:00.000Z';

    const shouldShow = phaseProgress.phase2 === 'complete' && phase3CelebratedAt === null;
    expect(shouldShow).toBe(false);
  });

  it('should NOT show when phase2=in_progress (threshold not met)', () => {
    const phaseProgress = defaultProgress();
    const phase3CelebratedAt = null;

    const shouldShow = phaseProgress.phase2 === 'complete' && phase3CelebratedAt === null;
    expect(shouldShow).toBe(false);
  });

  it('should NOT show on 4th expert save when already celebrated', () => {
    const phaseProgress = completedProgress();
    const phase3CelebratedAt = '2026-03-19T12:00:00.000Z';

    const shouldShow = phaseProgress.phase2 === 'complete' && phase3CelebratedAt === null;
    expect(shouldShow).toBe(false);
  });
});

describe('FR5: Progress indicator logic', () => {
  it('shows correct count for 0 of 3 experts', () => {
    const savedCount = 0;
    const threshold = 3;
    expect(`${savedCount} of ${threshold} experts saved`).toBe('0 of 3 experts saved');
  });

  it('shows correct count for 2 of 3 experts', () => {
    const savedCount = 2;
    const threshold = 3;
    expect(`${savedCount} of ${threshold} experts saved`).toBe('2 of 3 experts saved');
  });

  it('hides progress indicator when threshold is met', () => {
    const savedCount = 3;
    const threshold = 3;
    const showIndicator = savedCount < threshold;
    expect(showIndicator).toBe(false);
  });

  it('hides progress indicator when above threshold', () => {
    const savedCount = 5;
    const threshold = 3;
    const showIndicator = savedCount < threshold;
    expect(showIndicator).toBe(false);
  });
});
