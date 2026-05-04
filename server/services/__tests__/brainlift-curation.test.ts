import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStorage,
  mockCreateVersion,
  mockPruneVersions,
  mockPropagateStaleFlags,
  mockDismissStaleFlag,
  mockGetStaleItems,
  mockRecomputeBrainliftScore,
  mockWithJob,
  mockQueueFn,
  mockDbUpdate,
  mockDbSet,
  mockDbWhere,
} = vi.hoisted(() => {
  const mockQueueFn = vi.fn().mockResolvedValue(undefined);
  const mockDbWhere = vi.fn().mockResolvedValue(undefined);
  const mockDbSet = vi.fn().mockReturnValue({ where: mockDbWhere });
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbSet });

  return {
    mockStorage: {
      getBrainliftBySlug: vi.fn(),
      canAccessBrainlift: vi.fn(),
      canModifyBrainlift: vi.fn(),
      createFact: vi.fn(),
      getFactByIdForBrainlift: vi.fn(),
      editFact: vi.fn(),
      getFactDeleteImpact: vi.fn(),
      deleteFact: vi.fn(),
      createDok2Summary: vi.fn(),
      editDok2Summary: vi.fn(),
      getDok2DeleteImpact: vi.fn(),
      deleteDok2Summary: vi.fn(),
      getDOK2Summaries: vi.fn(),
      validateMultiSourceLinks: vi.fn(),
      createDok3Insight: vi.fn(),
      getDOK3Insights: vi.fn(),
      getDOK3InsightForBrainlift: vi.fn(),
      editDok3Insight: vi.fn(),
      getDok3DeleteImpact: vi.fn(),
      deleteDok3Insight: vi.fn(),
      addLinksToDok3Insight: vi.fn(),
      createDok4Spov: vi.fn(),
      getDOK4Spovs: vi.fn(),
      editDok4Spov: vi.fn(),
      getDok4DeleteImpact: vi.fn(),
      deleteDok4Spov: vi.fn(),
      addLinksToDok4Spov: vi.fn(),
      createExpertsForBrainlift: vi.fn(),
      deleteExpertForBrainlift: vi.fn(),
      getExpertsByBrainliftId: vi.fn(),
    },
    mockCreateVersion: vi.fn().mockResolvedValue(undefined),
    mockPruneVersions: vi.fn().mockResolvedValue(undefined),
    mockPropagateStaleFlags: vi.fn().mockResolvedValue({
      dok2Count: 1,
      dok3Count: 2,
      dok4Count: 3,
    }),
    mockDismissStaleFlag: vi.fn().mockResolvedValue(undefined),
    mockGetStaleItems: vi.fn(),
    mockRecomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
    mockWithJob: vi.fn(),
    mockQueueFn,
    mockDbUpdate,
    mockDbSet,
    mockDbWhere,
  };
});

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../storage/base', () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: vi.fn(() => 'eq'),
  facts: { id: 'facts.id' },
  dok2Summaries: { id: 'dok2.id' },
}));

vi.mock('../../storage/versions', () => ({
  createVersion: mockCreateVersion,
  pruneVersions: mockPruneVersions,
}));

vi.mock('../../storage/stale', () => ({
  propagateStaleFlags: mockPropagateStaleFlags,
  dismissStaleFlag: mockDismissStaleFlag,
  getStaleItems: mockGetStaleItems,
}));

vi.mock('../brainlift', () => ({
  recomputeBrainliftScore: mockRecomputeBrainliftScore,
}));

vi.mock('../../utils/withJob', () => ({
  withJob: mockWithJob,
}));

import {
  createBrainliftExperts,
  createDok3Item,
  deleteBrainliftExpert,
  deleteDokItem,
  dismissStaleDokItem,
  editDokItem,
  linkDok3Evidence,
  linkDok4Evidence,
  listStaleDokItems,
} from '../brainlift-curation';

const authContext = {
  userId: 'user-1',
  role: 'user' as const,
  isAdmin: false,
};

const testBrainlift = {
  id: 42,
  slug: 'test-bl',
};

