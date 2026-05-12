import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBuildDefaultChatAuthContext,
  mockGetBrainliftTemplatePayload,
  mockListBrainliftsForAuthContext,
  mockGetBrainliftStatusForAuthContext,
  mockGetBrainliftAssessmentForAuthContext,
  mockBuildGradingQueuedResponse,
} = vi.hoisted(() => ({
  mockBuildDefaultChatAuthContext: vi.fn(),
  mockGetBrainliftTemplatePayload: vi.fn(),
  mockListBrainliftsForAuthContext: vi.fn(),
  mockGetBrainliftStatusForAuthContext: vi.fn(),
  mockGetBrainliftAssessmentForAuthContext: vi.fn(),
  mockBuildGradingQueuedResponse: vi.fn(),
}));

const { mockProcessGradeRequest } = vi.hoisted(() => ({
  mockProcessGradeRequest: vi.fn(),
}));

vi.mock('../../../services/brainlift-grading-surface', () => ({
  buildDefaultChatAuthContext: (...args: unknown[]) => mockBuildDefaultChatAuthContext(...args),
  getBrainliftTemplatePayload: (...args: unknown[]) => mockGetBrainliftTemplatePayload(...args),
  listBrainliftsForAuthContext: (...args: unknown[]) => mockListBrainliftsForAuthContext(...args),
  getBrainliftStatusForAuthContext: (...args: unknown[]) => mockGetBrainliftStatusForAuthContext(...args),
  getBrainliftAssessmentForAuthContext: (...args: unknown[]) => mockGetBrainliftAssessmentForAuthContext(...args),
  buildGradingQueuedResponse: (...args: unknown[]) => mockBuildGradingQueuedResponse(...args),
}));

