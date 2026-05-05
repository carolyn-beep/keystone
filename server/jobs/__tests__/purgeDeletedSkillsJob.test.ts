import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHardDeleteExpiredDeletedSkills } = vi.hoisted(() => ({
  mockHardDeleteExpiredDeletedSkills: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: {
    hardDeleteExpiredDeletedSkills: mockHardDeleteExpiredDeletedSkills,
  },
}));

function buildHelpers() {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
}

describe('purgeDeletedSkillsJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T12:00:00.000Z'));
    mockHardDeleteExpiredDeletedSkills.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls storage with a 30-day cutoff and returns the deleted count', async () => {
    mockHardDeleteExpiredDeletedSkills.mockResolvedValue(3);
    const helpers = buildHelpers();
    const { purgeDeletedSkillsJob } = await import('../purgeDeletedSkillsJob');

    await expect(purgeDeletedSkillsJob({}, helpers as any)).resolves.toEqual({
      success: true,
      deletedCount: 3,
      cutoff: '2026-04-05T12:00:00.000Z',
      completedAt: '2026-05-05T12:00:00.000Z',
    });

    expect(mockHardDeleteExpiredDeletedSkills).toHaveBeenCalledWith(new Date('2026-04-05T12:00:00.000Z'));
    expect(helpers.logger.info).toHaveBeenCalledWith('Starting deleted skills purge', {
      cutoff: '2026-04-05T12:00:00.000Z',
    });
    expect(helpers.logger.info).toHaveBeenCalledWith('Deleted skills purge completed', {
      cutoff: '2026-04-05T12:00:00.000Z',
      deletedCount: 3,
    });
  });

  it('propagates storage failures for worker retry/reporting', async () => {
    const failure = new Error('database unavailable');
    mockHardDeleteExpiredDeletedSkills.mockRejectedValue(failure);
    const { purgeDeletedSkillsJob } = await import('../purgeDeletedSkillsJob');

    await expect(purgeDeletedSkillsJob({}, buildHelpers() as any)).rejects.toThrow(failure);
  });
});
