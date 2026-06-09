/**
 * Tests for spec 01-backend-atomic-save FR3:
 * POST /api/brainlifts/:slug/notes/from-reader (createNoteFromReaderHandler)
 *
 * The handler orchestrates a single DB transaction:
 *   1. Resolve category (validate categoryId OR create-by-name)
 *   2. Resolve source (validate sourceId OR mirror from LSI)
 *   3. Insert note
 * Returns { note, source, category, autoBookmarked }.
 *
 * Mocks: storage facade + db.transaction. The transaction callback receives
 * a fake `tx` we surface back so we can assert tx-aware calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage, mockDb, mockTx } = vi.hoisted(() => {
  const tx = {
    select: vi.fn(),
    insert: vi.fn(),
  };
  return {
    mockTx: tx,
    mockStorage: {
      ensureCategoryByName: vi.fn(),
      ensureSourceFromLearningStreamItem: vi.fn(),
    },
    mockDb: {
      transaction: vi.fn(),
    },
  };
});

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../db', () => ({
  db: mockDb,
}));

vi.mock('../../services/content-extractor', () => ({
  extractContent: vi.fn(),
}));

vi.mock('../../services/author-extractor', () => ({
  fetchAuthorFromUrl: vi.fn(),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'reader-notes-test' },
    query: {},
    body: {},
    brainlift: { id: 42, slug: 'reader-notes-test', phase: 'research' },
    authContext: { userId: 'user-1', isAdmin: false },
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

/**
 * Wire up a default tx that:
 *   - Returns category row from SELECT when categoryId path is used
 *   - Returns source row from SELECT when sourceId path is used
 *   - Returns inserted note from tx.insert(notes).values(...).returning()
 *
 * Individual tests can override any of these by re-stubbing mockTx before calling the handler.
 */
function setupDefaultTx({
  categoryRow,
  sourceRow,
  noteRow,
}: {
  categoryRow?: { id: number; name: string } | null;
  sourceRow?: any;
  noteRow?: any;
}) {
  // tx.select() chain — used for category lookup (categoryId path) and source lookup (sourceId path)
  // We sequence the responses; each call returns the next configured row.
  const selectQueue: any[] = [];
  if (categoryRow !== undefined) {
    selectQueue.push(categoryRow ? [{ id: categoryRow.id, name: categoryRow.name }] : []);
  }
  if (sourceRow !== undefined) {
    selectQueue.push(sourceRow ? [sourceRow] : []);
  }

  mockTx.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(selectQueue.shift() ?? []),
      }),
    }),
  }));

  mockTx.insert.mockImplementation(() => ({
    values: () => ({
      returning: () => Promise.resolve(noteRow ? [noteRow] : []),
    }),
  }));

  mockDb.transaction.mockImplementation(async (cb: any) => cb(mockTx));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.select.mockReset();
  mockTx.insert.mockReset();
});

