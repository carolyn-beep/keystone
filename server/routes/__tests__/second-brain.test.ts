import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage, mockExtractContent } = vi.hoisted(() => ({
  mockStorage: {
    getSourcesByBrainlift: vi.fn(),
    getSourceForBrainlift: vi.fn(),
    createSource: vi.fn(),
    updateSourceForBrainlift: vi.fn(),
    deleteSourceForBrainlift: vi.fn(),
    getNotesByBrainlift: vi.fn(),
    getNoteForBrainlift: vi.fn(),
    createNote: vi.fn(),
    updateNoteForBrainlift: vi.fn(),
    deleteNoteForBrainlift: vi.fn(),
    getCategoriesWithCounts: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
  mockExtractContent: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../services/content-extractor', () => ({
  extractContent: (...args: unknown[]) => mockExtractContent(...args),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'research-project' },
    query: {},
    body: {},
    brainlift: {
      id: 7,
      slug: 'research-project',
      phase: 'research',
    },
    authContext: {
      userId: 'user-1',
      isAdmin: false,
    },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.sendStatus = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('second brain source handlers', () => {
  it('listSourcesHandler returns sources and applies categoryId filtering', async () => {
    const { listSourcesHandler } = await import('../second-brain');
    const req = createReq({ query: { categoryId: '3' } });
    const res = createRes();

    mockStorage.getSourcesByBrainlift.mockResolvedValue([
      { id: 1, brainliftId: 7, categoryId: 3, title: 'A' },
      { id: 2, brainliftId: 7, categoryId: 4, title: 'B' },
    ]);

    await listSourcesHandler(req, res);

    expect(mockStorage.getSourcesByBrainlift).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith({
      sources: [{ id: 1, brainliftId: 7, categoryId: 3, title: 'A' }],
    });
  });

  it('getSourceHandler validates numeric IDs and returns 404 for cross-brainlift misses', async () => {
    const { getSourceHandler } = await import('../second-brain');
    const res = createRes();

    await expect(getSourceHandler(createReq({ params: { id: 'abc' } }), res))
      .rejects.toThrow('Invalid source ID');

    mockStorage.getSourceForBrainlift.mockResolvedValue(null);
    await expect(getSourceHandler(createReq({ params: { id: '99' } }), res))
      .rejects.toThrow('Source not found');
  });

  it('createSourceHandler returns existing source on duplicate URL instead of surfacing a conflict', async () => {
    const { createSourceHandler } = await import('../second-brain');
    const req = createReq({
      body: {
        title: 'Duplicate',
        url: 'https://example.com/dup',
        author: 'Researcher',
        categoryId: 3,
      },
    });
    const res = createRes();
    const duplicateError = Object.assign(new Error('duplicate key'), { cause: { code: '23505' } });

    mockStorage.createSource.mockRejectedValue(duplicateError);
    mockStorage.getSourcesByBrainlift.mockResolvedValue([
      { id: 12, brainliftId: 7, url: 'https://example.com/dup', title: 'Existing' },
    ]);

    await createSourceHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      id: 12,
      brainliftId: 7,
      url: 'https://example.com/dup',
      title: 'Existing',
    });
  });

  it('createSourceHandler rejects missing required fields with clear 400 errors', async () => {
    const { createSourceHandler } = await import('../second-brain');

    await expect(createSourceHandler(createReq({ body: { title: 'Only title' } }), createRes()))
      .rejects.toThrow('url is required');

    expect(mockStorage.createSource).not.toHaveBeenCalled();
  });

  it('updateSourceHandler surfaces cross-brainlift categories as bad requests', async () => {
    const { updateSourceHandler } = await import('../second-brain');
    const req = createReq({
      params: { id: '15' },
      body: { categoryId: 123 },
    });
    const res = createRes();

    mockStorage.updateSourceForBrainlift.mockRejectedValue(
      new Error('Category does not belong to this brainlift'),
    );

    await expect(updateSourceHandler(req, res)).rejects.toThrow('Category does not belong to this brainlift');
  });

  it('deleteSourceHandler returns 204 on owned delete and 404 on IDOR miss', async () => {
    const { deleteSourceHandler } = await import('../second-brain');
    const req = createReq({ params: { id: '22' } });
    const res = createRes();

    mockStorage.deleteSourceForBrainlift.mockResolvedValueOnce(true);
    await deleteSourceHandler(req, res);
    expect(res.sendStatus).toHaveBeenCalledWith(204);

    mockStorage.deleteSourceForBrainlift.mockResolvedValueOnce(false);
    await expect(deleteSourceHandler(req, createRes())).rejects.toThrow('Source not found');
  });
});

describe('second brain note handlers', () => {
  it('listNotesHandler parses sourceId filters including sourceId=null', async () => {
    const { listNotesHandler } = await import('../second-brain');
    const res = createRes();

    mockStorage.getNotesByBrainlift.mockResolvedValue([{ id: 1, sourceId: null }]);
    await listNotesHandler(createReq({ query: { sourceId: 'null' } }), res);

    expect(mockStorage.getNotesByBrainlift).toHaveBeenCalledWith(7, { sourceId: null });
    expect(res.json).toHaveBeenCalledWith({ notes: [{ id: 1, sourceId: null }] });
  });

  it('createNoteHandler requires content and passes optional source/category links', async () => {
    const { createNoteHandler } = await import('../second-brain');
    const req = createReq({
      body: { content: 'Student reflection', sourceId: 2, categoryId: 3 },
    });
    const res = createRes();

    mockStorage.createNote.mockResolvedValue({ id: 5, content: 'Student reflection' });

    await createNoteHandler(req, res);

    expect(mockStorage.createNote).toHaveBeenCalledWith(7, {
      content: 'Student reflection',
      sourceId: 2,
      categoryId: 3,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('patch and delete note handlers are brainlift scoped', async () => {
    const { updateNoteHandler, deleteNoteHandler } = await import('../second-brain');

    mockStorage.updateNoteForBrainlift.mockResolvedValue(null);
    await expect(updateNoteHandler(createReq({ params: { id: '6' }, body: { content: 'x' } }), createRes()))
      .rejects.toThrow('Note not found');

    mockStorage.deleteNoteForBrainlift.mockResolvedValue(false);
    await expect(deleteNoteHandler(createReq({ params: { id: '6' } }), createRes()))
      .rejects.toThrow('Note not found');
  });
});

describe('second brain category and prefetch handlers', () => {
  it('listCategoriesHandler returns the spec response shape', async () => {
    const { listCategoriesHandler } = await import('../second-brain');
    const res = createRes();

    mockStorage.getCategoriesWithCounts.mockResolvedValue([{ id: 1, name: 'AI' }]);

    await listCategoriesHandler(createReq(), res);

    expect(res.json).toHaveBeenCalledWith({ categories: [{ id: 1, name: 'AI' }] });
  });

  it('deleteCategoryHandler maps source FK restrictions to the Second Brain guidance message', async () => {
    const { deleteCategoryHandler } = await import('../second-brain');
    const error = Object.assign(new Error('restrict'), {
      cause: { constraint: 'sources_category_id_fkey' },
    });

    mockStorage.deleteCategory.mockRejectedValue(error);

    const res = createRes();
    await deleteCategoryHandler(createReq({ params: { id: '9' } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Move sources to another category first',
    });
  });

  it('prefetchSourceHandler validates URL and does not persist rows', async () => {
    const { prefetchSourceHandler } = await import('../second-brain');
    const res = createRes();

    await prefetchSourceHandler(createReq({ body: { url: 'not-a-url' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid URL' });
    expect(mockStorage.createSource).not.toHaveBeenCalled();
  });

  it('prefetchSourceHandler returns extracted metadata and falls back author to the domain', async () => {
    const { prefetchSourceHandler } = await import('../second-brain');
    const res = createRes();

    mockExtractContent.mockResolvedValue({
      contentType: 'article',
      title: 'Readable Source',
      markdown: '# Text',
    });

    await prefetchSourceHandler(createReq({ body: { url: 'https://example.com/post' } }), res);

    expect(mockExtractContent).toHaveBeenCalledWith('https://example.com/post');
    expect(res.json).toHaveBeenCalledWith({
      title: 'Readable Source',
      author: 'example.com',
      extractedContent: {
        contentType: 'article',
        title: 'Readable Source',
        markdown: '# Text',
      },
    });
  });
});
