import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
}));

const {
  mockStorage,
  mockGetBrainliftProgress,
  mockGetBrainliftScores,
  mockGetAssessmentDOK1,
  mockGetAssessmentDOK2,
  mockGetAssessmentDOK3,
  mockGetAssessmentDOK4,
} = vi.hoisted(() => ({
  mockStorage: {
    getBrainliftsForUserPaginated: vi.fn(),
    getAllBrainliftsPaginated: vi.fn(),
    getBrainliftBySlug: vi.fn(),
    canAccessBrainlift: vi.fn(),
    canModifyBrainlift: vi.fn(),
  },
  mockGetBrainliftProgress: vi.fn(),
  mockGetBrainliftScores: vi.fn(),
  mockGetAssessmentDOK1: vi.fn(),
  mockGetAssessmentDOK2: vi.fn(),
  mockGetAssessmentDOK3: vi.fn(),
  mockGetAssessmentDOK4: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../storage/internal', () => ({
  getBrainliftProgress: (...args: unknown[]) => mockGetBrainliftProgress(...args),
  getBrainliftScores: (...args: unknown[]) => mockGetBrainliftScores(...args),
  getAssessmentDOK1: (...args: unknown[]) => mockGetAssessmentDOK1(...args),
  getAssessmentDOK2: (...args: unknown[]) => mockGetAssessmentDOK2(...args),
  getAssessmentDOK3: (...args: unknown[]) => mockGetAssessmentDOK3(...args),
  getAssessmentDOK4: (...args: unknown[]) => mockGetAssessmentDOK4(...args),
}));

function createAuthContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    role: 'user',
    isAdmin: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue('# Brainlift Template');
  mockStorage.canAccessBrainlift.mockResolvedValue(true);
});