describe('FR3: createNoteFromReaderHandler — happy paths', () => {
  it('A — existing source + categoryId: 201 with autoBookmarked=false; source.categoryId untouched', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    const sourceRow = { id: 7, brainliftId: 42, title: 'Existing source', categoryId: 99, url: 'https://x' };
    const noteRow = { id: 101, brainliftId: 42, sourceId: 7, categoryId: 11, content: 'My take' };

    setupDefaultTx({
      categoryRow: { id: 11, name: 'AI' },
      sourceRow,
      noteRow,
    });

    const req = createReq({
      body: { content: 'My take', sourceId: 7, categoryId: 11 },
    });
    const res = createRes();

    await createNoteFromReaderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      note: noteRow,
      source: sourceRow,
      category: { id: 11, name: 'AI' },
      autoBookmarked: false,
    });
    // Critical: the source's categoryId was NOT changed by this request.
    expect(payload.source.categoryId).toBe(99);
    // Storage helper for LSI mirror is NOT called when sourceId is provided.
    expect(mockStorage.ensureSourceFromLearningStreamItem).not.toHaveBeenCalled();
  });

  it('B — LSI + categoryId (no existing source): 201 with autoBookmarked=true; LSI mirror invoked', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    const sourceRow = { id: 8, brainliftId: 42, title: 'Mirrored', categoryId: 11, learningStreamItemId: 55 };
    const noteRow = { id: 102, brainliftId: 42, sourceId: 8, categoryId: 11, content: 'Note B' };

    setupDefaultTx({
      categoryRow: { id: 11, name: 'AI' },
      noteRow,
    });
    mockStorage.ensureSourceFromLearningStreamItem.mockResolvedValue({
      source: sourceRow,
      item: { id: 55, status: 'bookmarked' },
      created: true,
    });

    const req = createReq({
      body: { content: 'Note B', learningStreamItemId: 55, categoryId: 11 },
    });
    const res = createRes();

    await createNoteFromReaderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      note: noteRow,
      source: sourceRow,
      category: { id: 11, name: 'AI' },
      autoBookmarked: true,
    });
    expect(mockStorage.ensureSourceFromLearningStreamItem).toHaveBeenCalledWith(
      mockTx,
      { brainliftId: 42, itemId: 55, categoryId: 11 },
    );
  });

  it('C — LSI + categoryName (inline new): 201; ensureCategoryByName called with the new name; autoBookmarked=true', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    const sourceRow = { id: 9, brainliftId: 42, title: 'Mirrored C', categoryId: 12 };
    const noteRow = { id: 103, brainliftId: 42, sourceId: 9, categoryId: 12, content: 'Note C' };

    // No category SELECT in the categoryName path — only the inline helper is called.
    setupDefaultTx({ noteRow });
    mockStorage.ensureCategoryByName.mockResolvedValue({ id: 12, name: 'fresh-cat' });
    mockStorage.ensureSourceFromLearningStreamItem.mockResolvedValue({
      source: sourceRow,
      item: { id: 60, status: 'bookmarked' },
      created: true,
    });

    const req = createReq({
      body: { content: 'Note C', learningStreamItemId: 60, categoryName: 'fresh-cat' },
    });
    const res = createRes();

    await createNoteFromReaderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockStorage.ensureCategoryByName).toHaveBeenCalledWith(mockTx, 42, 'fresh-cat');
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      category: { id: 12, name: 'fresh-cat' },
      autoBookmarked: true,
    });
  });

  it('D — existing source + categoryName: 201; ensureCategoryByName called; source.categoryId untouched', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    const sourceRow = { id: 10, brainliftId: 42, title: 'Existing D', categoryId: 99 };
    const noteRow = { id: 104, brainliftId: 42, sourceId: 10, categoryId: 13, content: 'Note D' };

    setupDefaultTx({ sourceRow, noteRow });
    mockStorage.ensureCategoryByName.mockResolvedValue({ id: 13, name: 'inline-d' });

    const req = createReq({
      body: { content: 'Note D', sourceId: 10, categoryName: 'inline-d' },
    });
    const res = createRes();

    await createNoteFromReaderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockStorage.ensureCategoryByName).toHaveBeenCalledWith(mockTx, 42, 'inline-d');
    const payload = res.json.mock.calls[0][0];
    expect(payload.source.categoryId).toBe(99);
    expect(payload.category).toEqual({ id: 13, name: 'inline-d' });
  });

  it('E — re-bookmark idempotency: LSI with existing source → autoBookmarked=false', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    const sourceRow = { id: 11, brainliftId: 42, categoryId: 11 };
    const noteRow = { id: 105, brainliftId: 42, sourceId: 11, categoryId: 11, content: 'Note E' };

    setupDefaultTx({
      categoryRow: { id: 11, name: 'AI' },
      noteRow,
    });
    mockStorage.ensureSourceFromLearningStreamItem.mockResolvedValue({
      source: sourceRow,
      item: { id: 70, status: 'bookmarked' },
      created: false,
    });

    const req = createReq({
      body: { content: 'Note E', learningStreamItemId: 70, categoryId: 11 },
    });
    const res = createRes();

    await createNoteFromReaderHandler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.autoBookmarked).toBe(false);
    expect(payload.note).toEqual(noteRow);
  });
});

describe('FR3: createNoteFromReaderHandler — input validation (400 with exact message)', () => {
  it('rejects empty content with "content is required"', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');

    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: '   ', sourceId: 1, categoryId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow('content is required');
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('rejects missing content with "content is required"', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { sourceId: 1, categoryId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow('content is required');
  });

  it('rejects both sourceId and learningStreamItemId', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1, learningStreamItemId: 2, categoryId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow('Provide exactly one of sourceId or learningStreamItemId');
  });

  it('rejects neither sourceId nor learningStreamItemId', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', categoryId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow('Provide exactly one of sourceId or learningStreamItemId');
  });

  it('rejects both categoryId and categoryName', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1, categoryId: 1, categoryName: 'foo' } }),
        createRes(),
      ),
    ).rejects.toThrow('Provide exactly one of categoryId or categoryName');
  });

  it('rejects neither categoryId nor categoryName', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow('Provide exactly one of categoryId or categoryName');
  });

  it('rejects whitespace-only categoryName with "categoryName cannot be empty"', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1, categoryName: '   ' } }),
        createRes(),
      ),
    ).rejects.toThrow('categoryName cannot be empty');
  });

  it('rejects non-integer sourceId', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 'not-a-number', categoryId: 1 } }),
        createRes(),
      ),
    ).rejects.toThrow();
  });

  it('rejects non-integer categoryId', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1, categoryId: 'foo' } }),
        createRes(),
      ),
    ).rejects.toThrow();
  });
});