vi.mock('../../../services/internal-grading', () => ({
  processGradeRequest: (...args: unknown[]) => mockProcessGradeRequest(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildDefaultChatAuthContext.mockImplementation((userId: string) => ({
    userId,
    role: 'user',
    isAdmin: false,
  }));
});

function createToolContext() {
  return {
    toolCallId: 'tool-1',
    messages: [],
    abortSignal: new AbortController().signal,
  };
}

describe('buildChatGradingTools', () => {
  it('exposes the four worker-compatible tool names', async () => {
    const { buildChatGradingTools } = await import('../tools/grading');

    const tools = buildChatGradingTools('user-1');

    expect(Object.keys(tools).sort()).toEqual([
      'create_brainlift',
      'get_brainlift_assessment',
      'get_template',
      'list_brainlifts',
    ]);
  });

  it('get_template returns the shared template payload', async () => {
    mockGetBrainliftTemplatePayload.mockResolvedValue({
      template: '# Template',
      format: 'markdown',
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    const result = await tools.get_template.execute({}, createToolContext());

    expect(mockGetBrainliftTemplatePayload).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      template: '# Template',
      format: 'markdown',
    });
  });

  it('create_brainlift trims title overrides, delegates grading, and shapes the queued response', async () => {
    mockProcessGradeRequest.mockResolvedValue({
      slug: 'alpha',
      brainliftId: 42,
    });
    mockBuildGradingQueuedResponse.mockReturnValue({
      slug: 'alpha',
      brainliftId: 42,
      status: 'grading',
      retryAfter: 30,
      message: 'Brainlift created. Use get_brainlift_assessment to check results.',
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    const result = await tools.create_brainlift.execute(
      {
        markdown: '# Alpha',
        title: '  Alpha Override  ',
      },
      createToolContext(),
    );

    expect(mockProcessGradeRequest).toHaveBeenCalledWith(
      '# Alpha',
      'Alpha Override',
      'user-1',
    );
    expect(mockBuildGradingQueuedResponse).toHaveBeenCalledWith({
      slug: 'alpha',
      brainliftId: 42,
    });
    expect(result).toEqual({
      slug: 'alpha',
      brainliftId: 42,
      status: 'grading',
      retryAfter: 30,
      message: 'Brainlift created. Use get_brainlift_assessment to check results.',
    });
  });

  it('create_brainlift ignores blank title overrides', async () => {
    mockProcessGradeRequest.mockResolvedValue({
      slug: 'alpha',
      brainliftId: 42,
    });
    mockBuildGradingQueuedResponse.mockReturnValue({
      slug: 'alpha',
      brainliftId: 42,
      status: 'grading',
      retryAfter: 30,
      message: 'queued',
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    await tools.create_brainlift.execute(
      {
        markdown: '# Alpha',
        title: '   ',
      },
      createToolContext(),
    );

    expect(mockProcessGradeRequest).toHaveBeenCalledWith(
      '# Alpha',
      undefined,
      'user-1',
    );
  });

  it('list_brainlifts closes over the authenticated user context', async () => {
    mockListBrainliftsForAuthContext.mockResolvedValue({
      brainlifts: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
      },
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    const result = await tools.list_brainlifts.execute(
      {
        page: 1,
        pageSize: 10,
      },
      createToolContext(),
    );

    expect(mockBuildDefaultChatAuthContext).toHaveBeenCalledWith('user-1');
    expect(mockListBrainliftsForAuthContext).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        role: 'user',
        isAdmin: false,
      },
      {
        page: 1,
        pageSize: 10,
      },
    );
    expect(result.pagination.totalItems).toBe(0);
  });

  it('get_brainlift_assessment uses the lightweight status path when statusOnly=true', async () => {
    mockGetBrainliftStatusForAuthContext.mockResolvedValue({
      slug: 'alpha',
      title: 'Alpha',
      status: 'grading',
      progress: {
        dok1: { total: 1, graded: 0, pending: 1, error: 0 },
        dok2: { total: 0, graded: 0, pending: 0, error: 0 },
        dok3: { total: 0, graded: 0, pending: 0, error: 0 },
        dok4: { total: 0, graded: 0, pending: 0, error: 0 },
      },
      score: {
        overall: null,
        dok1Mean: null,
        dok2Mean: null,
        dok3Mean: null,
        dok4Mean: null,
      },
      retryAfter: 15,
      createdAt: '2026-04-04T12:00:00.000Z',
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    const result = await tools.get_brainlift_assessment.execute(
      {
        slug: 'alpha',
        dok: 1,
        statusOnly: true,
      },
      createToolContext(),
    );

    expect(mockGetBrainliftStatusForAuthContext).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        role: 'user',
        isAdmin: false,
      },
      'alpha',
    );
    expect(mockGetBrainliftAssessmentForAuthContext).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        slug: 'alpha',
        status: 'grading',
        retryAfter: 15,
      }),
    );
  });

  it('get_brainlift_assessment forwards filters and detail mode in item mode', async () => {
    mockGetBrainliftAssessmentForAuthContext.mockResolvedValue({
      slug: 'alpha',
      dok: 4,
      status: 'complete',
      items: [],
      pagination: {
        page: 2,
        pageSize: 5,
        totalItems: 8,
        totalPages: 2,
      },
    });

    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1');

    const result = await tools.get_brainlift_assessment.execute(
      {
        slug: 'alpha',
        dok: 4,
        page: 2,
        pageSize: 5,
        itemId: 99,
        sortBy: 'score',
        order: 'asc',
        status: 'graded',
        detail: 'full',
      },
      createToolContext(),
    );

    expect(mockGetBrainliftAssessmentForAuthContext).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        role: 'user',
        isAdmin: false,
      },
      {
        slug: 'alpha',
        dok: 4,
        page: 2,
        pageSize: 5,
        itemId: 99,
        sortBy: 'score',
        order: 'asc',
        status: 'graded',
        detail: 'full',
      },
    );
    expect(result.pagination.totalItems).toBe(8);
  });

  it('validates dok with the worker-compatible schema', async () => {
    const { buildChatGradingTools } = await import('../tools/grading');
    const tools = buildChatGradingTools('user-1') as any;

    const parsed = tools.get_brainlift_assessment.inputSchema.safeParse({
      slug: 'alpha',
      dok: 5,
    });

    expect(parsed.success).toBe(false);
  });
});
