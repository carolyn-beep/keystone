import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    createSource: vi.fn(),
    getSourcesByBrainlift: vi.fn(),
    updateSourceForBrainlift: vi.fn(),
    deleteSourceForBrainlift: vi.fn(),
    createNote: vi.fn(),
    updateNoteForBrainlift: vi.fn(),
    deleteNoteForBrainlift: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    listSources: vi.fn(),
    listNotes: vi.fn(),
    listCategories: vi.fn(),
  },
}));

vi.mock('../../../../storage', () => ({
  storage: mockStorage,
}));

const authContext = {
  userId: 'user-1',
  role: 'user',
  isAdmin: false,
} as const;

const boundConversation = {
  conversationId: 42,
  brainliftId: 7,
  brainlift: { id: 7, phase: 'research' } as any,
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

function uniqueViolation() {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
}

describe('buildSecondBrainChatTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds tools unbound (agent sees them with a runtime guard)', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');

    const tools = buildSecondBrainChatTools(authContext, {
      conversationId: 42,
      brainliftId: null,
      brainlift: null,
    });

    // Tools exist in the registry so the agent is aware of them from turn 1.
    expect(tools).toHaveProperty('save_source');
    expect(tools).toHaveProperty('save_note');
    expect(tools).toHaveProperty('create_category');
    expect(tools).toHaveProperty('list_sources');
    expect(tools).toHaveProperty('list_notes');
    expect(tools).toHaveProperty('list_categories');

    // But calling without a bound project errors with a directive message.
    await expect(
      (tools.save_source as any).execute({
        title: 'Battery Paper',
        url: 'https://example.com/battery',
        author: 'example.com',
        categoryId: 3,
      }),
    ).rejects.toThrow('create_blank_project');
    await expect((tools.list_sources as any).execute({})).rejects.toThrow('create_blank_project');
    await expect((tools.list_categories as any).execute({})).rejects.toThrow('create_blank_project');
  });

  it('save_source persists source fields through IDOR-safe storage', async () => {
    mockStorage.createSource.mockResolvedValue({
      id: 11,
      title: 'Battery Paper',
      url: 'https://example.com/battery',
      author: 'example.com',
      categoryId: 3,
    });

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.save_source as any).execute({
      title: 'Battery Paper',
      url: 'https://example.com/battery',
      author: 'example.com',
      categoryId: 3,
      extractedContent: { markdown: 'content' },
    });

    expect(mockStorage.createSource).toHaveBeenCalledWith(7, {
      title: 'Battery Paper',
      url: 'https://example.com/battery',
      author: 'example.com',
      categoryId: 3,
      extractedContent: { markdown: 'content' },
      learningStreamItemId: undefined,
    });
    expect(result).toEqual(expect.objectContaining({ id: 11 }));
  });

  it('save_source returns the existing source on duplicate URL', async () => {
    mockStorage.createSource.mockRejectedValue(uniqueViolation());
    mockStorage.getSourcesByBrainlift.mockResolvedValue([
      {
        id: 12,
        title: 'Existing Battery Paper',
        url: 'https://example.com/battery',
      },
    ]);

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.save_source as any).execute({
      title: 'Battery Paper',
      url: 'https://example.com/battery',
      author: 'example.com',
      categoryId: 3,
    });

    expect(mockStorage.getSourcesByBrainlift).toHaveBeenCalledWith(7);
    expect(result).toEqual(expect.objectContaining({ id: 12 }));
  });

  it('save_source rejects invalid source input at the schema boundary', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = standardValidate(tools.save_source, {
      title: '',
      url: 'not-a-url',
      author: '',
      categoryId: 0,
    });

    expect(result && typeof result === 'object' && 'issues' in result).toBe(true);
  });

  it('save_note creates linked or free-form notes via storage', async () => {
    mockStorage.createNote.mockResolvedValueOnce({ id: 21, sourceId: 11 });
    mockStorage.createNote.mockResolvedValueOnce({ id: 22, sourceId: null });

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);

    await (tools.save_note as any).execute({
      content: 'This changed how I think about cathodes.',
      sourceId: 11,
      categoryId: 3,
    });
    await (tools.save_note as any).execute({
      content: 'Random thought from the student.',
    });

    expect(mockStorage.createNote).toHaveBeenNthCalledWith(1, 7, {
      content: 'This changed how I think about cathodes.',
      sourceId: 11,
      categoryId: 3,
    });
    expect(mockStorage.createNote).toHaveBeenNthCalledWith(2, 7, {
      content: 'Random thought from the student.',
      sourceId: undefined,
      categoryId: undefined,
    });
  });

  it('create_category applies optional sortOrder after creation', async () => {
    mockStorage.createCategory.mockResolvedValue({ id: 31, name: 'Chemistry' });
    mockStorage.updateCategory.mockResolvedValue({ id: 31, name: 'Chemistry', sortOrder: 2 });

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.create_category as any).execute({
      name: 'Chemistry',
      sortOrder: 2,
    });

    expect(mockStorage.createCategory).toHaveBeenCalledWith(7, 'Chemistry');
    expect(mockStorage.updateCategory).toHaveBeenCalledWith(31, 7, { sortOrder: 2 });
    expect(result).toEqual({ id: 31, name: 'Chemistry', sortOrder: 2 });
  });

  it('edit schemas reject empty patches', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);

    expect(standardValidate(tools.edit_source, { id: 1, patch: {} }))
      .toEqual(expect.objectContaining({ issues: expect.any(Array) }));
    expect(standardValidate(tools.edit_note, { id: 1, patch: {} }))
      .toEqual(expect.objectContaining({ issues: expect.any(Array) }));
    expect(standardValidate(tools.edit_category, { id: 1, patch: {} }))
      .toEqual(expect.objectContaining({ issues: expect.any(Array) }));
  });

  it('list_sources strips brainliftId and extractedContent from rows', async () => {
    const createdAt = new Date('2026-05-01T12:00:00Z');
    mockStorage.listSources.mockResolvedValue({
      items: [
        {
          id: 11,
          brainliftId: 7,
          title: 'Battery Paper',
          url: 'https://example.com/battery',
          author: 'example.com',
          categoryId: 3,
          categoryName: 'Chemistry',
          extractedContent: { markdown: 'huge cached blob' },
          learningStreamItemId: null,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      pagination: { page: 1, pageSize: 30, totalItems: 1, hasMore: false },
    });

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.list_sources as any).execute({ q: 'battery', page: 1 });

    expect(mockStorage.listSources).toHaveBeenCalledWith(7, { q: 'battery', page: 1 });
    expect(result).toEqual({
      items: [
        {
          id: 11,
          title: 'Battery Paper',
          url: 'https://example.com/battery',
          author: 'example.com',
          categoryId: 3,
          categoryName: 'Chemistry',
          createdAt: createdAt.toISOString(),
        },
      ],
      pagination: { page: 1, pageSize: 30, totalItems: 1, hasMore: false },
    });
    expect(result.items[0]).not.toHaveProperty('brainliftId');
    expect(result.items[0]).not.toHaveProperty('extractedContent');
  });

  it('list_notes strips brainliftId, forwards filters, and serializes dates', async () => {
    const createdAt = new Date('2026-05-02T09:30:00Z');
    mockStorage.listNotes.mockResolvedValue({
      items: [
        {
          id: 22,
          brainliftId: 7,
          sourceId: 11,
          categoryId: 3,
          content: 'My reflection',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      pagination: { page: 2, pageSize: 30, totalItems: 31, hasMore: false },
    });

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.list_notes as any).execute({
      q: 'reflection',
      page: 2,
      sourceId: 11,
      unlinkedOnly: false,
    });

    expect(mockStorage.listNotes).toHaveBeenCalledWith(7, {
      q: 'reflection',
      page: 2,
      sourceId: 11,
      unlinkedOnly: false,
    });
    expect(result.items[0]).toEqual({
      id: 22,
      content: 'My reflection',
      sourceId: 11,
      categoryId: 3,
      createdAt: createdAt.toISOString(),
    });
    expect(result.items[0]).not.toHaveProperty('brainliftId');
  });

  it('list_categories returns id/name/sortOrder/sourceCount only', async () => {
    mockStorage.listCategories.mockResolvedValue([
      { id: 1, name: 'Chemistry', sortOrder: 0, sourceCount: 4 },
      { id: 2, name: 'Policy', sortOrder: null, sourceCount: 1 },
    ]);

    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);
    const result = await (tools.list_categories as any).execute({});

    expect(mockStorage.listCategories).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      items: [
        { id: 1, name: 'Chemistry', sortOrder: 0, sourceCount: 4 },
        { id: 2, name: 'Policy', sortOrder: null, sourceCount: 1 },
      ],
    });
  });

  it('list tools error at runtime when conversation is unbound, pointing at create_blank_project', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, {
      conversationId: 1,
      brainliftId: null,
      brainlift: null,
    });

    await expect((tools.list_notes as any).execute({})).rejects.toThrow('create_blank_project');
  });

  it('edit and delete operations call brainlift-scoped storage helpers', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');
    const tools = buildSecondBrainChatTools(authContext, boundConversation);

    await (tools.edit_source as any).execute({ id: 11, patch: { title: 'Updated' } });
    await (tools.edit_note as any).execute({ id: 21, patch: { content: 'Updated note' } });
    await (tools.edit_category as any).execute({ id: 31, patch: { name: 'Updated category' } });
    await (tools.delete_source as any).execute({ id: 11 });
    await (tools.delete_note as any).execute({ id: 21 });
    await (tools.delete_category as any).execute({ id: 31 });

    expect(mockStorage.updateSourceForBrainlift).toHaveBeenCalledWith(11, 7, { title: 'Updated' });
    expect(mockStorage.updateNoteForBrainlift).toHaveBeenCalledWith(21, 7, { content: 'Updated note' });
    expect(mockStorage.updateCategory).toHaveBeenCalledWith(31, 7, { name: 'Updated category' });
    expect(mockStorage.deleteSourceForBrainlift).toHaveBeenCalledWith(11, 7);
    expect(mockStorage.deleteNoteForBrainlift).toHaveBeenCalledWith(21, 7);
    expect(mockStorage.deleteCategory).toHaveBeenCalledWith(31, 7);
  });
});