describe('FR3: createNoteFromReaderHandler — IDOR (foreign-brainlift surfaces 400)', () => {
  it('returns 400 "Source does not belong to this brainlift" when SELECT returns no row', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    setupDefaultTx({
      categoryRow: { id: 11, name: 'AI' },
      sourceRow: null,
    });

    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 9999, categoryId: 11 } }),
        createRes(),
      ),
    ).rejects.toThrow('Source does not belong to this brainlift');
  });

  it('returns 400 "Category does not belong to this brainlift" when category SELECT returns no row', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    setupDefaultTx({ categoryRow: null });

    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', sourceId: 1, categoryId: 9999 } }),
        createRes(),
      ),
    ).rejects.toThrow('Category does not belong to this brainlift');
  });

  it('propagates the BadRequestError from ensureSourceFromLearningStreamItem when LSI is foreign', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');
    setupDefaultTx({ categoryRow: { id: 11, name: 'AI' } });

    const { NotFoundError } = await import('../../middleware/error-handler');
    mockStorage.ensureSourceFromLearningStreamItem.mockRejectedValue(
      new NotFoundError('Item not found or does not belong to this brainlift'),
    );

    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', learningStreamItemId: 9999, categoryId: 11 } }),
        createRes(),
      ),
    ).rejects.toThrow('Item not found or does not belong to this brainlift');
  });
});

describe('FR3: createNoteFromReaderHandler — transaction rollback on mid-tx error', () => {
  it('does not res.status(201) when note insert throws — error propagates and transaction rolls back', async () => {
    const { createNoteFromReaderHandler } = await import('../second-brain');

    setupDefaultTx({ categoryRow: { id: 11, name: 'AI' } });
    mockStorage.ensureSourceFromLearningStreamItem.mockResolvedValue({
      source: { id: 1, brainliftId: 42, categoryId: 11 },
      item: { id: 1, status: 'bookmarked' },
      created: true,
    });
    // Override insert to throw
    mockTx.insert.mockImplementation(() => ({
      values: () => ({
        returning: () => Promise.reject(new Error('db error during note insert')),
      }),
    }));

    const res = createRes();
    await expect(
      createNoteFromReaderHandler(
        createReq({ body: { content: 'x', learningStreamItemId: 1, categoryId: 11 } }),
        res,
      ),
    ).rejects.toThrow('db error during note insert');

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('FR3: route registration', () => {
  it('the POST /notes/from-reader registration appears BEFORE the POST /notes and PATCH/DELETE /notes/:id registrations (Express order)', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../second-brain.ts', import.meta.url),
      'utf8',
    );

    // Match the POST registration *blocks* (router method + path together),
    // not bare path strings. The string "'/api/brainlifts/:slug/notes'" also
    // appears earlier under GET registrations, which is irrelevant to Express
    // POST-routing precedence.
    const fromReaderIdx = source.search(/secondBrainRouter\.post\(\s*'\/api\/brainlifts\/:slug\/notes\/from-reader'/);
    const postNotesIdx = source.search(/secondBrainRouter\.post\(\s*'\/api\/brainlifts\/:slug\/notes'(?!\/)/);
    const patchNotesIdIdx = source.search(/secondBrainRouter\.patch\(\s*'\/api\/brainlifts\/:slug\/notes\/:id'/);
    const deleteNotesIdIdx = source.search(/secondBrainRouter\.delete\(\s*'\/api\/brainlifts\/:slug\/notes\/:id'/);

    expect(fromReaderIdx).toBeGreaterThan(-1);
    expect(postNotesIdx).toBeGreaterThan(-1);
    expect(patchNotesIdIdx).toBeGreaterThan(-1);
    expect(deleteNotesIdIdx).toBeGreaterThan(-1);
    expect(fromReaderIdx).toBeLessThan(postNotesIdx);
    expect(fromReaderIdx).toBeLessThan(patchNotesIdIdx);
    expect(fromReaderIdx).toBeLessThan(deleteNotesIdIdx);
  });

  it('mounts the route as POST with requireAuth + requireBrainliftModify + asyncHandler', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../second-brain.ts', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(/secondBrainRouter\.post\(\s*'\/api\/brainlifts\/:slug\/notes\/from-reader'/);
    const after = source.slice(source.indexOf("'/api/brainlifts/:slug/notes/from-reader'"));
    const block = after.slice(0, 400);
    expect(block).toMatch(/requireAuth/);
    expect(block).toMatch(/requireBrainliftModify/);
    expect(block).toMatch(/asyncHandler\(createNoteFromReaderHandler\)/);
  });

  it('also registers the reader note route in the earlier-mounted learning-stream router', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../learning-stream.ts', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(/createNoteFromReaderHandler/);
    expect(source).toMatch(/learningStreamRouter\.post\(\s*'\/api\/brainlifts\/:slug\/notes\/from-reader'/);
    expect(source).toMatch(/requireBrainliftModify/);
  });
});
