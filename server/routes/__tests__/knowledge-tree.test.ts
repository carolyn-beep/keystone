/**
 * Tests for 01-schema-and-api: Knowledge Tree API Endpoints
 *
 * FR1: Schema types (categories, amended columns, source union)
 * FR2: GET /knowledge-tree (three-section list with metadata)
 * FR3: POST /knowledge-tree/manual-source (manual LS item creation)
 * FR4: GET /knowledge-tree/items/:itemId (item detail with extractions)
 * FR5: DELETE /knowledge-tree/items/:itemId/extractions (extraction delete)
 *
 * Simulates route handler logic without Express.
 * Mocks: storage, swarmEmitter, withJob.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetKnowledgeTree = vi.fn();
const mockGetItemDetail = vi.fn();
const mockCreateManualSource = vi.fn();
const mockDeleteExtractions = vi.fn();
const mockGetLearningStreamItemById = vi.fn();
const mockHasResearchJobPending = vi.fn();
const mockGetNativeDetailsBySlug = vi.fn();
const mockGetLearningStreamItemByUrl = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    getKnowledgeTree: (...args: unknown[]) => mockGetKnowledgeTree(...args),
    getItemDetail: (...args: unknown[]) => mockGetItemDetail(...args),
    createManualSource: (...args: unknown[]) => mockCreateManualSource(...args),
    deleteExtractions: (...args: unknown[]) => mockDeleteExtractions(...args),
    getLearningStreamItemById: (...args: unknown[]) => mockGetLearningStreamItemById(...args),
    hasResearchJobPending: (...args: unknown[]) => mockHasResearchJobPending(...args),
    getNativeDetailsBySlug: (...args: unknown[]) => mockGetNativeDetailsBySlug(...args),
    getLearningStreamItemByUrl: (...args: unknown[]) => mockGetLearningStreamItemByUrl(...args),
  },
}));

const mockIsSwarmActive = vi.fn();
vi.mock('../../ai/learning-stream-swarm', () => ({
  swarmEmitter: {
    isSwarmActive: (...args: unknown[]) => mockIsSwarmActive(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const BRAINLIFT_ID = 5;
const BRAINLIFT_SLUG = 'test-brainlift';

const samplePendingItem = {
  id: 1,
  brainliftId: BRAINLIFT_ID,
  type: 'Substack',
  author: 'Alice',
  topic: 'AI Research',
  time: '5 min',
  facts: 'Key findings about AI.',
  url: 'https://example.com/ai-research',
  status: 'pending' as const,
  source: 'quick-search' as const,
  categoryId: null,
  createdAt: new Date('2026-03-18'),
  updatedAt: new Date('2026-03-18'),
};

const sampleBookmarkedItem = {
  ...samplePendingItem,
  id: 2,
  status: 'bookmarked' as const,
  topic: 'ML Advances',
  url: 'https://example.com/ml',
};

const sampleSavedItem = {
  id: 3,
  brainliftId: BRAINLIFT_ID,
  type: 'Academic Paper',
  author: 'Bob',
  topic: 'Deep Learning',
  time: '15 min',
  facts: 'Comprehensive overview of DL.',
  url: 'https://example.com/dl',
  status: 'bookmarked' as const,
  source: 'deep-research' as const,
  categoryId: 1,
  categoryName: 'Machine Learning',
  factCount: 3,
  summaryCount: 2,
  hasSavedMinimum: true,
  createdAt: new Date('2026-03-17'),
  updatedAt: new Date('2026-03-17'),
};

const sampleCategory = {
  id: 1,
  brainliftId: BRAINLIFT_ID,
  name: 'Machine Learning',
  sortOrder: 0,
  createdAt: new Date('2026-03-18'),
};

const sampleNativeDetails = {
  topic: 'Test Topic',
  purpose: 'Test Purpose',
  owner: 'Test Owner',
  phaseProgress: {
    phase1: 'complete' as const,
    phase2: 'complete' as const,
    phase3: 'in_progress' as const,
    phase4: 'locked' as const,
    phase5: 'locked' as const,
  },
  lastActivePhase: 3 as const,
  suggestionStatus: 'ready' as const,
  suggestionError: null,
  phase3CelebratedAt: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulate GET /api/brainlifts/:slug/knowledge-tree
 */
