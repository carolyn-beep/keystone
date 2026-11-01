/**
 * Spec 04 - FR11: bulk-note endpoint handler tests.
 *
 * Uses the same mocked-storage handler test pattern as
 * `server/routes/__tests__/second-brain.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    bulkDeleteNotes: vi.fn(),
    bulkUpdateNoteCategories: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

// The content-extractor import is unrelated to the bulk handlers but
// it's eagerly loaded by `routes/second-brain.ts`. Stub it to keep
// the test environment hermetic.
vi.mock('../../services/content-extractor', () => ({
  extractContent: vi.fn(),
}));

vi.mock('../../services/author-extractor', () => ({
  fetchAuthorFromUrl: vi.fn(),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'research-project' },
    query: {},
    body: {},
    brainlift: { id: 7, slug: 'research-project', phase: 'research' },
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('bulkDeleteNotesHandler', () => {
  it('rejects empty / non-array ids with 400', async () => {
    const { bulkDeleteNotesHandler } = await import('../second-brain');
    await expect(
      bulkDeleteNotesHandler(createReq({ body: {} }), createRes()),
    ).rejects.toThrow('ids must be a non-empty array');

    await expect(
      bulkDeleteNotesHandler(createReq({ body: { ids: [] } }), createRes()),
    ).rejects.toThrow('ids must be a non-empty array');

    await expect(
      bulkDeleteNotesHandler(createReq({ body: { ids: 'nope' } }), createRes()),
    ).rejects.toThrow('ids must be a non-empty array');
  });

  it('rejects non-integer ids', async () => {
    const { bulkDeleteNotesHandler } = await import('../second-brain');
    await expect(
      bulkDeleteNotesHandler(createReq({ body: { ids: [1, 'abc'] } }), createRes()),
    ).rejects.toThrow('ids must contain only integers');

    await expect(
      bulkDeleteNotesHandler(createReq({ body: { ids: [1, 1.5] } }), createRes()),
    ).rejects.toThrow('ids must contain only integers');
  });

  it('delegates to storage.bulkDeleteNotes scoped to req.brainlift.id', async () => {
    const { bulkDeleteNotesHandler } = await import('../second-brain');
    mockStorage.bulkDeleteNotes.mockResolvedValue({ deleted: 2 });

    const res = createRes();
    await bulkDeleteNotesHandler(createReq({ body: { ids: [11, 22, 33] } }), res);

    expect(mockStorage.bulkDeleteNotes).toHaveBeenCalledWith(7, [11, 22, 33]);
    expect(res.json).toHaveBeenCalledWith({ deleted: 2 });
  });
});

describe('bulkRecategorizeNotesHandler', () => {
  it('rejects missing categoryId (must be present, even if null)', async () => {
    const { bulkRecategorizeNotesHandler } = await import('../second-brain');
    await expect(
      bulkRecategorizeNotesHandler(createReq({ body: { ids: [1] } }), createRes()),
    ).rejects.toThrow('categoryId is required (use null to clear)');
  });

  it('accepts categoryId: null (clears the category — distinct from sources)', async () => {
    const { bulkRecategorizeNotesHandler } = await import('../second-brain');
    mockStorage.bulkUpdateNoteCategories.mockResolvedValue({ updated: 3 });

    const res = createRes();
    await bulkRecategorizeNotesHandler(
      createReq({ body: { ids: [1, 2, 3], categoryId: null } }),
      res,
    );

    expect(mockStorage.bulkUpdateNoteCategories).toHaveBeenCalledWith(7, [1, 2, 3], null);
    expect(res.json).toHaveBeenCalledWith({ updated: 3 });
  });

  it('accepts categoryId: <int>', async () => {
    const { bulkRecategorizeNotesHandler } = await import('../second-brain');
    mockStorage.bulkUpdateNoteCategories.mockResolvedValue({ updated: 1 });

    const res = createRes();
    await bulkRecategorizeNotesHandler(
      createReq({ body: { ids: [9], categoryId: 5 } }),
      res,
    );

    expect(mockStorage.bulkUpdateNoteCategories).toHaveBeenCalledWith(7, [9], 5);
    expect(res.json).toHaveBeenCalledWith({ updated: 1 });
  });

  it('rejects non-integer categoryId', async () => {
    const { bulkRecategorizeNotesHandler } = await import('../second-brain');
    await expect(
      bulkRecategorizeNotesHandler(
        createReq({ body: { ids: [1], categoryId: 'foo' } }),
        createRes(),
      ),
    ).rejects.toThrow('categoryId must be an integer or null');

    await expect(
      bulkRecategorizeNotesHandler(
        createReq({ body: { ids: [1], categoryId: 1.5 } }),
        createRes(),
      ),
    ).rejects.toThrow('categoryId must be an integer or null');
  });
});

describe('storage source assertions (multi-row WHERE id IN)', () => {
  it('bulkDeleteNotes uses inArray + brainlift WHERE clause', async () => {
    const fs = await import('node:fs');
    const storageSrc = fs.readFileSync(
      new URL('../../storage/second-brain.ts', import.meta.url),
      'utf8',
    );
    expect(storageSrc).toContain('export async function bulkDeleteNotes');
    expect(storageSrc).toContain('inArray(notes.id, ids)');
    expect(storageSrc).toContain('eq(notes.brainliftId, brainliftId)');
  });

  it('bulkUpdateNoteCategories validates non-null category belongs to brainlift', async () => {
    const fs = await import('node:fs');
    const storageSrc = fs.readFileSync(
      new URL('../../storage/second-brain.ts', import.meta.url),
      'utf8',
    );
    expect(storageSrc).toContain('export async function bulkUpdateNoteCategories');
    expect(storageSrc).toContain('ensureCategoryBelongsToBrainlift(categoryId, brainliftId)');
    expect(storageSrc).toContain('inArray(notes.id, ids)');
  });
});
