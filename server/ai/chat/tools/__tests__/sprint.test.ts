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
    listDocumentsForUser: vi.fn(),
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
      'list_documents',
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

  it('creates task deliverables through the shared sprint service using ui source semantics', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.createSprintDeliverable.mockResolvedValue({
      id: 12,
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
      id: 12,
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
    });
  });

  it('creates hub documents when save_deliverable omits taskId', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.createSprintDeliverable.mockResolvedValue({
      id: 44,
      docUrl: 'https://docs.google.com/document/d/hub-doc/edit',
    });

    const result = await tools.save_deliverable.execute(
      {
        brainliftSlug: 'scope-breaker',
        title: 'Hub note',
        markdown: '',
      },
      { toolCallId: 'tc-save-hub', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockSprintService.createSprintDeliverable).toHaveBeenCalledWith({
      brainlift: expect.objectContaining({
        id: 7,
        title: 'Scope Breaker',
      }),
      userId: 'user-1',
      taskId: undefined,
      title: 'Hub note',
      markdown: '',
      sourceSurface: 'ui',
    });
    expect(result).toEqual({
      id: 44,
      docUrl: 'https://docs.google.com/document/d/hub-doc/edit',
    });
  });

  it('validates save_deliverable title while allowing empty markdown', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    const schema = tools.save_deliverable.inputSchema as {
      safeParse: (input: unknown) => { success: boolean };
    };

    expect(schema.safeParse({
      brainliftSlug: 'scope-breaker',
      title: '',
      markdown: '',
    }).success).toBe(false);
    expect(schema.safeParse({
      brainliftSlug: 'scope-breaker',
      title: 'Hub note',
      markdown: '',
    }).success).toBe(true);
  });

  it('reads and updates deliverables by deliverableId selector', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.readSprintDeliverable.mockResolvedValue({
      title: 'Hub note',
      contentMarkdown: '# Body',
      docUrl: 'https://docs.google.com/document/d/hub-doc/edit',
    });
    mockSprintService.updateSprintDeliverable.mockResolvedValue({
      id: 44,
      docUrl: 'https://docs.google.com/document/d/hub-doc/edit',
    });

    await tools.read_deliverable.execute(
      { brainliftSlug: 'scope-breaker', deliverableId: 44 },
      { toolCallId: 'tc-read-id', messages: [], abortSignal: new AbortController().signal },
    );
    const updateResult = await tools.update_deliverable.execute(
      { brainliftSlug: 'scope-breaker', deliverableId: 44, markdown: '# Revised' },
      { toolCallId: 'tc-update-id', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockSprintService.readSprintDeliverable).toHaveBeenCalledWith({
      brainliftId: 7,
      deliverableId: 44,
    });
    expect(mockSprintService.updateSprintDeliverable).toHaveBeenCalledWith({
      brainliftId: 7,
      deliverableId: 44,
      markdown: '# Revised',
      sourceSurface: 'ui',
    });
    expect(updateResult).toEqual({
      id: 44,
      docUrl: 'https://docs.google.com/document/d/hub-doc/edit',
    });
  });

  it('rejects ambiguous deliverable selectors before service calls', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });

    await expect(tools.read_deliverable.execute(
      { brainliftSlug: 'scope-breaker', taskId: 5, deliverableId: 44 },
      { toolCallId: 'tc-read-both', messages: [], abortSignal: new AbortController().signal },
    )).rejects.toThrow('Provide exactly one of taskId or deliverableId');

    await expect(tools.update_deliverable.execute(
      { brainliftSlug: 'scope-breaker', markdown: '# Revised' },
      { toolCallId: 'tc-update-neither', messages: [], abortSignal: new AbortController().signal },
    )).rejects.toThrow('Provide exactly one of taskId or deliverableId');

    expect(mockSprintService.readSprintDeliverable).not.toHaveBeenCalled();
    expect(mockSprintService.updateSprintDeliverable).not.toHaveBeenCalled();
  });

  it('lists accessible documents with document filters', async () => {
    const { buildSprintChatTools } = await import('../sprint');
    const tools = buildSprintChatTools({ authContext });
    mockSprintService.listDocumentsForUser.mockResolvedValue({
      documents: [],
      page: 2,
      pageSize: 30,
      total: 0,
    });

    const result = await tools.list_documents.execute(
      {
        brainliftSlug: 'scope-breaker',
        q: 'draft',
        sort: 'title',
        order: 'asc',
        page: 2,
      },
      { toolCallId: 'tc-docs', messages: [], abortSignal: new AbortController().signal },
    );

    expect(mockSprintService.listDocumentsForUser).toHaveBeenCalledWith('user-1', false, {
      brainliftSlug: 'scope-breaker',
      q: 'draft',
      sort: 'title',
      order: 'asc',
      page: 2,
    });
    expect(result).toEqual({
      documents: [],
      page: 2,
      pageSize: 30,
      total: 0,
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
