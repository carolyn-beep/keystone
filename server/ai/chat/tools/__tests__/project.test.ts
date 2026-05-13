import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDb, mockStorage } = vi.hoisted(() => ({
  mockDb: {
    transaction: vi.fn(),
  },
  mockStorage: {
    setConversationBrainlift: vi.fn(),
    getConversationBrainlift: vi.fn(),
    getBrainliftBySlug: vi.fn(),
  },
}));

vi.mock('../../../../db', () => ({
  db: mockDb,
}));

vi.mock('../../../../storage', () => ({
  storage: mockStorage,
}));

const authContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

const conversation = {
  conversationId: 42,
  brainliftId: null,
  brainlift: null,
};

function standardValidate(tool: unknown, value: unknown) {
  const candidate = tool as any;
  const result = candidate['~standard']?.validate?.(value)
    ?? candidate.inputSchema?.['~standard']?.validate?.(value);
  if (result) {
    return result;
  }

  try {
    return candidate.inputSchema?.parse?.(value);
  } catch (error) {
    return { issues: (error as { issues?: unknown[] }).issues ?? [error] };
  }
}

function createTransactionHarness(options: { failConversationUpdate?: boolean } = {}) {
  const committedBrainlifts: unknown[] = [];
  const insertedBrainlifts: unknown[] = [];
  const updates: unknown[] = [];

  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn((value) => ({
        returning: vi.fn(async () => {
          const brainlift = {
            id: 101,
            slug: value.slug,
            title: value.title,
            phase: value.phase,
          };
          insertedBrainlifts.push(brainlift);
          return [brainlift];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((value) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updates.push(value);
            return options.failConversationUpdate
              ? []
              : [{ id: 42, brainliftId: value.brainliftId }];
          }),
        })),
      })),
    })),
  };

  mockDb.transaction.mockImplementation(async (callback) => {
    const result = await callback(tx);
    committedBrainlifts.push(...insertedBrainlifts);
    return result;
  });

  return { committedBrainlifts, insertedBrainlifts, updates, tx };
}

describe('buildProjectChatTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an empty create_blank_project title at the schema boundary', async () => {
    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);
    const result = standardValidate(tools.create_blank_project, { title: '   ' });

    expect(result && typeof result === 'object' && 'issues' in result).toBe(true);
  });

  it('create_blank_project creates a research brainlift and binds the conversation in one transaction', async () => {
    const harness = createTransactionHarness();
    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);

    const result = await (tools.create_blank_project as any).execute({
      title: ' Battery Chemistry ',
      description: '  Learn how lithium batteries work  ',
    });

    expect(result).toEqual({
      brainliftId: 101,
      slug: 'battery-chemistry',
      title: 'Battery Chemistry',
      phase: 'research',
    });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(harness.insertedBrainlifts).toEqual([
      expect.objectContaining({
        id: 101,
        slug: 'battery-chemistry',
        title: 'Battery Chemistry',
        phase: 'research',
      }),
    ]);
    expect(harness.updates).toEqual([
      expect.objectContaining({ brainliftId: 101 }),
    ]);
  });

  it('create_blank_project rolls back when conversation binding fails', async () => {
    const harness = createTransactionHarness({ failConversationUpdate: true });
    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);

    await expect((tools.create_blank_project as any).execute({
      title: 'Orphan Risk',
    })).rejects.toThrow('Conversation not found');

    expect(harness.insertedBrainlifts).toHaveLength(1);
    expect(harness.committedBrainlifts).toHaveLength(0);
  });

  it('rejects invalid change_conversation_project ids at the schema boundary', async () => {
    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);
    const result = standardValidate(tools.change_conversation_project, { brainliftId: 0 });

    expect(result && typeof result === 'object' && 'issues' in result).toBe(true);
  });

  it('rejects change_conversation_project calls with neither slug nor brainliftId', async () => {
    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);
    const result = standardValidate(tools.change_conversation_project, {});

    expect(result && typeof result === 'object' && 'issues' in result).toBe(true);
  });

  it('change_conversation_project accepts a slug (the canonical id surfaced by list_brainlifts)', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      id: 7,
      slug: 'battery-chemistry',
      title: 'Battery Chemistry',
      phase: 'research',
    });
    mockStorage.setConversationBrainlift.mockResolvedValue({
      id: 42,
      brainliftId: 7,
    });
    mockStorage.getConversationBrainlift.mockResolvedValue({
      conversationId: 42,
      brainliftId: 7,
      brainlift: {
        id: 7,
        slug: 'battery-chemistry',
        phase: 'research',
      },
    });

    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);
    const result = await (tools.change_conversation_project as any).execute({
      slug: 'battery-chemistry',
    });

    expect(mockStorage.getBrainliftBySlug).toHaveBeenCalledWith('battery-chemistry');
    expect(mockStorage.setConversationBrainlift).toHaveBeenCalledWith(42, 7, 'user-1');
    expect(result).toEqual({
      conversationId: 42,
      brainliftId: 7,
      slug: 'battery-chemistry',
      phase: 'research',
    });
  });

  it('change_conversation_project surfaces a NotFoundError when the slug does not exist', async () => {
    mockStorage.getBrainliftBySlug.mockResolvedValue(undefined);

    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);

    await expect((tools.change_conversation_project as any).execute({
      slug: 'does-not-exist',
    })).rejects.toThrow('No brainlift found with slug "does-not-exist"');

    expect(mockStorage.setConversationBrainlift).not.toHaveBeenCalled();
  });

  it('change_conversation_project still accepts a numeric brainliftId fallback', async () => {
    mockStorage.setConversationBrainlift.mockResolvedValue({
      id: 42,
      brainliftId: 7,
    });
    mockStorage.getConversationBrainlift.mockResolvedValue({
      conversationId: 42,
      brainliftId: 7,
      brainlift: {
        id: 7,
        slug: 'battery-chemistry',
        phase: 'research',
      },
    });

    const { buildProjectChatTools } = await import('../project');
    const tools = buildProjectChatTools(authContext, conversation);
    const result = await (tools.change_conversation_project as any).execute({ brainliftId: 7 });

    expect(mockStorage.getBrainliftBySlug).not.toHaveBeenCalled();
    expect(mockStorage.setConversationBrainlift).toHaveBeenCalledWith(42, 7, 'user-1');
    expect(result).toEqual({
      conversationId: 42,
      brainliftId: 7,
      slug: 'battery-chemistry',
      phase: 'research',
    });
  });
});
