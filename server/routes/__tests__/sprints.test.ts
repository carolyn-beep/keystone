import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SprintStorageConflictError } from '../../storage/sprints';

const { mockStorage, mockGenerateSprintPlan, mockDriveService, mockCreateGoogleDriveService, mockQueue } = vi.hoisted(() => ({
  mockStorage: {
    getActivePlan: vi.fn(),
    getCurrentPlan: vi.fn(),
    createPlanWithTasks: vi.fn(),
    createGeneratingPlan: vi.fn(),
    reclaimStaleGeneratingPlans: vi.fn(),
    deleteFailedPlans: vi.fn(),
    listPlans: vi.fn(),
    listTasksForBrainlift: vi.fn(),
    getTaskForBrainlift: vi.fn(),
    getDeliverableByTaskId: vi.fn(),
    getDeliverableByIdForBrainlift: vi.fn(),
    listDeliverablesForBrainlift: vi.fn(),
    listDocuments: vi.fn(),
    getSprintSharingAudience: vi.fn(),
    setBrainliftGdriveRootFolder: vi.fn(),
    setPlanGdriveFolder: vi.fn(),
    createDeliverable: vi.fn(),
    markPlanCompleteIfAllDelivered: vi.fn(),
  },
  mockGenerateSprintPlan: vi.fn(),
  mockDriveService: {
    ensureRootFolder: vi.fn(),
    ensurePlanFolder: vi.fn(),
    syncRootFolderEditors: vi.fn(),
    createGoogleDocFromMarkdown: vi.fn(),
    exportGoogleDocAsMarkdown: vi.fn(),
    replaceGoogleDocFromMarkdown: vi.fn(),
    deleteGoogleDoc: vi.fn(),
  },
  mockCreateGoogleDriveService: vi.fn(),
  mockQueue: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/sprintGenerator', () => ({
  generateSprintPlan: (...args: unknown[]) => mockGenerateSprintPlan(...args),
}));

vi.mock('../../services/googleDrive', () => ({
  createGoogleDriveService: (...args: unknown[]) => mockCreateGoogleDriveService(...args),
}));

