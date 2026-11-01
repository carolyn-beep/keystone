import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proposeResearchRunInputSchema } from '@shared/chat-research-stream';

const {
  mockHasResearchJobPending,
  mockGetActiveRunIdForBrainlift,
  mockStreamText,
  mockGenerateObject,
  mockGenerateText,
} = vi.hoisted(() => ({
  mockHasResearchJobPending: vi.fn(),
  mockGetActiveRunIdForBrainlift: vi.fn(),
  mockStreamText: vi.fn(),
  mockGenerateObject: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock('../../../../storage', () => ({
  storage: {
    hasResearchJobPending: (...args: unknown[]) => mockHasResearchJobPending(...args),
    getActiveRunIdForBrainlift: (...args: unknown[]) => mockGetActiveRunIdForBrainlift(...args),
  },
}));

// Spy on the AI SDK module so we can prove `execute` never reaches an LLM.
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    streamText: (...args: unknown[]) => mockStreamText(...args),
    generateObject: (...args: unknown[]) => mockGenerateObject(...args),
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  };
});

const toolContext = {
  toolCallId: 'tool-call-propose-1',
  messages: [],
  abortSignal: new AbortController().signal,
};

const validRunRequest = {
  topic: 'Carmack on AI compilers',
  angles: ['engineering side', 'policy framing'],
  preferredTypes: ['Podcast', 'Podcast', 'AcademicPaper', 'AcademicPaper', 'Video'] as const,
  slotOverrides: [
    { type: 'Podcast' as const, focus: 'Carmack Lex Fridman interviews' },
    { type: 'AcademicPaper' as const, focus: 'compiler superoptimization 2024+' },
  ],
  notes: 'lean recent, post-2022 only',
};

describe('buildResearchStreamChatTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FR1 exposes a single propose_research_run tool with non-empty description and the spec 01 input schema', async () => {
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });

    expect(Object.keys(tools)).toEqual(['propose_research_run']);
    const tool = tools.propose_research_run as {
      description: string;
      inputSchema: unknown;
      execute: unknown;
    };
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.inputSchema).toBe(proposeResearchRunInputSchema);
    expect(typeof tool.execute).toBe('function');
  });

  it('FR1 returns the validated RunRequest verbatim when no job is pending', async () => {
    mockHasResearchJobPending.mockResolvedValue(false);
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const execute = (tools.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    const result = await execute(validRunRequest, toolContext);

    expect(mockHasResearchJobPending).toHaveBeenCalledWith(42);
    expect(mockGetActiveRunIdForBrainlift).not.toHaveBeenCalled();
    expect(result).toEqual({ blocked: false, runRequest: validRunRequest });
  });

  it('FR1 returns the blocked variant with existingRunId when a job is pending', async () => {
    mockHasResearchJobPending.mockResolvedValue(true);
    mockGetActiveRunIdForBrainlift.mockResolvedValue(99);
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const execute = (tools.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    const result = await execute(validRunRequest, toolContext);

    expect(mockHasResearchJobPending).toHaveBeenCalledWith(42);
    expect(mockGetActiveRunIdForBrainlift).toHaveBeenCalledWith(42);
    expect(result).toEqual({ blocked: true, existingRunId: 99 });
  });

  it('FR1 returns existingRunId: 0 (graceful degradation) when the active-run lookup returns null', async () => {
    mockHasResearchJobPending.mockResolvedValue(true);
    mockGetActiveRunIdForBrainlift.mockResolvedValue(null);
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const execute = (tools.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    const result = await execute(validRunRequest, toolContext);

    expect(result).toEqual({ blocked: true, existingRunId: 0 });
  });

  it('FR1 closes over the factory brainliftId — distinct calls do not leak across brainlifts', async () => {
    mockHasResearchJobPending.mockResolvedValue(false);
    const { buildResearchStreamChatTools } = await import('../research-stream');

    const toolsForBrainlift42 = buildResearchStreamChatTools({ brainliftId: 42 });
    const toolsForBrainlift7 = buildResearchStreamChatTools({ brainliftId: 7 });

    const execute42 = (toolsForBrainlift42.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;
    const execute7 = (toolsForBrainlift7.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    await execute42(validRunRequest, toolContext);
    await execute7(validRunRequest, toolContext);

    expect(mockHasResearchJobPending).toHaveBeenNthCalledWith(1, 42);
    expect(mockHasResearchJobPending).toHaveBeenNthCalledWith(2, 7);
  });

  it('FR1 inputSchema reference equals proposeResearchRunInputSchema and rejects invalid input', async () => {
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const tool = tools.propose_research_run as { inputSchema: typeof proposeResearchRunInputSchema };

    // Wiring assertion: same schema identity.
    expect(tool.inputSchema).toBe(proposeResearchRunInputSchema);

    // Sanity: invalid input would be rejected by the schema (delegated detail to spec 01).
    const invalid = tool.inputSchema.safeParse({ topic: '' });
    expect(invalid.success).toBe(false);
  });

  it('FR1 execute issues NO LLM call (streamText/generateObject/generateText all untouched)', async () => {
    mockHasResearchJobPending.mockResolvedValue(false);
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const execute = (tools.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    await execute(validRunRequest, toolContext);
    await execute(validRunRequest, toolContext);

    expect(mockStreamText).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it('FR1 also short-circuits with no LLM call on the blocked path', async () => {
    mockHasResearchJobPending.mockResolvedValue(true);
    mockGetActiveRunIdForBrainlift.mockResolvedValue(7);
    const { buildResearchStreamChatTools } = await import('../research-stream');
    const tools = buildResearchStreamChatTools({ brainliftId: 42 });
    const execute = (tools.propose_research_run as { execute: (input: unknown, ctx: unknown) => Promise<unknown> }).execute;

    await execute(validRunRequest, toolContext);

    expect(mockStreamText).not.toHaveBeenCalled();
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
