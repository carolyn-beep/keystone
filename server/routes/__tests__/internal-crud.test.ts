/**
 * Tests for spec 05: Internal API CRUD Endpoints
 *
 * FR1: PATCH /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId (edit)
 * FR2: DELETE /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId (delete)
 * FR3: POST /api/internal/brainlifts/:slug/dok{1-4} (create)
 * FR4: GET /api/internal/brainlifts/:slug/stale + POST dismiss-stale
 *
 * Unit tests that mock storage, service, and middleware layers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──

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
  mockDbWhere,
  mockDbSelect,
} = vi.hoisted(() => {
  const mockQueueFn = vi.fn().mockResolvedValue(undefined);
  // Chainable mock for db.select().from().where()
  const mockDbWhere = vi.fn().mockResolvedValue([]);
  const mockDbFrom = vi.fn().mockReturnValue({ where: mockDbWhere });
  const mockDbSelect = vi.fn().mockReturnValue({ from: mockDbFrom });
  return {
    mockStorage: {
      getBrainliftBySlug: vi.fn(),
      canAccessBrainlift: vi.fn(),
      canModifyBrainlift: vi.fn(),
      // DOK1
      getFactByIdForBrainlift: vi.fn(),
      editFact: vi.fn(),
      getFactDeleteImpact: vi.fn(),
      deleteFact: vi.fn(),
      createFact: vi.fn(),
      // DOK2
      editDok2Summary: vi.fn(),
      getDok2DeleteImpact: vi.fn(),
      deleteDok2Summary: vi.fn(),
      createDok2Summary: vi.fn(),
      // DOK3
      getDOK3InsightForBrainlift: vi.fn(),
      editDok3Insight: vi.fn(),
      getDok3DeleteImpact: vi.fn(),
      deleteDok3Insight: vi.fn(),
      createDok3Insight: vi.fn(),
      validateMultiSourceLinks: vi.fn(),
      getDOK2Summaries: vi.fn(),
      addLinksToDok3Insight: vi.fn(),
      // DOK4
      getDOK4Spovs: vi.fn(),
      editDok4Spov: vi.fn(),
      getDok4DeleteImpact: vi.fn(),
      deleteDok4Spov: vi.fn(),
      createDok4Spov: vi.fn(),
      getDOK3Insights: vi.fn(),
      addLinksToDok4Spov: vi.fn(),
    },
    mockCreateVersion: vi.fn().mockResolvedValue(undefined),
    mockPruneVersions: vi.fn().mockResolvedValue(undefined),
    mockPropagateStaleFlags: vi.fn().mockResolvedValue({ dok2Count: 0, dok3Count: 0, dok4Count: 0 }),
    mockDismissStaleFlag: vi.fn().mockResolvedValue(undefined),
    mockGetStaleItems: vi.fn(),
    mockRecomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
    mockWithJob: vi.fn(),
    mockQueueFn,
    mockDbWhere,
    mockDbSelect,
  };
});

// Mock storage facade
vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

// Mock version storage
vi.mock('../../storage/versions', () => ({
  createVersion: mockCreateVersion,
  pruneVersions: mockPruneVersions,
}));

// Mock stale storage
vi.mock('../../storage/stale', () => ({
  propagateStaleFlags: mockPropagateStaleFlags,
  dismissStaleFlag: mockDismissStaleFlag,
  getStaleItems: mockGetStaleItems,
}));

// Mock brainlift service
vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: mockRecomputeBrainliftScore,
}));

// Mock withJob
vi.mock('../../utils/withJob', () => ({
  withJob: mockWithJob,
}));

// Mock internal storage (needed by existing handlers in the same file)
vi.mock('../../storage/internal', () => ({
  getBrainliftProgress: vi.fn(),
  getBrainliftScores: vi.fn(),
  getAssessmentDOK1: vi.fn(),
  getAssessmentDOK2: vi.fn(),
  getAssessmentDOK3: vi.fn(),
  getAssessmentDOK4: vi.fn(),
}));

// Mock service layer (needed by existing handlers in the same file)
vi.mock('../../services/internal-grading', () => ({
  processGradeRequest: vi.fn(),
}));

// Mock db for direct queries (link handlers validate DOK2/DOK3 ownership)
vi.mock('../../db', () => ({
  db: {
    select: mockDbSelect,
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) }),
  },
}));

// Mock service auth middleware to pass through with test user
vi.mock('../../middleware/service-auth', () => ({
  requireServiceAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

// Mock asyncHandler to just pass through
vi.mock('../../middleware/error-handler', () => ({
  asyncHandler: (fn: any) => fn,
  BadRequestError: class BadRequestError extends Error {
    statusCode = 400;
    constructor(message: string) { super(message); this.name = 'BadRequestError'; }
  },
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    constructor(message: string) { super(message); this.name = 'NotFoundError'; }
  },
}));

// Mock fs for the template handler (from spec 02, exists in same file)
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('# Template'),
  existsSync: vi.fn().mockReturnValue(true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.canAccessBrainlift.mockImplementation(async (brainlift: any, authContext: any) =>
    brainlift.createdByUserId === authContext.userId
  );
  mockStorage.canModifyBrainlift.mockImplementation(async (brainlift: any, authContext: any) =>
    brainlift.createdByUserId === authContext.userId
  );
  // Setup withJob mock chain
  mockWithJob.mockReturnValue({
    forPayload: vi.fn().mockReturnValue({
      queue: mockQueueFn,
    }),
  });
});

function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    authContext: { userId: 'test-user-1', role: 'user', isAdmin: false },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const testBrainlift = {
  id: 42,
  slug: 'test-bl',
  title: 'Test BL',
  importStatus: 'complete',
  createdByUserId: 'test-user-1',
  createdAt: new Date('2026-01-01'),
};

// ── FR1: PATCH /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId ──

describe('FR1: Internal Edit Endpoint', () => {
  it('edits a DOK1 fact via service auth and returns regrading status', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getFactByIdForBrainlift.mockResolvedValue({ id: 1, fact: 'Old fact' });
    mockStorage.editFact.mockResolvedValue({
      previousText: 'Old fact',
      previousScore: 3,
      previousFeedback: 'Needs work',
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '1' },
      body: { text: 'New fact text' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        dokLevel: 1,
        status: 'regrading',
        previousScore: 3,
      }),
    );
    expect(mockCreateVersion).toHaveBeenCalled();
    expect(mockPropagateStaleFlags).toHaveBeenCalledWith(
      expect.objectContaining({ dokLevel: 1, itemId: 1, brainliftId: 42 }),
    );
    expect(mockWithJob).toHaveBeenCalledWith('dok1:regrade');
  });

  it('allows shared editors to edit a DOK1 fact', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      ...testBrainlift,
      createdByUserId: 'owner-user',
    });
    mockStorage.canModifyBrainlift.mockResolvedValue(true);
    mockStorage.getFactByIdForBrainlift.mockResolvedValue({ id: 1, fact: 'Shared fact' });
    mockStorage.editFact.mockResolvedValue({
      previousText: 'Shared fact',
      previousScore: 4,
      previousFeedback: 'Solid',
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      authContext: { userId: 'shared-editor', role: 'user', isAdmin: false },
      params: { slug: 'test-bl', dokLevel: '1', itemId: '1' },
      body: { text: 'Editor updated fact' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(mockStorage.canModifyBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'test-bl' }),
      expect.objectContaining({ userId: 'shared-editor' }),
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        dokLevel: 1,
        status: 'regrading',
      }),
    );
  });

  it('edits a DOK2 summary with points', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.editDok2Summary.mockResolvedValue({
      previousPoints: ['Old point'],
      previousScore: 4,
      previousFeedback: 'Good',
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '2', itemId: '5' },
      body: { points: ['New point A', 'New point B'] },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 5,
        dokLevel: 2,
        status: 'regrading',
        previousScore: 4,
      }),
    );
    expect(mockWithJob).toHaveBeenCalledWith('dok2:regrade');
  });

  it('edits a DOK3 insight', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getDOK3InsightForBrainlift.mockResolvedValue({ id: 10, text: 'Old insight' });
    mockStorage.editDok3Insight.mockResolvedValue({
      previousText: 'Old insight',
      previousScore: 3.5,
      previousFeedback: 'Decent',
      previousRationale: null,
      previousCriteriaBreakdown: null,
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '3', itemId: '10' },
      body: { text: 'Improved insight' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, dokLevel: 3, status: 'regrading' }),
    );
    expect(mockWithJob).toHaveBeenCalledWith('dok3:regrade');
  });

  it('edits a DOK4 SPOV (no stale propagation)', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getDOK4Spovs.mockResolvedValue([{ id: 20, text: 'Old SPOV' }]);
    mockStorage.editDok4Spov.mockResolvedValue({
      previousText: 'Old SPOV',
      previousScore: 4.0,
      previousFeedback: 'Strong',
      previousRationale: null,
      previousCriteriaBreakdown: null,
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '4', itemId: '20' },
      body: { text: 'Better SPOV' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 20, dokLevel: 4, status: 'regrading' }),
    );
    // DOK4 is terminal -- no stale propagation
    expect(mockPropagateStaleFlags).not.toHaveBeenCalled();
    expect(mockWithJob).toHaveBeenCalledWith('dok4:regrade');
  });

  it('returns 400 for invalid dokLevel', async () => {
    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '5', itemId: '1' },
      body: { text: 'Something' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for non-existent slug', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(undefined);

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'nope', dokLevel: '1', itemId: '1' },
      body: { text: 'Something' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when modify access is denied', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      ...testBrainlift,
      createdByUserId: 'other-user',
    });

    const { internalEditHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '1' },
      body: { text: 'Something' },
    });
    const res = createMockRes();

    await internalEditHandler(req, res);

    expect(mockStorage.canModifyBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'test-bl' }),
      expect.objectContaining({ userId: 'test-user-1' }),
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── FR2: DELETE /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId ──

describe('FR2: Internal Delete Endpoint', () => {
  it('returns impact preview without deleting', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getFactDeleteImpact.mockResolvedValue({
      item: { id: 1, text: 'Fact text', score: 4 },
      impact: { unlinked: 2, markedStale: 1, details: ['DOK2 #5 unlinked'] },
    });

    const { internalDeleteHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '1' },
      query: { preview: 'true' },
    });
    const res = createMockRes();

    await internalDeleteHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: 1 }),
        impact: expect.objectContaining({ unlinked: 2 }),
      }),
    );
    expect(mockStorage.deleteFact).not.toHaveBeenCalled();
  });

  it('executes deletion and returns summary', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.deleteFact.mockResolvedValue({
      deleted: true,
      impact: { unlinked: 1, markedStale: 0 },
    });

    const { internalDeleteHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '1' },
      query: {},
    });
    const res = createMockRes();

    await internalDeleteHandler(req, res);

    expect(mockStorage.deleteFact).toHaveBeenCalledWith(1, 42);
    expect(mockRecomputeBrainliftScore).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ trigger: 'delete', dokLevel: 1, itemId: 1 }),
    );
    expect(res.json).toHaveBeenCalled();
  });

  it('returns 400 for invalid dokLevel', async () => {
    const { internalDeleteHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '0', itemId: '1' },
      query: {},
    });
    const res = createMockRes();

    await internalDeleteHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for non-existent item', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.deleteFact.mockResolvedValue(null);

    const { internalDeleteHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '999' },
      query: {},
    });
    const res = createMockRes();

    await internalDeleteHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── FR3: POST /api/internal/brainlifts/:slug/dok{1-4} ──

describe('FR3: Internal Create Endpoints', () => {
  it('creates a DOK1 fact and queues grading', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.createFact.mockResolvedValue({ id: 100 });

    const { internalCreateDok1Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { fact: 'New fact', source: 'Source A', category: 'Science' },
    });
    const res = createMockRes();

    await internalCreateDok1Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 100, status: 'grading' });
    expect(mockWithJob).toHaveBeenCalledWith('dok1:grade-single');
  });

  it('creates a DOK2 summary with points and queues grading', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getFactByIdForBrainlift.mockResolvedValue({ id: 1 });
    mockStorage.createDok2Summary.mockResolvedValue({ id: 200 });

    const { internalCreateDok2Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: {
        sourceName: 'Source',
        points: ['Point 1', 'Point 2'],
        relatedFactIds: [1],
      },
    });
    const res = createMockRes();

    await internalCreateDok2Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 200, status: 'grading' });
    expect(mockWithJob).toHaveBeenCalledWith('dok2:grade-single');
  });

  it('creates a DOK3 insight and validates multi-source', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.validateMultiSourceLinks.mockResolvedValue({ valid: true });
    mockStorage.getDOK2Summaries.mockResolvedValue([
      { id: 10 }, { id: 11 },
    ]);
    mockStorage.createDok3Insight.mockResolvedValue({ id: 300 });

    const { internalCreateDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { text: 'New insight', linkedDok2Ids: [10, 11] },
    });
    const res = createMockRes();

    await internalCreateDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 300, status: 'grading' });
    expect(mockWithJob).toHaveBeenCalledWith('dok3:grade');
  });

  it('creates a DOK4 SPOV and validates DOK3 IDs are graded', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getDOK3Insights.mockResolvedValue([
      { id: 50, status: 'graded' },
      { id: 51, status: 'graded' },
    ]);
    mockStorage.createDok4Spov.mockResolvedValue({ id: 400 });

    const { internalCreateDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { text: 'New SPOV', linkedDok3Ids: [50, 51], primaryDok3Id: 50 },
    });
    const res = createMockRes();

    await internalCreateDok4Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 400, status: 'grading' });
    expect(mockWithJob).toHaveBeenCalledWith('dok4:grade');
  });

  it('returns 400 for missing required fields on DOK1 create', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);

    const { internalCreateDok1Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { fact: 'A fact' }, // missing source
    });
    const res = createMockRes();

    await internalCreateDok1Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for DOK3 create with invalid multi-source', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.validateMultiSourceLinks.mockResolvedValue({
      valid: false,
      error: 'DOK2 IDs must come from at least 2 different sources',
    });

    const { internalCreateDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { text: 'Insight', linkedDok2Ids: [10, 11] },
    });
    const res = createMockRes();

    await internalCreateDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for DOK4 create with ungraded DOK3', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockStorage.getDOK3Insights.mockResolvedValue([
      { id: 50, status: 'pending_linking' },
    ]);

    const { internalCreateDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl' },
      body: { text: 'SPOV', linkedDok3Ids: [50], primaryDok3Id: 50 },
    });
    const res = createMockRes();

    await internalCreateDok4Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── FR4: Stale Management ──

describe('FR4: Stale Management Endpoints', () => {
  it('returns stale items grouped by DOK level', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockGetStaleItems.mockResolvedValue({
      dok1: [1, 3],
      dok2: [5],
      dok3: [],
      dok4: [20],
    });

    const { internalGetStaleHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'test-bl' } });
    const res = createMockRes();

    await internalGetStaleHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      dok1: [1, 3],
      dok2: [5],
      dok3: [],
      dok4: [20],
    });
  });

  it('allows shared viewers to read stale items', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      ...testBrainlift,
      createdByUserId: 'owner-user',
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockGetStaleItems.mockResolvedValue({
      dok1: [],
      dok2: [5],
      dok3: [],
      dok4: [],
    });

    const { internalGetStaleHandler } = await import('../internal');
    const req = createMockReq({
      authContext: { userId: 'shared-viewer', role: 'user', isAdmin: false },
      params: { slug: 'test-bl' },
    });
    const res = createMockRes();

    await internalGetStaleHandler(req, res);

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'test-bl' }),
      expect.objectContaining({ userId: 'shared-viewer' }),
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      dok1: [],
      dok2: [5],
      dok3: [],
      dok4: [],
    });
  });

  it('dismisses stale flag on a specific item', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);

    const { internalDismissStaleHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '2', itemId: '5' },
    });
    const res = createMockRes();

    await internalDismissStaleHandler(req, res);

    expect(mockDismissStaleFlag).toHaveBeenCalledWith(2, 5, 42);
    expect(res.json).toHaveBeenCalledWith({ dismissed: true });
  });

  it('dismiss on non-stale item returns success (idempotent)', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);

    const { internalDismissStaleHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', dokLevel: '1', itemId: '99' },
    });
    const res = createMockRes();

    await internalDismissStaleHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({ dismissed: true });
  });
});

// ── FR5: Link Endpoints ──

describe('FR5: Link DOK3 Endpoint', () => {
  it('links DOK2s to DOK3 insight and triggers regrade', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    mockStorage.addLinksToDok3Insight.mockResolvedValue({
      addedCount: 2,
      existingItem: { id: 5, text: 'Insight text', score: 3, status: 'graded' },
    });

    const { internalLinkDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', insightId: '5' },
      body: { dok2Ids: [10, 11] },
    });
    const res = createMockRes();

    await internalLinkDok3Handler(req, res);

    expect(mockStorage.addLinksToDok3Insight).toHaveBeenCalledWith({
      insightId: 5,
      brainliftId: 42,
      dok2Ids: [10, 11],
    });
    expect(mockCreateVersion).toHaveBeenCalled();
    expect(mockWithJob).toHaveBeenCalledWith('dok3:regrade');
    expect(res.json).toHaveBeenCalledWith({
      id: 5,
      addedLinks: 2,
      status: 'regrading',
    });
  });

  it('returns 400 for empty dok2Ids', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);

    const { internalLinkDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', insightId: '5' },
      body: { dok2Ids: [] },
    });
    const res = createMockRes();

    await internalLinkDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid DOK2 IDs not in brainlift', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 10 }]); // Only 10 found, 99 missing

    const { internalLinkDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', insightId: '5' },
      body: { dok2Ids: [10, 99] },
    });
    const res = createMockRes();

    await internalLinkDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('99') }),
    );
  });

  it('returns 404 for non-existent insight', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 10 }]);
    mockStorage.addLinksToDok3Insight.mockResolvedValue(null);

    const { internalLinkDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', insightId: '999' },
      body: { dok2Ids: [10] },
    });
    const res = createMockRes();

    await internalLinkDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for non-existent brainlift', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(undefined);

    const { internalLinkDok3Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'nope', insightId: '5' },
      body: { dok2Ids: [10] },
    });
    const res = createMockRes();

    await internalLinkDok3Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('FR5: Link DOK4 Endpoint', () => {
  it('links DOK3s to DOK4 SPOV and triggers regrade', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 20 }, { id: 21 }]);
    mockStorage.addLinksToDok4Spov.mockResolvedValue({
      addedCount: 2,
      existingItem: { id: 7, text: 'SPOV text', score: 4, status: 'graded' },
    });

    const { internalLinkDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', spovId: '7' },
      body: { dok3Ids: [20, 21] },
    });
    const res = createMockRes();

    await internalLinkDok4Handler(req, res);

    expect(mockStorage.addLinksToDok4Spov).toHaveBeenCalledWith({
      spovId: 7,
      brainliftId: 42,
      dok3Ids: [20, 21],
      newPrimaryDok3Id: undefined,
    });
    expect(mockCreateVersion).toHaveBeenCalled();
    expect(mockWithJob).toHaveBeenCalledWith('dok4:regrade');
    expect(res.json).toHaveBeenCalledWith({
      id: 7,
      addedLinks: 2,
      status: 'regrading',
    });
  });

  it('passes newPrimaryDok3Id when provided', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 20 }]);
    mockStorage.addLinksToDok4Spov.mockResolvedValue({
      addedCount: 1,
      existingItem: { id: 7, text: 'SPOV', score: 4, status: 'graded' },
    });

    const { internalLinkDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', spovId: '7' },
      body: { dok3Ids: [20], newPrimaryDok3Id: 20 },
    });
    const res = createMockRes();

    await internalLinkDok4Handler(req, res);

    expect(mockStorage.addLinksToDok4Spov).toHaveBeenCalledWith(
      expect.objectContaining({ newPrimaryDok3Id: 20 }),
    );
  });

  it('returns 400 for empty dok3Ids', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);

    const { internalLinkDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', spovId: '7' },
      body: { dok3Ids: [] },
    });
    const res = createMockRes();

    await internalLinkDok4Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for non-existent SPOV', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(testBrainlift);
    mockDbWhere.mockResolvedValue([{ id: 20 }]);
    mockStorage.addLinksToDok4Spov.mockResolvedValue(null);

    const { internalLinkDok4Handler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'test-bl', spovId: '999' },
      body: { dok3Ids: [20] },
    });
    const res = createMockRes();

    await internalLinkDok4Handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