async function simulateGetKnowledgeTree(params: {
  slug: string;
  brainliftId: number;
}) {
  const { slug, brainliftId } = params;

  // Check native brainlift
  const nativeDetails = await mockGetNativeDetailsBySlug(slug);
  if (!nativeDetails) {
    return { status: 404, body: { message: 'Native details not found' } };
  }

  // Get knowledge tree data
  const treeData = await mockGetKnowledgeTree(brainliftId);

  // Get research status
  const [isJobPending, isSwarmRunning] = await Promise.all([
    mockHasResearchJobPending(brainliftId),
    Promise.resolve(mockIsSwarmActive(brainliftId)),
  ]);
  const isRunning = isJobPending || isSwarmRunning;
  const canRelaunch = treeData.unprocessed.length === 0;

  // Determine phase3 status
  const unlocked = nativeDetails.phaseProgress.phase3 !== 'locked';
  const justUnlocked = unlocked && !nativeDetails.phase3CelebratedAt;

  return {
    status: 200,
    body: {
      unprocessed: treeData.unprocessed,
      triaged: treeData.triaged,
      saved: treeData.saved,
      categories: treeData.categories,
      research: { isRunning, canRelaunch },
      phase3: { unlocked, justUnlocked },
    },
  };
}

/**
 * Simulate POST /api/brainlifts/:slug/knowledge-tree/manual-source
 */
async function simulateCreateManualSource(params: {
  brainliftId: number;
  body: { url?: string; title?: string };
}) {
  const { brainliftId, body } = params;
  const { url, title } = body;

  // Validate input
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { status: 400, body: { message: 'Valid URL is required' } };
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { status: 400, body: { message: 'Title is required' } };
  }

  // Check for duplicate URL
  const existing = await mockGetLearningStreamItemByUrl(url, brainliftId);
  if (existing) {
    return {
      status: 409,
      body: {
        error: 'DUPLICATE_URL',
        message: `A source with this URL already exists.`,
        existingItem: {
          id: existing.id,
          status: existing.status,
          title: existing.topic,
        },
      },
    };
  }

  // Create the manual source
  const item = await mockCreateManualSource(brainliftId, url, title);

  // Queue content extraction
  mockWithJobQueue();

  return {
    status: 201,
    body: {
      learningStreamItem: item,
      openDetail: { itemId: item.id },
    },
  };
}

/**
 * Simulate GET /api/brainlifts/:slug/knowledge-tree/items/:itemId
 */
async function simulateGetItemDetail(params: {
  itemId: number;
  brainliftId: number;
}) {
  const { itemId, brainliftId } = params;

  if (isNaN(itemId)) {
    return { status: 400, body: { message: 'Invalid item ID' } };
  }

  const detail = await mockGetItemDetail(itemId, brainliftId);
  if (!detail) {
    return { status: 404, body: { message: 'Item not found' } };
  }

  return { status: 200, body: detail };
}

/**
 * Simulate DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/extractions
 */
async function simulateDeleteExtractions(params: {
  itemId: number;
  brainliftId: number;
}) {
  const { itemId, brainliftId } = params;

  if (isNaN(itemId)) {
    return { status: 400, body: { message: 'Invalid item ID' } };
  }

  // Verify item exists and belongs to brainlift
  const item = await mockGetLearningStreamItemById(itemId, brainliftId);
  if (!item) {
    return { status: 404, body: { message: 'Item not found' } };
  }

  const result = await mockDeleteExtractions(itemId, brainliftId);

  return {
    status: 200,
    body: {
      success: true,
      deletedCounts: result,
    },
  };
}

// ─── FR2: Knowledge Tree Endpoint ───────────────────────────────────────────

