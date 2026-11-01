import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage, mockGenerate } = vi.hoisted(() => ({
  mockStorage: {
    finalizeGeneratingPlan: vi.fn(),
    markPlanGenerationFailed: vi.fn(),
  },
  mockGenerate: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/sprintGenerator', () => ({
  generateSprintPlan: (...args: unknown[]) => mockGenerate(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.finalizeGeneratingPlan.mockResolvedValue(undefined);
  mockStorage.markPlanGenerationFailed.mockResolvedValue(undefined);
});

const helpers = {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  abortSignal: new AbortController().signal,
} as any;

const basePayload = {
  planId: 500,
  brainliftId: 1,
  startDate: '2026-04-21',
  localDate: '2026-04-21',
  diagnosis: {
    goalRaw: 'Ship the thing.',
    currentState: 'Nothing yet.',
  },
};

describe('sprintGenerateJob', () => {
  it('finalizes the plan on successful generation', async () => {
    const { sprintGenerateJob } = await import('../sprintGenerateJob');
    mockGenerate.mockResolvedValue({
      startDate: '2026-04-21',
      tasks: [
        { scheduledDate: '2026-04-21', title: 'Task 1', description: 'Desc 1', milestone: null },
      ],
      modelUsed: 'anthropic/claude-opus-4.6',
    });

    await sprintGenerateJob(basePayload, helpers);

    expect(mockStorage.finalizeGeneratingPlan).toHaveBeenCalledWith({
      planId: 500,
      brainliftId: 1,
      startDate: '2026-04-21',
      tasks: expect.any(Array),
    });
    expect(mockStorage.markPlanGenerationFailed).not.toHaveBeenCalled();
  });

  it('marks the plan failed when generation throws, without rethrowing (no Graphile retry)', async () => {
    const { sprintGenerateJob } = await import('../sprintGenerateJob');
    mockGenerate.mockRejectedValue(new Error('All models failed'));

    await sprintGenerateJob(basePayload, helpers);

    expect(mockStorage.finalizeGeneratingPlan).not.toHaveBeenCalled();
    expect(mockStorage.markPlanGenerationFailed).toHaveBeenCalledWith({
      planId: 500,
      brainliftId: 1,
      errorMessage: 'All models failed',
    });
  });
});
