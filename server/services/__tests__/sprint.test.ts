import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../middleware/error-handler';

const {
  mockStorage,
  mockDriveService,
  mockCreateGoogleDriveService,
  mockGenerateSprintPlan,
  mockQueue,
  mockSetDeliverableSourceSurface,
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
      reclaimStaleGeneratingPlans: vi.fn(),
      getCurrentPlan: vi.fn(),
      deleteFailedPlans: vi.fn(),
      createGeneratingPlan: vi.fn(),
      finalizeGeneratingPlan: vi.fn(),
      markPlanGenerationFailed: vi.fn(),
      getSprintPlanContext: vi.fn(),
      listPlans: vi.fn(),
      listTasksForBrainlift: vi.fn(),
      getTaskForBrainlift: vi.fn(),
      getDeliverableByTaskId: vi.fn(),
      getSprintSharingAudience: vi.fn(),
      setBrainliftGdriveRootFolder: vi.fn(),
      setPlanGdriveFolder: vi.fn(),
      createDeliverable: vi.fn(),
      markPlanCompleteIfAllDelivered: vi.fn(),
      listDeliverablesForBrainlift: vi.fn(),
    },
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
    mockGenerateSprintPlan: vi.fn(),
    mockQueue: vi.fn(),
    mockSetDeliverableSourceSurface: vi.fn(),
    MockSprintStorageConflictError,
  };
});

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../googleDrive', () => ({
  createGoogleDriveService: (...args: unknown[]) => mockCreateGoogleDriveService(...args),
}));

vi.mock('../../ai/sprintGenerator', () => ({
  generateSprintPlan: (...args: unknown[]) => mockGenerateSprintPlan(...args),
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn(() => ({
      queue: mockQueue,
    })),
  })),
}));

