import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobHelpers } from 'graphile-worker';

const { mockStorage, mockRerankExistingExperts } = vi.hoisted(() => ({
  mockStorage: {
    getBrainliftById: vi.fn(),
    getFactsForBrainlift: vi.fn(),
    getExpertsByBrainliftId: vi.fn(),
    updateExpertRankings: vi.fn(),
  },
  mockRerankExistingExperts: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/experts', () => ({
  rerankExistingExperts: (...args: unknown[]) => mockRerankExistingExperts(...args),
}));

import { rerankExpertsJob } from '../rerankExpertsJob';

const helpers = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  job: { id: 'job-1', attempts: 1, max_attempts: 1 },
} as unknown as JobHelpers;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rerankExpertsJob', () => {
  it('reranks existing experts in place', async () => {
    mockStorage.getBrainliftById.mockResolvedValue({
      id: 42,
      title: 'Brainlift',
      description: 'Description',
      author: 'Author',
      originalContent: '## Experts',
    });
    mockStorage.getFactsForBrainlift.mockResolvedValue([{ id: 1, fact: 'Fact' }]);
    mockStorage.getExpertsByBrainliftId.mockResolvedValue([
      { id: 5, name: 'Expert One', who: 'Researcher', why: 'Relevant', focus: 'AI', where: '@expert1', twitterHandle: '@expert1' },
    ]);
    mockRerankExistingExperts.mockResolvedValue([
      { expertId: 5, rankScore: 9, rationale: '9 citations' },
    ]);

    const result = await rerankExpertsJob({ brainliftId: 42 }, helpers);

    expect(mockRerankExistingExperts).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Brainlift',
        experts: [expect.objectContaining({ id: 5, name: 'Expert One' })],
      }),
    );
    expect(mockStorage.updateExpertRankings).toHaveBeenCalledWith(42, [
      { expertId: 5, rankScore: 9, rationale: '9 citations' },
    ]);
    expect(result).toEqual({ success: true, updated: 1 });
  });

  it('no-ops when a brainlift has no experts', async () => {
    mockStorage.getBrainliftById.mockResolvedValue({
      id: 42,
      title: 'Brainlift',
      description: 'Description',
      author: null,
      originalContent: null,
    });
    mockStorage.getFactsForBrainlift.mockResolvedValue([]);
    mockStorage.getExpertsByBrainliftId.mockResolvedValue([]);

    const result = await rerankExpertsJob({ brainliftId: 42 }, helpers);

    expect(mockRerankExistingExperts).not.toHaveBeenCalled();
    expect(mockStorage.updateExpertRankings).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, updated: 0 });
  });
});