describe('brainlift grading surface', () => {
  it('loads the template once and reuses the cached payload', async () => {
    const {
      getBrainliftTemplatePayload,
    } = await import('../brainlift-grading-surface');

    const first = await getBrainliftTemplatePayload();
    const second = await getBrainliftTemplatePayload();

    expect(first).toEqual({
      template: '# Brainlift Template',
      format: 'markdown',
    });
    expect(second).toEqual(first);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('returns user-scoped list payloads with derived status, parsed score, and pagination', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [
        {
          id: 1,
          slug: 'alpha',
          title: 'Alpha',
          importStatus: 'pending',
          summary: { meanScore: '3.75' },
          createdAt: new Date('2026-04-01T10:00:00.000Z'),
          createdByUserId: 'user-1', // owned by current user
          author: null,
          creatorName: 'Ada Lovelace',
        },
        {
          id: 2,
          slug: 'beta',
          title: 'Beta',
          importStatus: 'complete',
          summary: null,
          createdAt: new Date('2026-04-02T11:00:00.000Z'),
          createdByUserId: 'user-other',
          sharePermission: 'editor', // shared with current user as editor
          author: null,
          creatorName: null,
        },
      ],
      total: 11,
    });

    const {
      listBrainliftsForAuthContext,
    } = await import('../brainlift-grading-surface');

    const result = await listBrainliftsForAuthContext(createAuthContext(), {
      page: 2,
      pageSize: 5,
    });

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      createAuthContext(),
      5,
      5,
      'all',
      { search: undefined },
    );
    expect(mockStorage.getAllBrainliftsPaginated).not.toHaveBeenCalled();
    expect(result).toEqual({
      brainlifts: [
        {
          slug: 'alpha',
          title: 'Alpha',
          status: 'grading',
          score: 3.75,
          createdAt: '2026-04-01T10:00:00.000Z',
          permission: 'owner',
          creator: 'Ada Lovelace',
        },
        {
          slug: 'beta',
          title: 'Beta',
          status: 'complete',
          score: null,
          createdAt: '2026-04-02T11:00:00.000Z',
          permission: 'editor',
          creator: null,
        },
      ],
      pagination: {
        page: 2,
        pageSize: 5,
        totalItems: 11,
        totalPages: 3,
      },
    });
  });

  it('forwards search to user-scoped storage for non-admins', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [],
      total: 0,
    });

    const {
      listBrainliftsForAuthContext,
    } = await import('../brainlift-grading-surface');

    await listBrainliftsForAuthContext(createAuthContext(), {
      page: 1,
      pageSize: 5,
      search: '  Robotics  ',
    });

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      createAuthContext(),
      0,
      5,
      'all',
      { search: 'Robotics' },
    );
  });

  it('forwards search to system-wide storage for admins', async () => {
    mockStorage.getAllBrainliftsPaginated.mockResolvedValue({
      brainlifts: [],
      total: 0,
    });

    const {
      listBrainliftsForAuthContext,
    } = await import('../brainlift-grading-surface');

    await listBrainliftsForAuthContext(
      createAuthContext({ isAdmin: true, role: 'admin' }),
      { page: 1, pageSize: 5, search: 'Robotics' },
    );

    expect(mockStorage.getAllBrainliftsPaginated).toHaveBeenCalledWith(
      0,
      5,
      { search: 'Robotics' },
    );
  });

  it('treats an all-whitespace search as no search', async () => {
    mockStorage.getBrainliftsForUserPaginated.mockResolvedValue({
      brainlifts: [],
      total: 0,
    });

    const {
      listBrainliftsForAuthContext,
    } = await import('../brainlift-grading-surface');

    await listBrainliftsForAuthContext(createAuthContext(), {
      page: 1,
      pageSize: 5,
      search: '   ',
    });

    expect(mockStorage.getBrainliftsForUserPaginated).toHaveBeenCalledWith(
      createAuthContext(),
      0,
      5,
      'all',
      { search: undefined },
    );
  });

  it('admins get a system-wide list (not user-scoped) from list_brainlifts', async () => {
    mockStorage.getAllBrainliftsPaginated.mockResolvedValue({
      brainlifts: [
        {
          id: 9,
          slug: 'omega',
          title: 'Omega',
          importStatus: 'complete',
          summary: { meanScore: '4.5' },
          createdAt: new Date('2026-04-05T09:00:00.000Z'),
          author: 'Dr. Doc',
          creatorName: 'Grace Hopper',
        },
      ],
      total: 1,
    });

    const {
      listBrainliftsForAuthContext,
    } = await import('../brainlift-grading-surface');

    const result = await listBrainliftsForAuthContext(
      createAuthContext({ isAdmin: true, role: 'admin' }),
      { page: 1, pageSize: 10 },
    );

    expect(mockStorage.getAllBrainliftsPaginated).toHaveBeenCalledWith(0, 10, { search: undefined });
    expect(mockStorage.getBrainliftsForUserPaginated).not.toHaveBeenCalled();
    expect(result.brainlifts).toEqual([
      {
        slug: 'omega',
        title: 'Omega',
        status: 'complete',
        score: 4.5,
        createdAt: '2026-04-05T09:00:00.000Z',
        permission: 'viewer',
        creator: 'Grace Hopper',
      },
    ]);
  });

  it('returns status payloads with progress, scores, and retry guidance', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 7,
      slug: 'alpha',
      title: 'Alpha',
      importStatus: 'pending',
      createdAt: new Date('2026-04-03T12:00:00.000Z'),
    });
    mockGetBrainliftProgress.mockResolvedValue({
      dok1: { total: 10, graded: 6, pending: 4, error: 0 },
      dok2: { total: 2, graded: 2, pending: 0, error: 0 },
      dok3: { total: 1, graded: 0, pending: 1, error: 0 },
      dok4: { total: 0, graded: 0, pending: 0, error: 0 },
    });
    mockGetBrainliftScores.mockResolvedValue({
      overall: 3.8,
      dok1Mean: 3.5,
      dok2Mean: 4.0,
      dok3Mean: null,
      dok4Mean: null,
    });

    const {
      getBrainliftStatusForAuthContext,
    } = await import('../brainlift-grading-surface');

    const result = await getBrainliftStatusForAuthContext(createAuthContext(), 'alpha');

    expect(mockStorage.getBrainliftBySlug).toHaveBeenCalledWith('alpha');
    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, slug: 'alpha' }),
      createAuthContext(),
    );
    expect(result).toEqual({
      slug: 'alpha',
      title: 'Alpha',
      status: 'grading',
      progress: {
        dok1: { total: 10, graded: 6, pending: 4, error: 0 },
        dok2: { total: 2, graded: 2, pending: 0, error: 0 },
        dok3: { total: 1, graded: 0, pending: 1, error: 0 },
        dok4: { total: 0, graded: 0, pending: 0, error: 0 },
      },
      score: {
        overall: 3.8,
        dok1Mean: 3.5,
        dok2Mean: 4.0,
        dok3Mean: null,
        dok4Mean: null,
      },
      retryAfter: 15,
      createdAt: '2026-04-03T12:00:00.000Z',
    });
  });

  it('returns paginated DOK assessment payloads with filters and detail mode', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 9,
      slug: 'gamma',
      title: 'Gamma',
      importStatus: 'complete',
      createdAt: new Date('2026-04-04T12:00:00.000Z'),
    });
    mockGetAssessmentDOK3.mockResolvedValue({
      items: [
        {
          id: 41,
          text: 'Insight',
          status: 'graded',
          score: 4,
          rationale: 'Because',
          feedback: 'Tighten',
          linkedSources: ['Source A'],
          criteriaSummary: 'V1: strong',
        },
      ],
      total: 8,
    });

    const {
      getBrainliftAssessmentForAuthContext,
    } = await import('../brainlift-grading-surface');

    const result = await getBrainliftAssessmentForAuthContext(createAuthContext(), {
      slug: 'gamma',
      dok: 3,
      page: 2,
      pageSize: 4,
      itemId: 41,
      sortBy: 'updatedAt',
      order: 'desc',
      status: 'regrading',
      detail: 'full',
    });

    expect(mockGetAssessmentDOK3).toHaveBeenCalledWith(
      9,
      4,
      4,
      'full',
      {
        itemId: 41,
        sortBy: 'updatedAt',
        order: 'desc',
        status: 'regrading',
      },
    );
    expect(result).toEqual({
      slug: 'gamma',
      dok: 3,
      status: 'complete',
      items: [
        {
          id: 41,
          text: 'Insight',
          status: 'graded',
          score: 4,
          rationale: 'Because',
          feedback: 'Tighten',
          linkedSources: ['Source A'],
          criteriaSummary: 'V1: strong',
        },
      ],
      pagination: {
        page: 2,
        pageSize: 4,
        totalItems: 8,
        totalPages: 2,
      },
    });
  });

  it('rejects inaccessible assessment reads with a not-found error', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 9,
      slug: 'hidden',
      title: 'Hidden',
      importStatus: 'complete',
      createdAt: new Date('2026-04-04T12:00:00.000Z'),
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(false);

    const {
      getBrainliftAssessmentForAuthContext,
    } = await import('../brainlift-grading-surface');

    await expect(
      getBrainliftAssessmentForAuthContext(createAuthContext(), {
        slug: 'hidden',
        dok: 1,
      }),
    ).rejects.toThrow('Brainlift not found');
  });

  it('rejects invalid DOK levels', async () => {
    const {
      getBrainliftAssessmentForAuthContext,
    } = await import('../brainlift-grading-surface');

    await expect(
      getBrainliftAssessmentForAuthContext(createAuthContext(), {
        slug: 'alpha',
        dok: 5 as 1,
      }),
    ).rejects.toThrow('dok parameter is required and must be 1-4');
  });
});
