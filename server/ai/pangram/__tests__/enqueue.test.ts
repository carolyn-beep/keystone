import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ id: number }>,
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  withJob: vi.fn(),
  forPayload: vi.fn(),
  withOptions: vi.fn(),
  queue: vi.fn(),
}));

vi.mock('../../../storage/base', () => ({
  db: {
    select: mocks.select,
  },
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  dok2Summaries: { id: 'dok2.id', brainliftId: 'dok2.brainlift_id' },
  dok3Insights: { id: 'dok3.id', brainliftId: 'dok3.brainlift_id' },
  dok4Spovs: { id: 'dok4.id', brainliftId: 'dok4.brainlift_id' },
}));

vi.mock('../../../utils/withJob', () => ({
  withJob: mocks.withJob,
}));

import { enqueuePangramAnalysis, pangramEntityExistsForBrainlift } from '../enqueue';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [{ id: 123 }];
  mocks.limit.mockImplementation(async () => mocks.rows);
  mocks.where.mockReturnValue({ limit: mocks.limit });
  mocks.from.mockReturnValue({ where: mocks.where });
  mocks.select.mockReturnValue({ from: mocks.from });
  mocks.queue.mockResolvedValue('job-id');
  mocks.withOptions.mockReturnValue({ queue: mocks.queue });
  mocks.forPayload.mockReturnValue({ withOptions: mocks.withOptions });
  mocks.withJob.mockReturnValue({ forPayload: mocks.forPayload });
});

describe('pangramEntityExistsForBrainlift', () => {
  it.each([
    'dok2_summary',
    'dok3_insight',
    'dok4_spov',
  ] as const)('returns true when %s exists for the brainlift', async (entityType) => {
    await expect(pangramEntityExistsForBrainlift({
      entityType,
      entityId: 123,
      brainliftId: 456,
    })).resolves.toBe(true);

    expect(mocks.select).toHaveBeenCalledWith({ id: expect.anything() });
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });

  it('returns false when the entity is missing for the brainlift', async () => {
    mocks.rows = [];

    await expect(pangramEntityExistsForBrainlift({
      entityType: 'dok3_insight',
      entityId: 123,
      brainliftId: 456,
    })).resolves.toBe(false);
  });
});

describe('enqueuePangramAnalysis', () => {
  it('queues pangram:analyze with maxAttempts=3 when the entity exists', async () => {
    await expect(enqueuePangramAnalysis({
      entityType: 'dok4_spov',
      entityId: 123,
      brainliftId: 456,
    })).resolves.toBe(true);

    expect(mocks.withJob).toHaveBeenCalledWith('pangram:analyze');
    expect(mocks.forPayload).toHaveBeenCalledWith({
      entityType: 'dok4_spov',
      entityId: 123,
      brainliftId: 456,
    });
    expect(mocks.withOptions).toHaveBeenCalledWith({ maxAttempts: 3 });
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });

  it('skips queueing when the entity does not belong to the brainlift', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.rows = [];

    await expect(enqueuePangramAnalysis({
      entityType: 'dok2_summary',
      entityId: 123,
      brainliftId: 456,
    })).resolves.toBe(false);

    expect(mocks.withJob).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Pangram] Skipping pangram:analyze enqueue; dok2_summary 123 not found for brainlift 456',
    );

    warnSpy.mockRestore();
  });
});
