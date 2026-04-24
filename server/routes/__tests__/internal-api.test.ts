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
    getBrainliftsForUserPaginated: vi.fn(),
    canAccessBrainlift: vi.fn(),
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

// Mock service layer
vi.mock('../../services/internal-grading', () => ({
  processGradeRequest: mockProcessGradeRequest,
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
    );
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

// ── FR6: Background job tests ──

describe('FR6: Background job registration', () => {
  it('internal:grade job is registered in tasks', async () => {
    // Unmock tasks for this test
    const tasks = await import('../../jobs/tasks');
    expect(tasks.default).toHaveProperty('internal:grade');
  });
});
