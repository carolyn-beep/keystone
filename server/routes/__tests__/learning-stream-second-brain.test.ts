import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage, mockDb } = vi.hoisted(() => ({
  mockStorage: {
    updateLearningStreamItemStatus: vi.fn(),
  },
  mockDb: {
    transaction: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../db', () => ({
  db: mockDb,
}));

vi.mock('../../ai/learning-stream-swarm', () => ({
  swarmEmitter: {
    isSwarmActive: vi.fn(),
    subscribe: vi.fn(),
  },
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'research-project', itemId: '25' },
    body: {},
    brainlift: {
      id: 7,
      slug: 'research-project',
      phase: 'research',
    },
    authContext: {
      userId: 'user-1',
      isAdmin: false,
    },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('learning stream bookmark mirror handler', () => {
  it('requires categoryId before mirroring a bookmark to Second Brain', async () => {
    const { bookmarkLearningStreamItemHandler } = await import('../learning-stream');

    await expect(bookmarkLearningStreamItemHandler(createReq(), createRes()))
      .rejects.toThrow('categoryId required before save to Second Brain');

    expect(mockStorage.updateLearningStreamItemStatus).not.toHaveBeenCalled();
  });

  it('mirrors authoring-phase bookmarks into Second Brain instead of using legacy source-null behavior', async () => {
    const { bookmarkLearningStreamItemHandler } = await import('../learning-stream');
    const req = createReq({
      body: { categoryId: 11 },
      brainlift: {
        id: 7,
        slug: 'legacy-project',
        phase: 'authoring',
      },
    });
    const res = createRes();
    const mirrored = {
      item: { id: 25, brainliftId: 7, status: 'bookmarked' },
      source: { id: 99, brainliftId: 7, learningStreamItemId: 25 },
    };
    mockDb.transaction.mockResolvedValue(mirrored);

    await bookmarkLearningStreamItemHandler(req, res);

    expect(mockStorage.updateLearningStreamItemStatus).not.toHaveBeenCalled();
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(mirrored);
  });

  it('validates bookmark item IDs', async () => {
    const { bookmarkLearningStreamItemHandler } = await import('../learning-stream');

    await expect(bookmarkLearningStreamItemHandler(
      createReq({
        params: { slug: 'research-project', itemId: 'bad' },
        body: { categoryId: 1 },
      }),
      createRes(),
    )).rejects.toThrow('Invalid item ID');
  });
});
