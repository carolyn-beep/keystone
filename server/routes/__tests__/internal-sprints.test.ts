import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStorage,
  mockDriveService,
  mockCreateGoogleDriveService,
  mockSetDeliverableSourceSurface,
  mockRequireServiceAuth,
  mockRequireBrainliftAccess,
  mockRequireBrainliftModify,
  mockPublicHandlers,
  MockSprintStorageConflictError,
} = vi.hoisted(() => {
  class MockSprintStorageConflictError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SprintStorageConflictError';
    }
  }

  return {
    mockStorage: {
      getTaskForBrainlift: vi.fn(),
      getDeliverableByTaskId: vi.fn(),
      listPlans: vi.fn(),
      getSprintSharingAudience: vi.fn(),
      setBrainliftGdriveRootFolder: vi.fn(),
      setPlanGdriveFolder: vi.fn(),
      createDeliverable: vi.fn(),
      markPlanCompleteIfAllDelivered: vi.fn(),
    },
    mockDriveService: {
      ensureRootFolder: vi.fn(),
      ensurePlanFolder: vi.fn(),
      syncRootFolderEditors: vi.fn(),
      createGoogleDocFromMarkdown: vi.fn(),
      replaceGoogleDocFromMarkdown: vi.fn(),
      deleteGoogleDoc: vi.fn(),
    },
    mockCreateGoogleDriveService: vi.fn(),
    mockSetDeliverableSourceSurface: vi.fn(),
    mockRequireServiceAuth: vi.fn(function requireServiceAuth(_req: any, _res: any, next: any) {
      next();
    }),
    mockRequireBrainliftAccess: vi.fn(function requireBrainliftAccess(_req: any, _res: any, next: any) {
      next();
    }),
    mockRequireBrainliftModify: vi.fn(function requireBrainliftModify(_req: any, _res: any, next: any) {
      next();
    }),
    mockPublicHandlers: {
      createPlanHandler: vi.fn(),
      listPlansHandler: vi.fn(),
      getActivePlanHandler: vi.fn(),
      listTasksHandler: vi.fn(),
      getTaskHandler: vi.fn(),
      readDeliverableHandler: vi.fn(),
      listDeliverablesHandler: vi.fn(),
    },
    MockSprintStorageConflictError,
  };
});

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../middleware/service-auth', () => ({
  requireServiceAuth: mockRequireServiceAuth,
}));

vi.mock('../../middleware/brainlift-auth', () => ({
  requireBrainliftAccess: mockRequireBrainliftAccess,
  requireBrainliftModify: mockRequireBrainliftModify,
}));

vi.mock('../../middleware/error-handler', () => {
  class BadRequestError extends Error {
    statusCode = 400;
  }
  class NotFoundError extends Error {
    statusCode = 404;
  }
  return {
    asyncHandler: (fn: any) => fn,
    BadRequestError,
    NotFoundError,
  };
});

vi.mock('../../services/googleDrive', () => ({
  createGoogleDriveService: (...args: unknown[]) => mockCreateGoogleDriveService(...args),
}));

vi.mock('../../storage/sprints', () => ({
  SprintStorageConflictError: MockSprintStorageConflictError,
  setDeliverableSourceSurface: (...args: unknown[]) => mockSetDeliverableSourceSurface(...args),
}));

vi.mock('../sprints', () => ({
  createPlanHandler: (...args: unknown[]) => mockPublicHandlers.createPlanHandler(...args),
  listPlansHandler: (...args: unknown[]) => mockPublicHandlers.listPlansHandler(...args),
  getActivePlanHandler: (...args: unknown[]) => mockPublicHandlers.getActivePlanHandler(...args),
  listTasksHandler: (...args: unknown[]) => mockPublicHandlers.listTasksHandler(...args),
  getTaskHandler: (...args: unknown[]) => mockPublicHandlers.getTaskHandler(...args),
  readDeliverableHandler: (...args: unknown[]) => mockPublicHandlers.readDeliverableHandler(...args),
  listDeliverablesHandler: (...args: unknown[]) => mockPublicHandlers.listDeliverablesHandler(...args),
}));

vi.mock('../../services/internal-grading', () => ({
  processGradeRequest: vi.fn(),
}));

vi.mock('../../storage/internal', () => ({
  getBrainliftProgress: vi.fn(),
  getBrainliftScores: vi.fn(),
  getAssessmentDOK1: vi.fn(),
  getAssessmentDOK2: vi.fn(),
  getAssessmentDOK3: vi.fn(),
  getAssessmentDOK4: vi.fn(),
}));

vi.mock('../../storage/versions', () => ({
  createVersion: vi.fn(),
  pruneVersions: vi.fn(),
}));

vi.mock('../../storage/stale', () => ({
  propagateStaleFlags: vi.fn(),
  dismissStaleFlag: vi.fn(),
  getStaleItems: vi.fn(),
}));

vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn(),
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn().mockReturnValue({
    forPayload: vi.fn().mockReturnValue({
      queue: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}));

vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('# Template'),
  existsSync: vi.fn().mockReturnValue(true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateGoogleDriveService.mockReturnValue(mockDriveService);
});

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'scope-breaker', taskId: '42' },
    query: {},
    body: {},
    brainlift: {
      id: 1,
      slug: 'scope-breaker',
      title: 'Scope Breaker',
      gdriveRootFolderId: null,
    },
    authContext: {
      userId: 'user-1',
      role: 'user',
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

describe('internal sprint route handlers', () => {
  it('internalCreatePlanHandler delegates to public plan handler', async () => {
    const { internalCreatePlanHandler } = await import('../internal');
    const req = createReq({ body: { localDate: '2026-04-21' } });
    const res = createRes();

    await internalCreatePlanHandler(req, res);

    expect(mockPublicHandlers.createPlanHandler).toHaveBeenCalledWith(req, res);
  });

  it('internalCreateDeliverableHandler stores mcp source surface and returns 201', async () => {
    const { internalCreateDeliverableHandler } = await import('../internal');
    const req = createReq({ body: { title: 'Deliverable 1', markdown: '# Draft' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);
    mockStorage.listPlans.mockResolvedValue([
      { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active', gdriveFolderId: null },
    ]);
    mockStorage.getSprintSharingAudience.mockResolvedValue({
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner',
      editorEmails: ['editor@example.com'],
      guideEmails: ['guide@example.com'],
    });
    mockDriveService.ensureRootFolder.mockResolvedValue({ folderId: 'root-1', created: true });
    mockDriveService.ensurePlanFolder.mockResolvedValue({ folderId: 'plan-1', created: true });
    mockDriveService.createGoogleDocFromMarkdown.mockResolvedValue({
      fileId: 'doc-1',
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
    mockStorage.createDeliverable.mockResolvedValue({
      id: 900,
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
    mockStorage.markPlanCompleteIfAllDelivered.mockResolvedValue('active');

    await internalCreateDeliverableHandler(req, res);

    expect(mockStorage.createDeliverable).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSurface: 'mcp',
        createdByUserId: 'user-1',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
  });

  it('internalCreateDeliverableHandler returns 409 when task already has deliverable', async () => {
    const { internalCreateDeliverableHandler } = await import('../internal');
    const req = createReq({ body: { title: 'Deliverable 1', markdown: '# Draft' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue({
      id: 50,
      docUrl: 'https://docs.google.com/document/d/doc-existing/edit',
    });

    await internalCreateDeliverableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDriveService.createGoogleDocFromMarkdown).not.toHaveBeenCalled();
  });

  it('internalCreateDeliverableHandler maps insert conflict to 409 and deletes orphaned doc', async () => {
    const { internalCreateDeliverableHandler } = await import('../internal');
    const req = createReq({ body: { title: 'Deliverable 1', markdown: '# Draft' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);
    mockStorage.listPlans.mockResolvedValue([
      { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active', gdriveFolderId: null },
    ]);
    mockStorage.getSprintSharingAudience.mockResolvedValue({
      ownerEmail: 'owner@example.com',
      ownerName: 'Owner',
      editorEmails: [],
      guideEmails: [],
    });
    mockDriveService.ensureRootFolder.mockResolvedValue({ folderId: 'root-1', created: true });
    mockDriveService.ensurePlanFolder.mockResolvedValue({ folderId: 'plan-1', created: true });
    mockDriveService.createGoogleDocFromMarkdown.mockResolvedValue({
      fileId: 'doc-1',
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
    mockStorage.createDeliverable.mockRejectedValue(
      new MockSprintStorageConflictError('A deliverable already exists for this task'),
    );
    mockDriveService.deleteGoogleDoc.mockResolvedValue(true);

    await internalCreateDeliverableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDriveService.deleteGoogleDoc).toHaveBeenCalledWith('doc-1');
  });

  it('internalUpdateDeliverableHandler updates doc and stamps source surface to mcp', async () => {
    const { internalUpdateDeliverableHandler } = await import('../internal');
    const req = createReq({ body: { markdown: '# Updated' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue({
      id: 7,
      taskId: 42,
      brainliftId: 1,
      docFileId: 'doc-123',
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
    });

    await internalUpdateDeliverableHandler(req, res);

    expect(mockDriveService.replaceGoogleDocFromMarkdown).toHaveBeenCalledWith('doc-123', '# Updated');
    expect(mockSetDeliverableSourceSurface).toHaveBeenCalledWith(7, 1, 'mcp');
    expect(res.json).toHaveBeenCalledWith({
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
    });
  });

  it('internalUpdateDeliverableHandler throws when deliverable is missing', async () => {
    const { internalUpdateDeliverableHandler } = await import('../internal');
    const req = createReq({ body: { markdown: '# Updated' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);

    await expect(internalUpdateDeliverableHandler(req, res)).rejects.toThrow('Deliverable not found');
  });
});

describe('internal sprint route wiring', () => {
  it('registers all internal sprint mirror endpoints with service-auth middleware', async () => {
    const { internalRouter } = await import('../internal');
    const routeLayers = (internalRouter as any).stack.filter((layer: any) => layer.route);

    const assertRoute = (method: string, path: string, accessType: 'read' | 'write') => {
      const layer = routeLayers.find((candidate: any) =>
        candidate.route.path === path && candidate.route.methods[method],
      );
      expect(layer, `${method.toUpperCase()} ${path} route should exist`).toBeTruthy();
      expect(layer.route.stack[0].handle).toBe(mockRequireServiceAuth);
      expect(layer.route.stack[1].handle).toBe(
        accessType === 'read' ? mockRequireBrainliftAccess : mockRequireBrainliftModify,
      );
    };

    assertRoute('post', '/api/internal/brainlifts/:slug/plans', 'write');
    assertRoute('get', '/api/internal/brainlifts/:slug/plans', 'read');
    assertRoute('get', '/api/internal/brainlifts/:slug/plans/active', 'read');
    assertRoute('get', '/api/internal/brainlifts/:slug/tasks', 'read');
    assertRoute('get', '/api/internal/brainlifts/:slug/tasks/:taskId', 'read');
    assertRoute('post', '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable', 'write');
    assertRoute('get', '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable', 'read');
    assertRoute('put', '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable', 'write');
    assertRoute('get', '/api/internal/brainlifts/:slug/deliverables', 'read');
  });
});