vi.mock('../../storage/sprints', () => ({
  SprintStorageConflictError: MockSprintStorageConflictError,
  setDeliverableSourceSurface: (...args: unknown[]) => mockSetDeliverableSourceSurface(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateGoogleDriveService.mockReturnValue(mockDriveService);
  mockStorage.reclaimStaleGeneratingPlans.mockResolvedValue(0);
  mockStorage.deleteFailedPlans.mockResolvedValue(0);
  mockQueue.mockResolvedValue(undefined);
  mockStorage.listPlans.mockResolvedValue([]);
  mockStorage.listTasksForBrainlift.mockResolvedValue([]);
  mockStorage.listDeliverablesForBrainlift.mockResolvedValue([]);
});

describe('sprint service plan generation', () => {
  it('queues plan generation after creating a generating plan', async () => {
    const { queueSprintPlanGeneration } = await import('../sprint');
    mockStorage.getCurrentPlan.mockResolvedValue(null);
    mockStorage.createGeneratingPlan.mockResolvedValue({
      id: 500,
      startDate: '2026-04-21',
      endDate: '2026-05-30',
      status: 'generating',
      generationError: null,
    });

    const result = await queueSprintPlanGeneration({
      brainliftId: 7,
      userId: 'user-1',
      localDate: '2026-04-21',
      diagnosis: {
        goalRaw: 'Ship the sprint registry.',
        currentState: 'Foundation exists, sprint tools do not.',
      },
    });

    expect(mockStorage.createGeneratingPlan).toHaveBeenCalledWith(expect.objectContaining({
      brainliftId: 7,
      userId: 'user-1',
    }));
    expect(mockQueue).toHaveBeenCalledWith();
    expect(result).toEqual({
      plan: expect.objectContaining({
        id: 500,
        status: 'generating',
        taskCount: 0,
        completedTaskCount: 0,
      }),
      tasks: [],
    });
  });

  it('synthesizes fallback diagnosis for synchronous generation when omitted', async () => {
    const { generateSprintPlanNow } = await import('../sprint');
    mockStorage.getCurrentPlan.mockResolvedValue(null);
    mockStorage.createGeneratingPlan.mockResolvedValue({
      id: 700,
      startDate: '2026-04-21',
      endDate: '2026-05-30',
      status: 'generating',
      generationError: null,
    });
    mockStorage.getSprintPlanContext.mockResolvedValue({
      brainlift: {
        id: 7,
        title: 'Scope Breaker',
        description: 'Build a native chat sprint tool surface.',
        displayPurpose: 'Ship sprint workflows inside native chat.',
      },
      creator: {
        userId: 'user-1',
        email: 'owner@example.com',
        name: 'Owner',
      },
      experts: [{ name: 'Expert A', rankScore: 0.8, rationale: 'Helpful' }],
      spovs: [{ id: 1, text: 'A strong position', score: 4.6, status: 'graded' }],
      sources: [{ displayTitle: 'Source A', sourceName: 'Source A', grade: 4.2, points: ['Point 1'] }],
    });
    mockGenerateSprintPlan.mockResolvedValue({
      startDate: '2026-04-21',
      tasks: [
        { scheduledDate: '2026-04-21', title: 'Task 1', description: 'Desc 1', milestone: null },
      ],
      modelUsed: 'anthropic/claude-opus-4.6',
    });
    mockStorage.finalizeGeneratingPlan.mockResolvedValue({
      plan: {
        id: 700,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
      },
      tasks: [
        {
          id: 901,
          planId: 700,
          brainliftId: 7,
          scheduledDate: '2026-04-21',
          weekNumber: 1,
          dayInWeek: 1,
          title: 'Task 1',
          description: 'Desc 1',
          milestone: null,
        },
      ],
    });

    const result = await generateSprintPlanNow({
      brainliftId: 7,
      userId: 'user-1',
      localDate: '2026-04-21',
    });

    expect(mockGenerateSprintPlan).toHaveBeenCalledWith(expect.objectContaining({
      brainliftId: 7,
      localDate: '2026-04-21',
      diagnosis: expect.objectContaining({
        goalRaw: 'Ship sprint workflows inside native chat.',
      }),
    }));
    expect(result.plan).toEqual(expect.objectContaining({
      id: 700,
      status: 'active',
      taskCount: 1,
      completedTaskCount: 0,
    }));
    expect(result.tasks).toHaveLength(1);
  });

  it('marks the plan failed when synchronous generation throws', async () => {
    const { generateSprintPlanNow } = await import('../sprint');
    mockStorage.getCurrentPlan.mockResolvedValue(null);
    mockStorage.createGeneratingPlan.mockResolvedValue({
      id: 800,
      startDate: '2026-04-21',
      endDate: '2026-05-30',
      status: 'generating',
      generationError: null,
    });
    mockStorage.getSprintPlanContext.mockResolvedValue({
      brainlift: {
        id: 7,
        title: 'Scope Breaker',
        description: 'Build a native chat sprint tool surface.',
        displayPurpose: null,
      },
      creator: {
        userId: 'user-1',
        email: 'owner@example.com',
        name: 'Owner',
      },
      experts: [],
      spovs: [],
      sources: [],
    });
    mockGenerateSprintPlan.mockRejectedValue(new Error('All models failed'));

    await expect(generateSprintPlanNow({
      brainliftId: 7,
      userId: 'user-1',
      localDate: '2026-04-21',
    })).rejects.toThrow('All models failed');

    expect(mockStorage.markPlanGenerationFailed).toHaveBeenCalledWith({
      planId: 800,
      brainliftId: 7,
      errorMessage: 'All models failed',
    });
  });
});

describe('sprint service deliverables', () => {
  it('creates a deliverable, syncs Drive folders, and returns the doc url', async () => {
    const { createSprintDeliverable } = await import('../sprint');
    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      planId: 10,
      brainliftId: 7,
      scheduledDate: '2026-04-21',
      weekNumber: 1,
      dayInWeek: 1,
      title: 'Task 1',
      description: 'Desc 1',
      milestone: null,
      isComplete: false,
      isPastDue: false,
      deliverable: null,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
      },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);
    mockStorage.listPlans.mockResolvedValue([
      {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
        gdriveFolderId: null,
      },
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

    const result = await createSprintDeliverable({
      brainlift: {
        id: 7,
        title: 'Scope Breaker',
        gdriveRootFolderId: null,
      },
      userId: 'user-1',
      taskId: 42,
      title: 'Deliverable 1',
      markdown: '# Draft',
      sourceSurface: 'ui',
    });

    expect(mockDriveService.syncRootFolderEditors).toHaveBeenCalledWith('root-1', [
      'owner@example.com',
      'editor@example.com',
      'guide@example.com',
    ]);
    expect(mockStorage.createDeliverable).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 42,
      brainliftId: 7,
      sourceSurface: 'ui',
      createdByUserId: 'user-1',
    }));
    expect(result).toEqual({ docUrl: 'https://docs.google.com/document/d/doc-1/edit' });
  });

  it('cleans up a newly created doc when deliverable persistence conflicts', async () => {
    const { createSprintDeliverable } = await import('../sprint');
    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      planId: 10,
      brainliftId: 7,
      scheduledDate: '2026-04-21',
      weekNumber: 1,
      dayInWeek: 1,
      title: 'Task 1',
      description: 'Desc 1',
      milestone: null,
      isComplete: false,
      isPastDue: false,
      deliverable: null,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
      },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);
    mockStorage.listPlans.mockResolvedValue([
      {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
        gdriveFolderId: null,
      },
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
    mockDriveService.deleteGoogleDoc.mockResolvedValue(true);
    mockStorage.createDeliverable.mockRejectedValue(
      new MockSprintStorageConflictError('A deliverable already exists for this task'),
    );

    await expect(createSprintDeliverable({
      brainlift: {
        id: 7,
        title: 'Scope Breaker',
        gdriveRootFolderId: null,
      },
      userId: 'user-1',
      taskId: 42,
      title: 'Deliverable 1',
      markdown: '# Draft',
      sourceSurface: 'ui',
    })).rejects.toThrow('A deliverable already exists for this task');

    expect(mockDriveService.deleteGoogleDoc).toHaveBeenCalledWith('doc-1');
  });

  it('updates deliverables in place and optionally stamps a source surface', async () => {
    const { updateSprintDeliverable } = await import('../sprint');
    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
      },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue({
      id: 77,
      docFileId: 'doc-77',
      docUrl: 'https://docs.google.com/document/d/doc-77/edit',
    });

    const result = await updateSprintDeliverable({
      brainliftId: 7,
      taskId: 42,
      markdown: '# Updated',
      sourceSurface: 'mcp',
    });

    expect(mockDriveService.replaceGoogleDocFromMarkdown).toHaveBeenCalledWith('doc-77', '# Updated');
    expect(mockSetDeliverableSourceSurface).toHaveBeenCalledWith(77, 7, 'mcp');
    expect(result).toEqual({ docUrl: 'https://docs.google.com/document/d/doc-77/edit' });
  });

  it('throws not found when reading a missing deliverable', async () => {
    const { readSprintDeliverable } = await import('../sprint');
    mockStorage.getTaskForBrainlift.mockResolvedValue({
      id: 42,
      plan: {
        id: 10,
        startDate: '2026-04-21',
        endDate: '2026-05-30',
        status: 'active',
      },
    });
    mockStorage.getDeliverableByTaskId.mockResolvedValue(null);

    await expect(readSprintDeliverable({
      brainliftId: 7,
      taskId: 42,
    })).rejects.toBeInstanceOf(NotFoundError);
  });
});