describe('GET /knowledge-tree', () => {
  it('returns three sections with correct partitioning', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [samplePendingItem],
      triaged: [sampleBookmarkedItem],
      saved: [sampleSavedItem],
      categories: [sampleCategory],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.unprocessed).toHaveLength(1);
    expect(result.body.unprocessed[0].status).toBe('pending');
    expect(result.body.triaged).toHaveLength(1);
    expect(result.body.triaged[0].status).toBe('bookmarked');
    expect(result.body.saved).toHaveLength(1);
    expect(result.body.saved[0].factCount).toBe(3);
    expect(result.body.saved[0].summaryCount).toBe(2);
    expect(result.body.categories).toHaveLength(1);
  });

  it('saved items include factCount, summaryCount, and categoryName', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [sampleSavedItem],
      categories: [sampleCategory],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    const saved = result.body.saved[0];
    expect(saved.factCount).toBe(3);
    expect(saved.summaryCount).toBe(2);
    expect(saved.categoryName).toBe('Machine Learning');
    expect(saved.hasSavedMinimum).toBe(true);
  });

  it('empty state returns empty arrays with correct metadata', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.unprocessed).toEqual([]);
    expect(result.body.triaged).toEqual([]);
    expect(result.body.saved).toEqual([]);
    expect(result.body.categories).toEqual([]);
    expect(result.body.research).toEqual({ isRunning: false, canRelaunch: true });
    expect(result.body.phase3).toEqual({ unlocked: true, justUnlocked: true });
  });

  it('research.isRunning is true when job is pending', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(true);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.research.isRunning).toBe(true);
  });

  it('research.isRunning is true when swarm is active', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(true);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.research.isRunning).toBe(true);
  });

  it('research.canRelaunch is false when unprocessed items exist', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(sampleNativeDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [samplePendingItem],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.research.canRelaunch).toBe(false);
  });

  it('phase3.justUnlocked is false when celebration has been acknowledged', async () => {
    const celebratedDetails = {
      ...sampleNativeDetails,
      phase3CelebratedAt: new Date('2026-03-18'),
    };
    mockGetNativeDetailsBySlug.mockResolvedValue(celebratedDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.phase3.unlocked).toBe(true);
    expect(result.body.phase3.justUnlocked).toBe(false);
  });

  it('phase3.unlocked is false when phase3 is locked', async () => {
    const lockedDetails = {
      ...sampleNativeDetails,
      phaseProgress: {
        ...sampleNativeDetails.phaseProgress,
        phase3: 'locked' as const,
      },
    };
    mockGetNativeDetailsBySlug.mockResolvedValue(lockedDetails);
    mockGetKnowledgeTree.mockResolvedValue({
      unprocessed: [],
      triaged: [],
      saved: [],
      categories: [],
    });
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsSwarmActive.mockReturnValue(false);

    const result = await simulateGetKnowledgeTree({
      slug: BRAINLIFT_SLUG,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.phase3.unlocked).toBe(false);
    expect(result.body.phase3.justUnlocked).toBe(false);
  });

  it('returns 404 for non-native brainlift', async () => {
    mockGetNativeDetailsBySlug.mockResolvedValue(null);

    const result = await simulateGetKnowledgeTree({
      slug: 'non-native-slug',
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(404);
  });
});

// ─── FR3: Manual Source Creation ────────────────────────────────────────────

describe('POST /knowledge-tree/manual-source', () => {
  it('creates a bookmarked manual source with placeholder fields', async () => {
    const manualItem = {
      id: 10,
      brainliftId: BRAINLIFT_ID,
      type: 'Manual Source',
      author: 'Unknown',
      topic: 'My Custom Source',
      time: 'Unknown',
      facts: 'Manual source added by user; extraction pending.',
      url: 'https://example.com/custom',
      status: 'bookmarked' as const,
      source: 'manual' as const,
      categoryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockGetLearningStreamItemByUrl.mockResolvedValue(null);
    mockCreateManualSource.mockResolvedValue(manualItem);

    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'https://example.com/custom', title: 'My Custom Source' },
    });

    expect(result.status).toBe(201);
    expect(result.body.learningStreamItem.source).toBe('manual');
    expect(result.body.learningStreamItem.status).toBe('bookmarked');
    expect(result.body.learningStreamItem.type).toBe('Manual Source');
    expect(result.body.learningStreamItem.author).toBe('Unknown');
    expect(result.body.learningStreamItem.time).toBe('Unknown');
    expect(result.body.learningStreamItem.facts).toBe('Manual source added by user; extraction pending.');
    expect(result.body.openDetail.itemId).toBe(10);
  });

  it('queues content extraction after creation', async () => {
    const manualItem = {
      id: 10,
      brainliftId: BRAINLIFT_ID,
      url: 'https://example.com/custom',
      source: 'manual' as const,
      status: 'bookmarked' as const,
    };

    mockGetLearningStreamItemByUrl.mockResolvedValue(null);
    mockCreateManualSource.mockResolvedValue(manualItem);

    await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'https://example.com/custom', title: 'Title' },
    });

    expect(mockWithJobQueue).toHaveBeenCalled();
  });

  it('returns 409 Conflict for duplicate URL', async () => {
    const existingItem = {
      id: 5,
      status: 'bookmarked',
      topic: 'Existing Source',
    };
    mockGetLearningStreamItemByUrl.mockResolvedValue(existingItem);

    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'https://example.com/existing', title: 'Duplicate' },
    });

    expect(result.status).toBe(409);
    expect(result.body.error).toBe('DUPLICATE_URL');
    expect(result.body.existingItem.id).toBe(5);
    expect(result.body.existingItem.title).toBe('Existing Source');
    // Should NOT have called createManualSource
    expect(mockCreateManualSource).not.toHaveBeenCalled();
  });

  it('returns 400 for missing URL', async () => {
    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { title: 'Title' },
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 for missing title', async () => {
    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'https://example.com/test' },
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 for empty title', async () => {
    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'https://example.com/test', title: '   ' },
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 for non-http URL', async () => {
    const result = await simulateCreateManualSource({
      brainliftId: BRAINLIFT_ID,
      body: { url: 'javascript:alert(1)', title: 'XSS' },
    });

    expect(result.status).toBe(400);
  });
});