vi.mock('../../utils/withJob', () => ({
  withJob: () => ({
    forPayload: () => ({
      queue: mockQueue,
    }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateGoogleDriveService.mockReturnValue(mockDriveService);
  mockStorage.reclaimStaleGeneratingPlans.mockResolvedValue(0);
  mockStorage.deleteFailedPlans.mockResolvedValue(0);
  mockQueue.mockResolvedValue(undefined);
});

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'scope-breaker', taskId: '101' },
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

describe('sprints route handlers', () => {
  it('createPlanHandler returns 202 with generating plan and enqueues the job', async () => {
    const { createPlanHandler } = await import('../sprints');
    const req = createReq({
      body: {
        localDate: '2026-04-21',
        diagnosis: {
          goalRaw: 'Ship the sprint plan flow.',
          currentState: 'Early scaffolding, no tasks yet.',
        },
      },
    });
    const res = createRes();

    mockStorage.getCurrentPlan.mockResolvedValue(null);
    mockStorage.createGeneratingPlan.mockResolvedValue({
      id: 500,
      startDate: '2026-04-21',
      endDate: '2026-05-20',
      status: 'generating',
      generationError: null,
    });

    await createPlanHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: expect.objectContaining({ id: 500, status: 'generating', taskCount: 0 }),
        tasks: [],
      }),
    );
    expect(mockStorage.createGeneratingPlan).toHaveBeenCalledWith(expect.objectContaining({
      brainliftId: 1,
      userId: 'user-1',
    }));
    expect(mockStorage.deleteFailedPlans).toHaveBeenCalledWith(1);
    expect(mockQueue).toHaveBeenCalledTimes(1);
    expect(mockGenerateSprintPlan).not.toHaveBeenCalled();
  });

  it('createPlanHandler returns 409 when an active plan already exists', async () => {
    const { createPlanHandler } = await import('../sprints');
    const req = createReq({
      body: {
        localDate: '2026-04-21',
        diagnosis: {
          goalRaw: 'Ship something.',
          currentState: 'Nothing yet.',
        },
      },
    });
    const res = createRes();

    mockStorage.getCurrentPlan.mockResolvedValue({ id: 111, status: 'active' });

    await createPlanHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockStorage.createGeneratingPlan).not.toHaveBeenCalled();
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('createPlanHandler returns 409 when a generation is already in flight', async () => {
    const { createPlanHandler } = await import('../sprints');
    const req = createReq({
      body: {
        localDate: '2026-04-21',
        diagnosis: { goalRaw: 'X', currentState: 'Y' },
      },
    });
    const res = createRes();

    mockStorage.getCurrentPlan.mockResolvedValue({ id: 222, status: 'generating' });

    await createPlanHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('listTasksHandler rejects includePastDue without localDate', async () => {
    const { listTasksHandler } = await import('../sprints');
    const req = createReq({ query: { includePastDue: 'true' } });
    const res = createRes();

    await expect(listTasksHandler(req, res)).rejects.toThrow();
  });

  it('getTaskHandler rejects non-numeric task ids', async () => {
    const { getTaskHandler } = await import('../sprints');
    const req = createReq({ params: { slug: 'scope-breaker', taskId: 'abc' } });
    const res = createRes();

    await expect(getTaskHandler(req, res)).rejects.toThrow();
  });

  it('getTaskHandler returns 404 when task is not in the brainlift scope', async () => {
    const { getTaskHandler } = await import('../sprints');
    const req = createReq({ params: { slug: 'scope-breaker', taskId: '42' } });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue(null);

    await expect(getTaskHandler(req, res)).rejects.toThrow('Task not found');
  });

  it('createDeliverableHandler creates doc pointer and returns 201', async () => {
    const { createDeliverableHandler } = await import('../sprints');
    const req = createReq({
      params: { slug: 'scope-breaker', taskId: '42' },
      body: { title: 'Deliverable 1', markdown: '# Draft' },
    });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      planId: 10,
      brainliftId: 1,
      scheduledDate: '2026-04-21',
      weekNumber: 1,
      dayInWeek: 1,
      title: 'Task',
      description: 'Desc',
      isComplete: false,
      isPastDue: false,
      deliverable: null,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active',
      },
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
      taskId: 42,
      brainliftId: 1,
      title: 'Deliverable 1',
      docFileId: 'doc-1',
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
      sourceSurface: 'ui',
      createdByUserId: 'user-1',
      createdAt: new Date(),
    });
    mockStorage.markPlanCompleteIfAllDelivered.mockResolvedValue('active');

    await createDeliverableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      id: 900,
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
    expect(mockDriveService.syncRootFolderEditors).toHaveBeenCalled();
  });

  it('createDeliverableHandler returns 409 when task already has deliverable', async () => {
    const { createDeliverableHandler } = await import('../sprints');
    const req = createReq({
      params: { slug: 'scope-breaker', taskId: '42' },
      body: { title: 'Deliverable 1', markdown: '# Draft' },
    });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue({
      id: 7,
      docFileId: 'doc-existing',
      docUrl: 'https://docs.google.com/document/d/doc-existing/edit',
    });

    await createDeliverableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('createDeliverableHandler maps insert conflicts to 409 and compensates with doc delete', async () => {
    const { createDeliverableHandler } = await import('../sprints');
    const req = createReq({
      params: { slug: 'scope-breaker', taskId: '42' },
      body: { title: 'Deliverable 1', markdown: '# Draft' },
    });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      planId: 10,
      brainliftId: 1,
      scheduledDate: '2026-04-21',
      weekNumber: 1,
      dayInWeek: 1,
      title: 'Task',
      description: 'Desc',
      isComplete: false,
      isPastDue: false,
      deliverable: null,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active',
      },
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
      new SprintStorageConflictError('A deliverable already exists for this task'),
    );
    mockDriveService.deleteGoogleDoc.mockResolvedValue(true);

    await createDeliverableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockDriveService.deleteGoogleDoc).toHaveBeenCalledWith('doc-1');
  });

  it('updateDeliverableHandler returns 404 when no deliverable exists', async () => {
    const { updateDeliverableHandler } = await import('../sprints');
    const req = createReq({
      params: { slug: 'scope-breaker', taskId: '42' },
      body: { markdown: '# Updated' },
    });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);

    await expect(updateDeliverableHandler(req, res)).rejects.toThrow('Deliverable not found');
  });

  it('updateDeliverableHandler replaces markdown in-place and returns docUrl', async () => {
    const { updateDeliverableHandler } = await import('../sprints');
    const req = createReq({
      params: { slug: 'scope-breaker', taskId: '42' },
      body: { markdown: '# Updated' },
    });
    const res = createRes();

    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue({
      id: 7,
      taskId: 42,
      brainliftId: 1,
      title: 'Deliverable',
      docFileId: 'doc-123',
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
      sourceSurface: 'ui',
      createdByUserId: 'user-1',
      createdAt: new Date(),
    });

    await updateDeliverableHandler(req, res);

    expect(mockDriveService.replaceGoogleDocFromMarkdown).toHaveBeenCalledWith('doc-123', '# Updated');
    expect(res.json).toHaveBeenCalledWith({
      id: 7,
      docUrl: 'https://docs.google.com/document/d/doc-123/edit',
    });
  });

  it('listDeliverablesHandler returns plan metadata plus deliverables', async () => {
    const { listDeliverablesHandler } = await import('../sprints');
    const req = createReq({ query: { planId: '10' } });
    const res = createRes();

    mockStorage.listPlans.mockResolvedValue([
      { id: 10, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active' },
      { id: 9, startDate: '2026-03-01', endDate: '2026-03-30', status: 'complete' },
    ]);
    mockStorage.listTasksForBrainlift.mockResolvedValue([
      { isComplete: true },
      { isComplete: false },
    ]);
    mockStorage.listDeliverablesForBrainlift
      .mockResolvedValueOnce([
        {
          id: 50,
          taskId: 42,
          planId: 10,
          title: 'Deliverable',
          taskTitle: 'Task',
          scheduledDate: '2026-04-21',
          createdAt: '2026-04-21T00:00:00.000Z',
          docUrl: 'https://docs.google.com/document/d/doc-123/edit',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 44,
          taskId: 30,
          planId: 9,
          title: 'Completed Deliverable',
          taskTitle: 'Completed Task',
          scheduledDate: '2026-03-10',
          createdAt: '2026-03-10T00:00:00.000Z',
          docUrl: 'https://docs.google.com/document/d/doc-44/edit',
        },
      ]);

    await listDeliverablesHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plans: expect.arrayContaining([
          expect.objectContaining({ id: 10, taskCount: 2, completedTaskCount: 1 }),
          expect.objectContaining({ id: 9, taskCount: 1, completedTaskCount: 1 }),
        ]),
        deliverables: expect.arrayContaining([
          expect.objectContaining({ id: 50, planId: 10 }),
        ]),
      }),
    );
  });
});
