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

  it('requires a bound brainlift at build time', async () => {
    const { buildSecondBrainChatTools } = await import('../second-brain');

    expect(() => buildSecondBrainChatTools(authContext, {
      conversationId: 42,
      brainliftId: null,
      brainlift: null,
    })).toThrow('A research project must be bound');
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