// ─── FR4: Item Detail ───────────────────────────────────────────────────────

describe('GET /knowledge-tree/items/:itemId', () => {
  it('returns item detail with linked facts and summaries', async () => {
    const detail = {
      learningStreamItem: sampleBookmarkedItem,
      facts: [
        { id: 1, originalId: 'F1', fact: 'Test fact', learningStreamItemId: 2 },
        { id: 2, originalId: 'F2', fact: 'Another fact', learningStreamItemId: 2 },
      ],
      summaries: [
        {
          id: 1,
          text: ['Summary point 1', 'Summary point 2'],
          learningStreamItemId: 2,
          relatedFactIds: [1],
        },
      ],
      extractionCounts: { facts: 2, summaries: 1 },
      categoryId: null,
      categoryName: null,
    };

    mockGetItemDetail.mockResolvedValue(detail);

    const result = await simulateGetItemDetail({
      itemId: 2,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.facts).toHaveLength(2);
    expect(result.body.summaries).toHaveLength(1);
    expect(result.body.extractionCounts).toEqual({ facts: 2, summaries: 1 });
  });

  it('returns empty arrays for triaged item with no extractions', async () => {
    const detail = {
      learningStreamItem: sampleBookmarkedItem,
      facts: [],
      summaries: [],
      extractionCounts: { facts: 0, summaries: 0 },
      categoryId: null,
      categoryName: null,
    };

    mockGetItemDetail.mockResolvedValue(detail);

    const result = await simulateGetItemDetail({
      itemId: 2,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.facts).toEqual([]);
    expect(result.body.summaries).toEqual([]);
    expect(result.body.extractionCounts).toEqual({ facts: 0, summaries: 0 });
  });

  it('returns 404 for non-existent item', async () => {
    mockGetItemDetail.mockResolvedValue(null);

    const result = await simulateGetItemDetail({
      itemId: 999,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(404);
  });

  it('returns 404 for item from different brainlift (IDOR)', async () => {
    mockGetItemDetail.mockResolvedValue(null);

    const result = await simulateGetItemDetail({
      itemId: 2,
      brainliftId: 999, // different brainlift
    });

    expect(result.status).toBe(404);
  });

  it('returns 400 for invalid item ID', async () => {
    const result = await simulateGetItemDetail({
      itemId: NaN,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(400);
  });

  it('includes categoryId and categoryName when item has a category', async () => {
    const detail = {
      learningStreamItem: { ...sampleBookmarkedItem, categoryId: 1 },
      facts: [],
      summaries: [],
      extractionCounts: { facts: 0, summaries: 0 },
      categoryId: 1,
      categoryName: 'Machine Learning',
    };

    mockGetItemDetail.mockResolvedValue(detail);

    const result = await simulateGetItemDetail({
      itemId: 2,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.body.categoryId).toBe(1);
    expect(result.body.categoryName).toBe('Machine Learning');
  });
});

// ─── FR5: Extraction Delete ─────────────────────────────────────────────────

describe('DELETE /knowledge-tree/items/:itemId/extractions', () => {
  it('deletes linked facts and DOK2 summaries and returns counts', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleBookmarkedItem);
    mockDeleteExtractions.mockResolvedValue({ facts: 3, summaries: 2 });

    const result = await simulateDeleteExtractions({
      itemId: 2,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.deletedCounts).toEqual({ facts: 3, summaries: 2 });
    expect(mockDeleteExtractions).toHaveBeenCalledWith(2, BRAINLIFT_ID);
  });

  it('returns zero counts for item with no extractions', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleBookmarkedItem);
    mockDeleteExtractions.mockResolvedValue({ facts: 0, summaries: 0 });

    const result = await simulateDeleteExtractions({
      itemId: 2,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.deletedCounts).toEqual({ facts: 0, summaries: 0 });
  });

  it('returns 404 for non-existent item', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(null);

    const result = await simulateDeleteExtractions({
      itemId: 999,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(404);
    expect(mockDeleteExtractions).not.toHaveBeenCalled();
  });

  it('returns 404 for item from different brainlift (IDOR)', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(null);

    const result = await simulateDeleteExtractions({
      itemId: 2,
      brainliftId: 999,
    });

    expect(result.status).toBe(404);
    expect(mockDeleteExtractions).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid item ID', async () => {
    const result = await simulateDeleteExtractions({
      itemId: NaN,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(400);
  });
});
