import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockStorage,
  mockSprintService,
} = vi.hoisted(() => ({
  mockStorage: {
    getBrainliftBySlug: vi.fn(),
    canAccessBrainlift: vi.fn(),
    canModifyBrainlift: vi.fn(),
  },
  mockSprintService: {
    generateSprintPlanNow: vi.fn(),
    getCurrentSprintPlan: vi.fn(),
    listSprintTasks: vi.fn(),
    getSprintTaskOrThrow: vi.fn(),
    createSprintDeliverable: vi.fn(),
    readSprintDeliverable: vi.fn(),
    updateSprintDeliverable: vi.fn(),
    listSprintDeliverables: vi.fn(),
  },
}));

vi.mock('../../../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../../../services/sprint', () => mockSprintService);

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getBrainliftBySlug.mockResolvedValue({
    id: 7,
    slug: 'scope-breaker',
    title: 'Scope Breaker',
    gdriveRootFolderId: null,
    createdByUserId: 'user-1',
  });
  mockStorage.canAccessBrainlift.mockResolvedValue(true);
  mockStorage.canModifyBrainlift.mockResolvedValue(true);
});

const authContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

describe('buildSprintChatTools', () => {
  it('registers the full native sprint tool surface', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });

    expect(Object.keys(tools)).toEqual([
      'generate_plan',
      'get_plan',
      'list_tasks',
      'get_task',
      'save_deliverable',
      'read_deliverable',
      'update_deliverable',
      'list_deliverables',
    ]);
  });

  it('runs generate_plan with modify access and forwards optional diagnosis fields', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.generateSprintPlanNow.mockResolvedValue({
      plan: { id: 10, status: 'active', taskCount: 1, completedTaskCount: 0 },
      tasks: [{ id: 1 }],
    });

    const result = await tools.generate_plan.execute(
      {
        brainliftSlug: 'scope-breaker',
        localDate: '2026-04-21',
        goalRaw: 'Ship the native chat sprint tools.',
        currentState: 'Routes exist, tools do not.',
      },
      { toolCallId: 'tc1', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockStorage.canModifyBrainlift).toHaveBeenCalled();
    expect(mockSprintService.generateSprintPlanNow).toHaveBeenCalledWith({
      brainliftId: 7,
      userId: 'user-1',
      localDate: '2026-04-21',
      diagnosis: {
        goalRaw: 'Ship the native chat sprint tools.',
        currentState: 'Routes exist, tools do not.',
      },
    });
    expect(result).toEqual({
      plan: { id: 10, status: 'active', taskCount: 1, completedTaskCount: 0 },
      tasks: [{ id: 1 }],
    });
  });

  it('forwards read filters for list_tasks after access validation', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.listSprintTasks.mockResolvedValue([{ id: 42, isPastDue: true }]);

    const result = await tools.list_tasks.execute(
      {
        brainliftSlug: 'scope-breaker',
        includePastDue: true,
        localDate: '2026-04-21',
        state: 'incomplete',
      },
      { toolCallId: 'tc2', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalled();
    expect(mockSprintService.listSprintTasks).toHaveBeenCalledWith(7, {
      date: undefined,
      week: undefined,
      state: 'incomplete',
      includePastDue: true,
      localDate: '2026-04-21',
    });
    expect(result).toEqual([{ id: 42, isPastDue: true }]);
  });

  it('creates deliverables through the shared sprint service using ui source semantics', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.createSprintDeliverable.mockResolvedValue({
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });

    const result = await tools.save_deliverable.execute(
      {
        brainliftSlug: 'scope-breaker',
        taskId: 42,
        title: 'Deliverable 1',
        markdown: '# Draft',
      },
      { toolCallId: 'tc3', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockSprintService.createSprintDeliverable).toHaveBeenCalledWith({
      brainlift: expect.objectContaining({
        id: 7,
        title: 'Scope Breaker',
      }),
      userId: 'user-1',
      taskId: 42,
      title: 'Deliverable 1',
      markdown: '# Draft',
      sourceSurface: 'ui',
    });
    expect(result).toEqual({
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
  });

  it('returns not found when the brainlift is outside the caller scope', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockStorage.canAccessBrainlift.mockResolvedValue(false);

    await expect(tools.get_plan.execute(
      { brainliftSlug: 'scope-breaker' },
      { toolCallId: 'tc4', messages: [], abortSignal: new AbortController().signal },
    )).rejects.toThrow('Brainlift not found');
  });
});
