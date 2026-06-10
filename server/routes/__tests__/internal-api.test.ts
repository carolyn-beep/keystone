/**
 * Tests for spec 03: Internal API Endpoints (Grade + Assessment)
 *
 * FR1: POST /api/internal/grade
 * FR2: GET /api/internal/brainlifts
 * FR3: GET /api/internal/brainlifts/:slug/status
 * FR4: GET /api/internal/brainlifts/:slug/assessment
 *
 * Unit tests that mock storage, service, and middleware layers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ──

const { mockProcessGradeRequest, mockStorage } = vi.hoisted(() => ({
  mockProcessGradeRequest: vi.fn(),
  mockStorage: {
    getBrainliftBySlug: vi.fn(),
    getBrainliftRecordBySlug: vi.fn(),
    getBrainliftDetailById: vi.fn(),
    getBrainliftsForUserPaginated: vi.fn(),
    canAccessBrainlift: vi.fn(),
    canModifyBrainlift: vi.fn(),
    getExpertsByBrainliftId: vi.fn(),
    createExpertsForBrainlift: vi.fn(),
    deleteExpertForBrainlift: vi.fn(),
  },
}));

const { mockGetBrainliftProgress, mockGetBrainliftScores, mockGetAssessmentDOK1, mockGetAssessmentDOK2, mockGetAssessmentDOK3, mockGetAssessmentDOK4 } = vi.hoisted(() => ({
  mockGetBrainliftProgress: vi.fn(),
  mockGetBrainliftScores: vi.fn(),
  mockGetAssessmentDOK1: vi.fn(),
  mockGetAssessmentDOK2: vi.fn(),
  mockGetAssessmentDOK3: vi.fn(),
  mockGetAssessmentDOK4: vi.fn(),
}));

const { mockWithJob, mockForPayload, mockWithOptions, mockQueue } = vi.hoisted(() => {
  const mockQueue = vi.fn().mockResolvedValue('job-1');
  const mockWithOptions = vi.fn().mockReturnValue({ queue: mockQueue });
  const mockForPayload = vi.fn().mockReturnValue({
    queue: mockQueue,
    withOptions: mockWithOptions,
  });
  return {
    mockWithJob: vi.fn().mockReturnValue({ forPayload: mockForPayload }),
    mockForPayload,
    mockWithOptions,
    mockQueue,
  };
});

// Mock storage facade
vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

// Mock internal storage
vi.mock('../../storage/internal', () => ({
  getBrainliftProgress: mockGetBrainliftProgress,
  getBrainliftScores: mockGetBrainliftScores,
  getAssessmentDOK1: mockGetAssessmentDOK1,
  getAssessmentDOK2: mockGetAssessmentDOK2,
  getAssessmentDOK3: mockGetAssessmentDOK3,
  getAssessmentDOK4: mockGetAssessmentDOK4,
}));

vi.mock('../../storage/versions', () => ({
  createVersion: vi.fn().mockResolvedValue(undefined),
  pruneVersions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../storage/stale', () => ({
  propagateStaleFlags: vi.fn().mockResolvedValue({ dok2Count: 0, dok3Count: 0, dok4Count: 0 }),
  dismissStaleFlag: vi.fn().mockResolvedValue(undefined),
  getStaleItems: vi.fn().mockResolvedValue([]),
}));

// Mock service layer
vi.mock('../../services/internal-grading', () => ({
  processGradeRequest: mockProcessGradeRequest,
}));

vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/withJob', () => ({
  withJob: mockWithJob,
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
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

// Mock fs for the template handler (from spec 02)
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
  mockWithJob.mockReturnValue({ forPayload: mockForPayload });
  mockForPayload.mockReturnValue({
    queue: mockQueue,
    withOptions: mockWithOptions,
  });
  mockWithOptions.mockReturnValue({ queue: mockQueue });
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
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

async function runInternalRoute(method: string, path: string, reqOverrides: Record<string, any> = {}) {
  const { internalRouter } = await import('../internal');
  const layer = (internalRouter as any).stack.find((candidate: any) =>
    candidate.route?.path === path && candidate.route?.methods?.[method],
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const req = createMockReq(reqOverrides);
  const res = createMockRes();
  const stack = layer.route.stack.map((entry: any) => entry.handle);

  let index = 0;
  const pending: Promise<unknown>[] = [];
  const next = vi.fn(() => {
    index += 1;
    const handler = stack[index];
    if (handler) {
      const result = Promise.resolve(handler(req, res, next));
      pending.push(result);
      return result;
    }
  });

  await stack[0](req, res, next);
  while (pending.length > 0) {
    await pending.shift();
  }

  return { req, res, next };
}

function createBrainliftDetailAggregate(overrides: Record<string, any> = {}) {
  return {
    brainlift: {
      id: 42,
      slug: 'canonical-bl',
      title: 'Canonical Brainlift',
      description: 'Fallback purpose',
      displayPurpose: 'Display purpose',
      author: 'Ada',
      createdAt: new Date('2026-01-03T04:05:06.000Z'),
      createdByUserId: 'test-user-1',
      classification: 'brainlift',
      summary: { totalFacts: 2, meanScore: '4', score5Count: 1, contradictionCount: 0 },
      originalContent: 'must not leak',
    },
    experts: [
      {
        id: 7,
        name: 'Expert One',
        who: 'Researcher',
        focus: 'Canonical APIs',
        why: 'Relevant',
        where: '@expert',
        rankScore: 9,
        rationale: 'Strong source',
        twitterHandle: '@expert',
      },
    ],
    dok1: [
      {
        id: 1,
        originalId: '1.1',
        fact: 'DOK1 fact',
        category: 'Evidence',
        source: 'Source A',
        score: 5,
        note: 'Strong',
        gradingStatus: 'graded',
      },
    ],
    dok2: [
      {
        id: 2,
        sourceName: 'Source A',
        sourceUrl: 'https://example.com/a',
        displayTitle: 'Source synthesis',
        category: 'Evidence',
        points: [
          { id: 21, text: 'Point one', sortOrder: 0 },
          { id: 22, text: 'Point two', sortOrder: 1 },
        ],
        relatedFactIds: [1],
        grade: 4,
        feedback: 'Useful synthesis',
        gradingStatus: 'graded',
      },
      {
        id: 3,
        sourceName: 'Ungraded Source',
        sourceUrl: null,
        displayTitle: null,
        category: null,
        points: [{ id: 23, text: 'Ungraded point', sortOrder: 0 }],
        relatedFactIds: [],
        grade: null,
        feedback: null,
        gradingStatus: null,
      },
    ],
    dok3: [
      {
        id: 4,
        text: 'Linked insight',
        status: 'linked',
        frameworkName: 'Framework',
        frameworkDescription: 'Framework description',
        score: 4,
        rationale: 'Good',
        feedback: 'Improve evidence',
        criteriaBreakdown: { C1: { assessment: 'strong' } },
        linkedDok2SummaryIds: [2],
      },
      {
        id: 5,
        text: 'Scratchpadded insight',
        status: 'scratchpadded',
        frameworkName: null,
        frameworkDescription: null,
        score: null,
        rationale: null,
        feedback: null,
        criteriaBreakdown: null,
        linkedDok2SummaryIds: [],
      },
    ],
    dok4: [
      {
        id: 6,
        text: 'Rejected SPOV',
        status: 'rejected',
        score: null,
        rationale: null,
        feedback: null,
        criteriaBreakdown: null,
        rejectionReason: 'Not spiky',
        rejectionCategory: 'not_spiky',
        linkedDok3InsightIds: [4],
        primaryDok3InsightId: 4,
        positionSummary: null,
      },
      {
        id: 8,
        text: 'Pending SPOV',
        status: 'pending_linking',
        score: null,
        rationale: null,
        feedback: null,
        criteriaBreakdown: null,
        rejectionReason: null,
        rejectionCategory: null,
        linkedDok3InsightIds: [],
        primaryDok3InsightId: null,
        positionSummary: null,
      },
    ],
    ...overrides,
  };
}

// ── FR1: POST /api/internal/grade ──

describe('FR1: POST /api/internal/grade', () => {
  it('returns 201 with slug for valid markdown', async () => {
    mockProcessGradeRequest.mockResolvedValue({
      slug: 'test-brainlift',
      brainliftId: 42,
    });

    const { gradeHandler } = await import('../internal');
    const req = createMockReq({
      body: { markdown: '# My Brainlift\n\n## DOK 1\n- Fact 1' },
    });
    const res = createMockRes();

    await gradeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'test-brainlift',
        brainliftId: 42,
        status: 'grading',
        retryAfter: 30,
      }),
    );
    expect(mockProcessGradeRequest).toHaveBeenCalledWith(
      '# My Brainlift\n\n## DOK 1\n- Fact 1',
      undefined,
      'test-user-1',
    );
  });

  it('passes optional title to processGradeRequest', async () => {
    mockProcessGradeRequest.mockResolvedValue({
      slug: 'custom-title',
      brainliftId: 43,
    });

    const { gradeHandler } = await import('../internal');
    const req = createMockReq({
      body: { markdown: '# Content', title: 'Custom Title' },
    });
    const res = createMockRes();

    await gradeHandler(req, res);

    expect(mockProcessGradeRequest).toHaveBeenCalledWith(
      '# Content',
      'Custom Title',
      'test-user-1',
    );
  });

  it('returns 400 for empty markdown', async () => {
    const { gradeHandler } = await import('../internal');
    const req = createMockReq({ body: { markdown: '' } });
    const res = createMockRes();

    await gradeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('returns 400 for missing markdown', async () => {
    const { gradeHandler } = await import('../internal');
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await gradeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when processGradeRequest throws BadRequestError', async () => {
    const { BadRequestError } = await import('../../middleware/error-handler');
    mockProcessGradeRequest.mockRejectedValue(new BadRequestError('No facts extracted'));

    const { gradeHandler } = await import('../internal');
    const req = createMockReq({
      body: { markdown: '# Empty content with no facts' },
    });
    const res = createMockRes();

    await gradeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'No facts extracted' }),
    );
  });
});

// ── FR2: GET /api/internal/brainlifts ──

describe('FR2: GET /api/internal/brainlifts', () => {
  it('returns paginated list of brainlifts', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [
        {
          id: 1, slug: 'bl-1', title: 'BL 1', importStatus: 'complete',
          summary: { meanScore: '4.2' }, createdAt: new Date('2026-01-01'),
        },
      ],
      total: 1,
    });

    const { listBrainliftsHandler } = await import('../internal');
    const req = createMockReq({ query: { page: '1', pageSize: '10' } });
    const res = createMockRes();

    await listBrainliftsHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        brainlifts: expect.arrayContaining([
          expect.objectContaining({ slug: 'bl-1', title: 'BL 1' }),
        ]),
        pagination: expect.objectContaining({
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
        }),
      }),
    );
  });

  it('includes shared brainlifts for shared editors', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [
        {
          id: 2,
          slug: 'shared-bl',
          title: 'Shared BL',
          importStatus: 'complete',
          summary: null,
          createdAt: new Date('2026-01-02'),
          createdByUserId: 'owner-user',
        },
      ],
      total: 1,
    });

    const { listBrainliftsHandler } = await import('../internal');
    const req = createMockReq({
      authContext: { userId: 'shared-editor', role: 'user', isAdmin: false },
      query: { page: '1', pageSize: '10' },
    });
    const res = createMockRes();

    await listBrainliftsHandler(req, res);

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'shared-editor' }),
      0,
      10,
      'all',
      { search: undefined },
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        brainlifts: expect.arrayContaining([
          expect.objectContaining({ slug: 'shared-bl', title: 'Shared BL' }),
        ]),
      }),
    );
  });

  it('caps pageSize at 20', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [],
      total: 0,
    });

    const { listBrainliftsHandler } = await import('../internal');
    const req = createMockReq({ query: { page: '1', pageSize: '100' } });
    const res = createMockRes();

    await listBrainliftsHandler(req, res);

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      expect.anything(),
      0,  // offset
      20, // capped pageSize
      'all',
      { search: undefined },
    );
  });

  it('defaults to page 1 and pageSize 10', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [],
      total: 0,
    });

    const { listBrainliftsHandler } = await import('../internal');
    const req = createMockReq({ query: {} });
    const res = createMockRes();

    await listBrainliftsHandler(req, res);

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      expect.anything(),
      0,  // offset = (1-1) * 10
      10, // default pageSize
      'all',
      { search: undefined },
    );
  });
});

describe('03-service-key-scopes route enforcement', () => {
  it('allows wildcard service keys to call both BrainLift read routes', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({ brainlifts: [], total: 0 });
    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const list = await runInternalRoute('get', '/api/internal/brainlifts', {
      serviceAuth: { apiKeyId: 1, apiKeyName: 'wildcard', scopes: ['*'] },
      query: {},
    });
    const detail = await runInternalRoute('get', '/api/internal/brainlifts/:slug', {
      serviceAuth: { apiKeyId: 1, apiKeyName: 'wildcard', scopes: ['*'] },
      params: { slug: 'canonical-bl' },
      query: {},
    });

    expect(list.res.status).not.toHaveBeenCalledWith(403);
    expect(list.res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.any(Object) }));
    expect(detail.res.status).not.toHaveBeenCalledWith(403);
    expect(detail.res.json).toHaveBeenCalledWith(expect.objectContaining({ slug: 'canonical-bl' }));
  });

  it('requires brainlifts:list for GET /api/internal/brainlifts', async () => {
    const denied = await runInternalRoute('get', '/api/internal/brainlifts', {
      serviceAuth: { apiKeyId: 2, apiKeyName: 'read-only', scopes: ['brainlifts:read'] },
      query: {},
    });

    expect(denied.res.status).toHaveBeenCalledWith(403);
    expect(denied.res.json).toHaveBeenCalledWith({ error: 'Insufficient service key scope' });

    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({ brainlifts: [], total: 0 });
    const allowed = await runInternalRoute('get', '/api/internal/brainlifts', {
      serviceAuth: { apiKeyId: 3, apiKeyName: 'list-only', scopes: ['brainlifts:list'] },
      query: {},
    });

    expect(allowed.res.status).not.toHaveBeenCalledWith(403);
    expect(allowed.res.json).toHaveBeenCalledWith(expect.objectContaining({ pagination: expect.any(Object) }));
  });

  it('requires brainlifts:read for GET /api/internal/brainlifts/:slug', async () => {
    const denied = await runInternalRoute('get', '/api/internal/brainlifts/:slug', {
      serviceAuth: { apiKeyId: 4, apiKeyName: 'list-only', scopes: ['brainlifts:list'] },
      params: { slug: 'canonical-bl' },
      query: {},
    });

    expect(denied.res.status).toHaveBeenCalledWith(403);
    expect(denied.res.json).toHaveBeenCalledWith({ error: 'Insufficient service key scope' });

    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);
    const allowed = await runInternalRoute('get', '/api/internal/brainlifts/:slug', {
      serviceAuth: { apiKeyId: 5, apiKeyName: 'reader', scopes: ['brainlifts:read'] },
      params: { slug: 'canonical-bl' },
      query: {},
    });

    expect(allowed.res.status).not.toHaveBeenCalledWith(403);
    expect(allowed.res.json).toHaveBeenCalledWith(expect.objectContaining({ slug: 'canonical-bl' }));
  });
});

describe('02-canonical-detail-endpoint service', () => {
  it('returns the owned BrainLift canonical detail without grading by default', async () => {
    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { getInternalBrainliftDetailForAuthContext } = await import('../../services/brainlift-read-contract');
    const response = await getInternalBrainliftDetailForAuthContext(
      { userId: 'test-user-1', role: 'user', isAdmin: false },
      'canonical-bl',
      { includeGrading: false },
    );

    expect(mockStorage.getBrainliftRecordBySlug).toHaveBeenCalledWith('canonical-bl');
    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'canonical-bl' }),
      expect.objectContaining({ userId: 'test-user-1' }),
    );
    expect(mockStorage.getBrainliftDetailById).toHaveBeenCalledWith(42);
    expect(Object.keys(response).sort()).toEqual([
      'author',
      'createdAt',
      'dok1',
      'dok2',
      'dok3',
      'dok4',
      'experts',
      'id',
      'purpose',
      'slug',
      'title',
    ].sort());
    expect(response).toMatchObject({
      id: 42,
      slug: 'canonical-bl',
      title: 'Canonical Brainlift',
      purpose: 'Display purpose',
      author: 'Ada',
      createdAt: '2026-01-03T04:05:06.000Z',
      experts: [
        {
          id: 7,
          name: 'Expert One',
          who: 'Researcher',
          focus: 'Canonical APIs',
          why: 'Relevant',
          where: '@expert',
          rankScore: 9,
          rationale: 'Strong source',
          twitterHandle: '@expert',
        },
      ],
      dok1: [
        {
          id: 1,
          originalId: '1.1',
          text: 'DOK1 fact',
          category: 'Evidence',
          source: 'Source A',
          note: 'Strong',
        },
      ],
      dok2: expect.arrayContaining([
        expect.objectContaining({
          id: 2,
          sourceName: 'Source A',
          linkedDok1Ids: [1],
          points: [
            { id: 21, text: 'Point one', sortOrder: 0 },
            { id: 22, text: 'Point two', sortOrder: 1 },
          ],
        }),
      ]),
      dok3: [
        expect.objectContaining({
          id: 4,
          text: 'Linked insight',
          status: 'linked',
          linkedDok2Ids: [2],
        }),
        expect.objectContaining({
          id: 5,
          text: 'Scratchpadded insight',
          status: 'scratchpadded',
          linkedDok2Ids: [],
        }),
      ],
      dok4: [
        expect.objectContaining({
          id: 6,
          text: 'Rejected SPOV',
          status: 'rejected',
          linkedDok3Ids: [4],
          primaryDok3Id: 4,
        }),
        expect.objectContaining({
          id: 8,
          text: 'Pending SPOV',
          status: 'pending_linking',
        }),
      ],
    });
    expect(response).not.toHaveProperty('originalContent');
    expect(response).not.toHaveProperty('classification');
    expect(response).not.toHaveProperty('summary');
    expect(response.dok1[0]).not.toHaveProperty('grading');
    expect(response.dok2[0]).not.toHaveProperty('grading');
    expect(response.dok3[0]).not.toHaveProperty('grading');
    expect(response.dok4[0]).not.toHaveProperty('grading');
  });

  it('allows shared readers when canAccessBrainlift returns true', async () => {
    const aggregate = createBrainliftDetailAggregate({
      brainlift: {
        ...createBrainliftDetailAggregate().brainlift,
        createdByUserId: 'owner-user',
      },
    });
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { getInternalBrainliftDetailForAuthContext } = await import('../../services/brainlift-read-contract');
    const response = await getInternalBrainliftDetailForAuthContext(
      { userId: 'shared-viewer', role: 'user', isAdmin: false },
      'canonical-bl',
      { includeGrading: false },
    );

    expect(response.slug).toBe('canonical-bl');
    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ createdByUserId: 'owner-user' }),
      expect.objectContaining({ userId: 'shared-viewer' }),
    );
  });

  it('falls back to description for purpose and maps stable text/link names', async () => {
    const aggregate = createBrainliftDetailAggregate({
      brainlift: {
        ...createBrainliftDetailAggregate().brainlift,
        displayPurpose: null,
        description: 'Description purpose',
      },
    });
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { getInternalBrainliftDetailForAuthContext } = await import('../../services/brainlift-read-contract');
    const response = await getInternalBrainliftDetailForAuthContext(
      { userId: 'test-user-1', role: 'user', isAdmin: false },
      'canonical-bl',
      { includeGrading: false },
    );

    expect(response.purpose).toBe('Description purpose');
    expect(response.dok1[0]).toHaveProperty('text', 'DOK1 fact');
    expect(response.dok1[0]).not.toHaveProperty('fact');
    expect(response.dok2[0]).toHaveProperty('linkedDok1Ids', [1]);
    expect(response.dok2[0]).not.toHaveProperty('relatedFactIds');
    expect(response.dok3[0]).toHaveProperty('linkedDok2Ids', [2]);
    expect(response.dok3[0]).not.toHaveProperty('linkedDok2SummaryIds');
    expect(response.dok4[0]).toHaveProperty('linkedDok3Ids', [4]);
    expect(response.dok4[0]).not.toHaveProperty('linkedDok3InsightIds');
  });

  it('throws not found for unknown and unauthorized slugs', async () => {
    const { getInternalBrainliftDetailForAuthContext } = await import('../../services/brainlift-read-contract');

    mockStorage.getBrainliftRecordBySlug.mockResolvedValueOnce(undefined);
    await expect(getInternalBrainliftDetailForAuthContext(
      { userId: 'test-user-1', role: 'user', isAdmin: false },
      'missing',
      { includeGrading: false },
    )).rejects.toMatchObject({ statusCode: 404 });

    const aggregate = createBrainliftDetailAggregate({
      brainlift: {
        ...createBrainliftDetailAggregate().brainlift,
        createdByUserId: 'other-user',
      },
    });
    mockStorage.getBrainliftRecordBySlug.mockResolvedValueOnce(aggregate.brainlift);
    mockStorage.canAccessBrainlift.mockResolvedValueOnce(false);

    await expect(getInternalBrainliftDetailForAuthContext(
      { userId: 'test-user-1', role: 'user', isAdmin: false },
      'other',
      { includeGrading: false },
    )).rejects.toMatchObject({ statusCode: 404 });
    expect(mockStorage.getBrainliftDetailById).not.toHaveBeenCalledWith(42);
  });

  it('includes nested grading only when requested and preserves content statuses top-level', async () => {
    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { getInternalBrainliftDetailForAuthContext } = await import('../../services/brainlift-read-contract');
    const response = await getInternalBrainliftDetailForAuthContext(
      { userId: 'test-user-1', role: 'user', isAdmin: false },
      'canonical-bl',
      { includeGrading: true },
    );

    expect(response.dok1[0].grading).toEqual({ score: 5, status: 'graded' });
    expect(response.dok2[0].grading).toEqual({ grade: 4, feedback: 'Useful synthesis', status: 'graded' });
    expect(response.dok2[1].grading).toBeNull();
    expect(response.dok3[0]).toMatchObject({
      status: 'linked',
      grading: {
        score: 4,
        rationale: 'Good',
        feedback: 'Improve evidence',
        criteriaBreakdown: { C1: { assessment: 'strong' } },
      },
    });
    expect(response.dok3[1]).toMatchObject({ status: 'scratchpadded', grading: null });
    expect(response.dok4[0]).toMatchObject({
      status: 'rejected',
      grading: {
        score: null,
        rationale: null,
        feedback: null,
        criteriaBreakdown: null,
        rejectionReason: 'Not spiky',
        rejectionCategory: 'not_spiky',
      },
    });
    expect(response.dok4[1]).toMatchObject({ status: 'pending_linking', grading: null });
    expect(response.dok1[0]).not.toHaveProperty('score');
    expect(response.dok2[0]).not.toHaveProperty('grade');
    expect(response.dok3[0]).not.toHaveProperty('score');
    expect(response.dok4[0]).not.toHaveProperty('rejectionReason');
  });
});

describe('02-canonical-detail-endpoint route', () => {
  it('returns 200 from GET /api/internal/brainlifts/:slug', async () => {
    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { internalBrainliftDetailHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'canonical-bl' } });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'canonical-bl',
      dok3: expect.arrayContaining([
        expect.objectContaining({ status: 'scratchpadded' }),
      ]),
      dok4: expect.arrayContaining([
        expect.objectContaining({ status: 'rejected' }),
        expect.objectContaining({ status: 'pending_linking' }),
      ]),
    }));
  });

  it('returns 404 for missing or unauthorized BrainLifts', async () => {
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(undefined);

    const { internalBrainliftDetailHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'missing' } });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Brainlift not found' });
  });

  it('parses include=grading and comma-separated include values', async () => {
    const aggregate = createBrainliftDetailAggregate();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(aggregate.brainlift);
    mockStorage.getBrainliftDetailById.mockResolvedValue(aggregate);

    const { internalBrainliftDetailHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'canonical-bl' },
      query: { include: ' grading, ' },
    });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    const response = res.json.mock.calls[0][0];
    expect(response.dok1[0]).toHaveProperty('grading');
    expect(response.dok2[0]).toHaveProperty('grading');
    expect(response.dok3[0]).toHaveProperty('grading');
    expect(response.dok4[0]).toHaveProperty('grading');
  });

  it('returns 400 for unknown include values', async () => {
    const { internalBrainliftDetailHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'canonical-bl' },
      query: { include: 'grading,unknownvalue' },
    });
    const res = createMockRes();

    await internalBrainliftDetailHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unknown include value: unknownvalue' });
    expect(mockStorage.getBrainliftRecordBySlug).not.toHaveBeenCalled();
  });
});

// ── FR3: GET /api/internal/brainlifts/:slug/status ──

describe('FR3: GET /api/internal/brainlifts/:slug/status', () => {
  it('returns status with progress counts for owned brainlift', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'test-bl',
      title: 'Test BL',
      importStatus: 'complete',
      createdByUserId: 'test-user-1',
      summary: { meanScore: '4.0' },
      createdAt: new Date('2026-01-01'),
    });
    mockGetBrainliftProgress.mockResolvedValue({
      dok1: { total: 10, graded: 10, pending: 0, error: 0 },
      dok2: { total: 3, graded: 3, pending: 0, error: 0 },
      dok3: { total: 2, graded: 2, pending: 0, error: 0 },
      dok4: { total: 1, graded: 1, pending: 0, error: 0 },
    });
    mockGetBrainliftScores.mockResolvedValue({
      overall: 4.0,
      dok1Mean: 4.2,
      dok2Mean: 3.8,
      dok3Mean: 4.0,
      dok4Mean: 4.1,
    });

    const { statusHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'test-bl' } });
    const res = createMockRes();

    await statusHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'test-bl',
        title: 'Test BL',
        status: 'complete',
        progress: expect.objectContaining({
          dok1: { total: 10, graded: 10, pending: 0, error: 0 },
        }),
        retryAfter: 0,
      }),
    );
  });

  it('returns 404 for unknown slug', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(undefined);

    const { statusHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'nonexistent' } });
    const res = createMockRes();

    await statusHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 when read access is denied (IDOR prevention)', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'other-bl',
      title: 'Other BL',
      createdByUserId: 'other-user',
      importStatus: 'complete',
    });

    const { statusHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'other-bl' } });
    const res = createMockRes();

    await statusHandler(req, res);

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'other-bl' }),
      expect.objectContaining({ userId: 'test-user-1' }),
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns retryAfter=15 when grading is in progress', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'grading-bl',
      title: 'Grading BL',
      importStatus: 'complete',
      createdByUserId: 'test-user-1',
      summary: { meanScore: '0' },
      createdAt: new Date('2026-01-01'),
    });
    mockGetBrainliftProgress.mockResolvedValue({
      dok1: { total: 10, graded: 5, pending: 5, error: 0 },
      dok2: { total: 3, graded: 0, pending: 3, error: 0 },
      dok3: { total: 0, graded: 0, pending: 0, error: 0 },
      dok4: { total: 0, graded: 0, pending: 0, error: 0 },
    });
    mockGetBrainliftScores.mockResolvedValue({
      overall: null,
      dok1Mean: null,
      dok2Mean: null,
      dok3Mean: null,
      dok4Mean: null,
    });

    const { statusHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'grading-bl' } });
    const res = createMockRes();

    await statusHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.status).toBe('grading');
    expect(responseData.retryAfter).toBe(15);
  });

  it('returns retryAfter=0 when complete', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'done-bl',
      title: 'Done BL',
      importStatus: 'complete',
      createdByUserId: 'test-user-1',
      summary: { meanScore: '4.0' },
      createdAt: new Date('2026-01-01'),
    });
    mockGetBrainliftProgress.mockResolvedValue({
      dok1: { total: 5, graded: 5, pending: 0, error: 0 },
      dok2: { total: 2, graded: 2, pending: 0, error: 0 },
      dok3: { total: 1, graded: 1, pending: 0, error: 0 },
      dok4: { total: 1, graded: 1, pending: 0, error: 0 },
    });
    mockGetBrainliftScores.mockResolvedValue({
      overall: 4.0,
      dok1Mean: 4.2,
      dok2Mean: 3.8,
      dok3Mean: 4.0,
      dok4Mean: 4.1,
    });

    const { statusHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'done-bl' } });
    const res = createMockRes();

    await statusHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.status).toBe('complete');
    expect(responseData.retryAfter).toBe(0);
  });
});

// ── FR4: GET /api/internal/brainlifts/:slug/assessment ──

describe('FR4: GET /api/internal/brainlifts/:slug/assessment', () => {
  beforeEach(() => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'assess-bl',
      title: 'Assess BL',
      importStatus: 'complete',
      createdByUserId: 'test-user-1',
    });
  });

  it('returns DOK1 items with scores', async () => {
    mockGetAssessmentDOK1.mockResolvedValue({
      items: [
        { id: 1, fact: 'Test fact', source: 'Source', sourceUrl: null, category: 'Cat', score: 4, note: 'Good' },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '1', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'assess-bl',
        dok: 1,
        items: expect.arrayContaining([
          expect.objectContaining({ id: 1, fact: 'Test fact', score: 4 }),
        ]),
        pagination: expect.objectContaining({
          page: 1,
          pageSize: 20,
          totalItems: 1,
        }),
      }),
    );
  });

  it('allows shared editors to read assessment data', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 2,
      slug: 'shared-assess-bl',
      title: 'Shared Assess BL',
      importStatus: 'complete',
      createdByUserId: 'owner-user',
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockGetAssessmentDOK1.mockResolvedValue({
      items: [{ id: 7, fact: 'Shared fact', score: 5 }],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      authContext: { userId: 'shared-editor', role: 'user', isAdmin: false },
      params: { slug: 'shared-assess-bl' },
      query: { dok: '1' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'shared-assess-bl' }),
      expect.objectContaining({ userId: 'shared-editor' }),
    );
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'shared-assess-bl',
        items: expect.arrayContaining([
          expect.objectContaining({ id: 7, fact: 'Shared fact' }),
        ]),
      }),
    );
  });

  it('allows shared viewers to read assessment data', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 3,
      slug: 'viewer-assess-bl',
      title: 'Viewer Assess BL',
      importStatus: 'complete',
      createdByUserId: 'owner-user',
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockGetAssessmentDOK2.mockResolvedValue({
      items: [{ id: 8, points: ['Viewer point'] }],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      authContext: { userId: 'shared-viewer', role: 'user', isAdmin: false },
      params: { slug: 'viewer-assess-bl' },
      query: { dok: '2' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'viewer-assess-bl',
        dok: 2,
      }),
    );
  });

  it('returns DOK2 items with points', async () => {
    mockGetAssessmentDOK2.mockResolvedValue({
      items: [
        { id: 1, displayTitle: 'Summary 1', sourceName: 'Source', points: ['Point A', 'Point B'], grade: 4, diagnosis: 'Good', feedback: null, failReason: null },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '2', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        dok: 2,
        items: expect.arrayContaining([
          expect.objectContaining({ id: 1, points: ['Point A', 'Point B'] }),
        ]),
      }),
    );
  });

  it('returns DOK3 items with linked sources', async () => {
    mockGetAssessmentDOK3.mockResolvedValue({
      items: [
        { id: 1, text: 'Insight 1', status: 'graded', score: 4, rationale: 'R', feedback: 'F', foundationIntegrityIndex: '0.9', linkedSources: ['Source A'], criteriaSummary: null },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '3', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        dok: 3,
        items: expect.arrayContaining([
          expect.objectContaining({ linkedSources: ['Source A'] }),
        ]),
      }),
    );
  });

  it('returns DOK4 items with linked insights', async () => {
    mockGetAssessmentDOK4.mockResolvedValue({
      items: [
        { id: 1, text: 'SPOV 1', status: 'graded', score: 4, rationale: 'R', feedback: 'F', rejectionReason: null, rejectionCategory: null, linkedInsights: ['Insight 1'], criteriaSummary: null },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '4', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        dok: 4,
        items: expect.arrayContaining([
          expect.objectContaining({ linkedInsights: ['Insight 1'] }),
        ]),
      }),
    );
  });

  // ── Spec 07: Server API v2 alignment ──

  it('does NOT include vulnerabilityPoints in DOK4 detail=full responses', async () => {
    // Storage layer (getAssessmentDOK4) no longer surfaces vulnerabilityPoints
    // for the v2 philosophy (see spec 07). Mock fixture mirrors the new shape:
    // no vulnerabilityPoints key on items.
    mockGetAssessmentDOK4.mockResolvedValue({
      items: [
        {
          id: 1,
          text: 'SPOV with v2 fields',
          status: 'graded',
          score: 4,
          rationale: 'R',
          feedback: 'F',
          rejectionReason: null,
          rejectionCategory: null,
          linkedInsights: ['Insight 1'],
          criteriaSummary: 'S1 (Contested): strong; P1 (Adds Explanatory Power): weak',
          // detail=full extras present in v2 (no vulnerabilityPoints):
          criteriaBreakdown: { S1: { assessment: 'strong' }, P1: { assessment: 'weak' } },
          antimemeticAssessment: 'antim',
          positionSummary: 'pos',
          divergenceQuestion: 'q',
          divergenceVanillaResponse: 'v',
        },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '4', detail: 'full', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.dok).toBe(4);
    expect(responseData.items).toHaveLength(1);
    const item = responseData.items[0];
    expect(item).not.toHaveProperty('vulnerabilityPoints');
  });

  it('returns labeled criteriaSummary for DOK4 v2 SPOVs', async () => {
    mockGetAssessmentDOK4.mockResolvedValue({
      items: [
        {
          id: 2,
          text: 'SPOV with labels',
          status: 'graded',
          score: 3,
          rationale: 'R',
          feedback: 'F',
          rejectionReason: null,
          rejectionCategory: null,
          linkedInsights: [],
          criteriaSummary: 'S1 (Contested): strong; S4 (Clear Side): weak',
        },
      ],
      total: 1,
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '4', page: '1', pageSize: '20' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.items[0].criteriaSummary).toMatch(/S1 \(Contested\)/);
    expect(responseData.items[0].criteriaSummary).toMatch(/S4 \(Clear Side\)/);
  });

  it('returns 400 for missing dok param', async () => {
    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { page: '1' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 for invalid dok=5', async () => {
    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '5' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with empty items for beyond-range page', async () => {
    mockGetAssessmentDOK1.mockResolvedValue({ items: [], total: 5 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '1', page: '999' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.items).toEqual([]);
    expect(responseData.pagination.totalItems).toBe(5);
  });

  it('caps pageSize at 50', async () => {
    mockGetAssessmentDOK1.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '1', pageSize: '100' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK1).toHaveBeenCalledWith(1, 0, 50, { itemId: undefined, sortBy: undefined, order: undefined, status: undefined });
  });

  it('passes filter params to DOK1 assessment', async () => {
    mockGetAssessmentDOK1.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '1', itemId: '42', sortBy: 'score', order: 'asc', status: 'graded' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK1).toHaveBeenCalledWith(
      1, 0, 20,
      { itemId: 42, sortBy: 'score', order: 'asc', status: 'graded' },
    );
  });

  it('passes filter params to DOK2 assessment', async () => {
    mockGetAssessmentDOK2.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '2', sortBy: 'updatedAt', order: 'desc' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK2).toHaveBeenCalledWith(
      1, 0, 20,
      { itemId: undefined, sortBy: 'updatedAt', order: 'desc', status: undefined },
    );
  });

  it('passes filter params to DOK3 assessment', async () => {
    mockGetAssessmentDOK3.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '3', status: 'regrading', detail: 'full' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK3).toHaveBeenCalledWith(
      1, 0, 20, 'full',
      { itemId: undefined, sortBy: undefined, order: undefined, status: 'regrading' },
    );
  });

  it('passes filter params to DOK4 assessment', async () => {
    mockGetAssessmentDOK4.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '4', itemId: '99' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK4).toHaveBeenCalledWith(
      1, 0, 20, 'summary',
      { itemId: 99, sortBy: undefined, order: undefined, status: undefined },
    );
  });

  it('ignores invalid sortBy values', async () => {
    mockGetAssessmentDOK1.mockResolvedValue({ items: [], total: 0 });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'assess-bl' },
      query: { dok: '1', sortBy: 'invalid', order: 'bad', status: 'nope' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockGetAssessmentDOK1).toHaveBeenCalledWith(
      1, 0, 20,
      { itemId: undefined, sortBy: undefined, order: undefined, status: undefined },
    );
  });

  it('returns 404 when assessment read access is denied', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 1,
      slug: 'other-bl',
      createdByUserId: 'other-user',
      importStatus: 'complete',
    });

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'other-bl' },
      query: { dok: '1' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'other-bl' }),
      expect.objectContaining({ userId: 'test-user-1' }),
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 404 for unknown slug', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(undefined);

    const { assessmentHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'nope' },
      query: { dok: '1' },
    });
    const res = createMockRes();

    await assessmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('Internal expert endpoints', () => {
  const ownedBrainlift = {
    id: 99,
    slug: 'experts-bl',
    title: 'Experts Brainlift',
    createdByUserId: 'test-user-1',
  };

  it('lists experts for an owned brainlift', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(ownedBrainlift);
    mockStorage.getExpertsByBrainliftId.mockResolvedValue([
      {
        id: 1,
        name: 'Expert One',
        who: 'Researcher',
        why: 'Relevant',
        focus: 'Topic',
        where: '@expert1',
        rankScore: 8,
        rationale: '8 citations',
        twitterHandle: '@expert1',
        source: 'listed',
      },
    ]);

    const { listExpertsHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'experts-bl' } });
    const res = createMockRes();

    await listExpertsHandler(req, res);

    expect(mockStorage.getExpertsByBrainliftId).toHaveBeenCalledWith(99);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 1, name: 'Expert One', who: 'Researcher' }),
    ]);
  });

  it('creates experts and queues a deduped rerank job', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(ownedBrainlift);
    mockStorage.createExpertsForBrainlift.mockResolvedValue([
      {
        id: 10,
        name: 'New Expert',
        who: 'Analyst',
        why: 'Useful',
        focus: 'Policy',
        where: '@newexpert',
        rankScore: null,
        rationale: null,
        twitterHandle: '@newexpert',
        source: 'listed',
      },
    ]);

    const { createExpertsHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'experts-bl' },
      body: {
        experts: [
          {
            name: 'New Expert',
            who: 'Analyst',
            why: 'Useful',
            focus: 'Policy',
            where: '@newexpert',
          },
        ],
      },
    });
    const res = createMockRes();

    await createExpertsHandler(req, res);

    expect(mockStorage.createExpertsForBrainlift).toHaveBeenCalledWith(99, [
      {
        name: 'New Expert',
        who: 'Analyst',
        why: 'Useful',
        focus: 'Policy',
        where: '@newexpert',
      },
    ]);
    expect(mockWithJob).toHaveBeenCalledWith('experts:rerank');
    expect(mockForPayload).toHaveBeenCalledWith({ brainliftId: 99 });
    expect(mockWithOptions).toHaveBeenCalledWith({ jobKey: 'rerank-experts-99' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 10, name: 'New Expert' }),
    ]);
  });

  it('rejects invalid expert payloads', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(ownedBrainlift);

    const { createExpertsHandler } = await import('../internal');
    const req = createMockReq({
      params: { slug: 'experts-bl' },
      body: { experts: [] },
    });
    const res = createMockRes();

    await expect(createExpertsHandler(req, res)).rejects.toThrow();
    expect(mockStorage.createExpertsForBrainlift).not.toHaveBeenCalled();
  });

  it('deletes an expert and returns 204', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(ownedBrainlift);
    mockStorage.deleteExpertForBrainlift.mockResolvedValue(true);

    const { deleteExpertHandler } = await import('../internal');
    const req = createMockReq({ params: { slug: 'experts-bl', id: '10' } });
    const res = createMockRes();

    await deleteExpertHandler(req, res);

    expect(mockStorage.deleteExpertForBrainlift).toHaveBeenCalledWith(10, 99);
    expect(mockWithOptions).toHaveBeenCalledWith({ jobKey: 'rerank-experts-99' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
  });
});

// ── FR6: Background job tests ──

describe('FR6: Background job registration', () => {
  it('internal:grade job is registered in tasks', async () => {
    // Unmock tasks for this test
    const tasks = await import('../../jobs/tasks');
    expect(tasks.default).toHaveProperty('internal:grade');
  });
});