function installJobChain() {
  const chain = {
    queue: mockQueueFn,
    withOptions: vi.fn().mockReturnValue({ queue: mockQueueFn }),
  };

  mockWithJob.mockReturnValue({
    forPayload: vi.fn().mockReturnValue(chain),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  installJobChain();
  mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
  mockStorage.canAccessBrainlift.mockResolvedValue(true);
  mockStorage.canModifyBrainlift.mockResolvedValue(true);
});

describe('brainlift-curation', () => {
  it('rejects modify flows for inaccessible brainlifts', async () => {
    mockStorage.canModifyBrainlift.mockResolvedValue(false);

    await expect(
      createDok3Item(authContext, {
        slug: 'test-bl',
        text: 'Insight',
        linkedDok2Ids: [10, 11],
      }),
    ).rejects.toThrow('Brainlift not found');
  });

  it('creates a DOK3 item after validating multi-source and ownership, even if queueing fails', async () => {
    mockStorage.validateMultiSourceLinks.mockResolvedValue({ valid: true });
    mockStorage.getDOK2Summaries.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockStorage.createDok3Insight.mockResolvedValue({ id: 77 });
    mockStorage.getDOK3Insights.mockResolvedValue([
      {
        id: 77,
        text: 'New insight',
        status: 'linked',
        linkedDok2SummaryIds: [10, 11],
      },
    ]);
    mockQueueFn.mockRejectedValueOnce(new Error('queue unavailable'));

    const result = await createDok3Item(authContext, {
      slug: 'test-bl',
      text: 'New insight',
      linkedDok2Ids: [10, 10, 11],
    });

    expect(mockStorage.createDok3Insight).toHaveBeenCalledWith({
      brainliftId: 42,
      text: 'New insight',
      linkedDok2Ids: [10, 11],
    });
    expect(mockWithJob).toHaveBeenCalledWith('dok3:grade');
    expect(result).toEqual(
      expect.objectContaining({
        id: 77,
        dokLevel: 3,
        status: 'grading',
        item: expect.objectContaining({ id: 77 }),
      }),
    );
  });

  it('runs versioning, stale propagation, and regrade queueing when editing a DOK1 item', async () => {
    mockStorage.getFactByIdForBrainlift
      .mockResolvedValueOnce({ id: 9, fact: 'Old fact' })
      .mockResolvedValueOnce({ id: 9, fact: 'New fact' });
    mockStorage.editFact.mockResolvedValue({
      previousText: 'Old fact',
      previousScore: 3,
      previousFeedback: 'Needs evidence',
    });

    const result = await editDokItem(authContext, {
      slug: 'test-bl',
      dok: 1,
      itemId: 9,
      text: 'New fact',
    });

    expect(mockCreateVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        dokLevel: 1,
        itemId: 9,
        brainliftId: 42,
        textContent: 'Old fact',
      }),
    );
    expect(mockPropagateStaleFlags).toHaveBeenCalledWith(
      expect.objectContaining({
        dokLevel: 1,
        itemId: 9,
        brainliftId: 42,
      }),
    );
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockWithJob).toHaveBeenCalledWith('dok1:regrade');
    expect(result).toEqual(
      expect.objectContaining({
        id: 9,
        dokLevel: 1,
        status: 'regrading',
        previousScore: 3,
        item: expect.objectContaining({ id: 9, fact: 'New fact' }),
      }),
    );
  });

  it('returns a delete preview without executing the deletion', async () => {
    mockStorage.getFactDeleteImpact.mockResolvedValue({
      item: { id: 5, text: 'Fact', score: 2 },
      unlinkedItems: [{ id: 20, dokLevel: 2, text: 'Summary' }],
      staleDok2Ids: [20],
      staleDok3Ids: [30],
      staleDok4Ids: [],
    });

    const result = await deleteDokItem(authContext, {
      slug: 'test-bl',
      dok: 1,
      itemId: 5,
    });

    expect(mockStorage.deleteFact).not.toHaveBeenCalled();
    expect(mockRecomputeBrainliftScore).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        confirmed: false,
        requiresConfirmation: true,
        dokLevel: 1,
        itemId: 5,
        impactSummary: { unlinked: 1, markedStale: 2 },
      }),
    );
  });

  it('executes deletion and recomputes the brainlift score when confirm=true', async () => {
    mockStorage.deleteFact.mockResolvedValue({
      deleted: true,
      impactSummary: { unlinked: 2, markedStale: 3 },
    });

    const result = await deleteDokItem(authContext, {
      slug: 'test-bl',
      dok: 1,
      itemId: 5,
      confirm: true,
    });

    expect(mockStorage.deleteFact).toHaveBeenCalledWith(5, 42);
    expect(mockRecomputeBrainliftScore).toHaveBeenCalledWith(42, {
      trigger: 'delete',
      dokLevel: 1,
      itemId: 5,
    });
    expect(result).toEqual({
      confirmed: true,
      dokLevel: 1,
      itemId: 5,
      deleted: true,
      impactSummary: { unlinked: 2, markedStale: 3 },
    });
  });

  it('lists stale items and dismisses one idempotently', async () => {
    mockGetStaleItems.mockResolvedValue({
      dok1: [{ id: 1, text: 'Fact', staleReason: 'edited' }],
      dok2: [],
      dok3: [],
      dok4: [],
    });

    const listed = await listStaleDokItems(authContext, { slug: 'test-bl' });
    const dismissed = await dismissStaleDokItem(authContext, {
      slug: 'test-bl',
      dok: 1,
      itemId: 1,
    });

    expect(listed).toEqual({
      slug: 'test-bl',
      dok1: [{ id: 1, text: 'Fact', staleReason: 'edited' }],
      dok2: [],
      dok3: [],
      dok4: [],
    });
    expect(mockDismissStaleFlag).toHaveBeenCalledWith(1, 1, 42);
    expect(dismissed).toEqual({
      slug: 'test-bl',
      dokLevel: 1,
      itemId: 1,
      dismissed: true,
    });
  });

  it('links DOK2 evidence to an insight, skipping duplicates and queueing regrade', async () => {
    mockStorage.getDOK2Summaries.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockStorage.addLinksToDok3Insight.mockResolvedValue({
      addedCount: 1,
      existingItem: {
        id: 8,
        text: 'Insight text',
        score: 4,
        status: 'graded',
      },
    });
    mockStorage.getDOK3Insights.mockResolvedValue([
      {
        id: 8,
        text: 'Insight text',
        status: 'graded',
        linkedDok2SummaryIds: [10, 11],
      },
    ]);

    const result = await linkDok3Evidence(authContext, {
      slug: 'test-bl',
      insightId: 8,
      dok2Ids: [10, 10, 11],
    });

    expect(mockStorage.addLinksToDok3Insight).toHaveBeenCalledWith({
      insightId: 8,
      brainliftId: 42,
      dok2Ids: [10, 11],
    });
    expect(mockCreateVersion).toHaveBeenCalled();
    expect(mockWithJob).toHaveBeenCalledWith('dok3:regrade');
    expect(result).toEqual(
      expect.objectContaining({
        id: 8,
        status: 'regrading',
        addedLinks: 1,
        skippedLinks: 1,
      }),
    );
  });

  it('rejects link_dok4 when the requested new primary is not in the final linked set', async () => {
    mockStorage.getDOK4Spovs.mockResolvedValue([
      {
        id: 12,
        text: 'SPOV',
        linkedDok3InsightIds: [20],
        primaryDok3InsightId: 20,
      },
    ]);
    mockStorage.getDOK3Insights.mockResolvedValue([{ id: 21 }]);

    await expect(
      linkDok4Evidence(authContext, {
        slug: 'test-bl',
        spovId: 12,
        dok3Ids: [21],
        newPrimaryDok3Id: 99,
      }),
    ).rejects.toThrow('newPrimaryDok3Id must refer to an existing or newly linked DOK3 insight');
  });

  it('creates experts even when rerank queueing fails, and deletes experts with rerank on success', async () => {
    mockStorage.createExpertsForBrainlift.mockResolvedValue([
      { id: 1, name: 'Expert A' },
    ]);
    mockQueueFn.mockRejectedValueOnce(new Error('rerank unavailable'));

    const created = await createBrainliftExperts(authContext, {
      slug: 'test-bl',
      experts: [{ name: 'Expert A', who: 'Who', why: 'Why' }],
    });

    mockStorage.deleteExpertForBrainlift.mockResolvedValue(true);
    const deleted = await deleteBrainliftExpert(authContext, {
      slug: 'test-bl',
      expertId: 1,
    });

    expect(created).toEqual({
      slug: 'test-bl',
      createdExperts: [{ id: 1, name: 'Expert A' }],
      rerankQueued: false,
    });
    expect(deleted).toEqual({
      slug: 'test-bl',
      expertId: 1,
      deleted: true,
      rerankQueued: true,
    });
  });
});
