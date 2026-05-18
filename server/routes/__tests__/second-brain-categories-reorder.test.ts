/**
 * Tests for spec 05-categories-tab: PATCH /api/brainlifts/:slug/categories/reorder
 *
 * Mocks: storage facade.
 * Covers:
 *   - 200 happy path returns refreshed { categories }
 *   - 400 for invalid body shape
 *   - 400 when storage throws BadRequestError (length / dupes)
 *   - 404 when storage throws NotFoundError (foreign id)
 *   - listCategoriesHandler now consumes getCategoriesWithCountsForSecondBrain
 *   - reorder route is registered BEFORE the /:id route
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    reorderCategories: vi.fn(),
    getCategoriesWithCountsForSecondBrain: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../services/content-extractor', () => ({
  extractContent: vi.fn(),
}));

vi.mock('../../services/author-extractor', () => ({
  fetchAuthorFromUrl: vi.fn(),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'cats-test' },
    query: {},
    body: {},
    brainlift: { id: 42, slug: 'cats-test', phase: 'research' },
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

describe('FR3: reorderCategoriesHandler', () => {
  it('happy path: calls storage and returns refreshed categories with 200', async () => {
    const { reorderCategoriesHandler } = await import('../second-brain');
    const refreshed = [
      { id: 5, name: 'A', sortOrder: 0, sourceCount: 2, noteCount: 1 },
      { id: 3, name: 'B', sortOrder: 1, sourceCount: 0, noteCount: 0 },
    ];
    mockStorage.reorderCategories.mockResolvedValue(undefined);
    mockStorage.getCategoriesWithCountsForSecondBrain.mockResolvedValue(refreshed);

    const req = createReq({ body: { orderedIds: [5, 3] } });
    const res = createRes();

    await reorderCategoriesHandler(req, res);

    expect(mockStorage.reorderCategories).toHaveBeenCalledWith(42, [5, 3]);
    expect(mockStorage.getCategoriesWithCountsForSecondBrain).toHaveBeenCalledWith(42);
    expect(res.json).toHaveBeenCalledWith({ categories: refreshed });
  });

  it('rejects missing orderedIds with BadRequestError', async () => {
    const { reorderCategoriesHandler } = await import('../second-brain');
    await expect(reorderCategoriesHandler(createReq({ body: {} }), createRes()))
      .rejects.toThrow('orderedIds');
    expect(mockStorage.reorderCategories).not.toHaveBeenCalled();
  });

  it('rejects non-array orderedIds with BadRequestError', async () => {
    const { reorderCategoriesHandler } = await import('../second-brain');
    await expect(reorderCategoriesHandler(createReq({ body: { orderedIds: 'nope' } }), createRes()))
      .rejects.toThrow('orderedIds');
    expect(mockStorage.reorderCategories).not.toHaveBeenCalled();
  });

  it('rejects orderedIds containing non-integer values with BadRequestError', async () => {
    const { reorderCategoriesHandler } = await import('../second-brain');
    await expect(reorderCategoriesHandler(createReq({ body: { orderedIds: [1, 'two', 3] } }), createRes()))
      .rejects.toThrow('orderedIds');
    expect(mockStorage.reorderCategories).not.toHaveBeenCalled();
  });

  it('propagates BadRequestError from storage (e.g., length mismatch / duplicates)', async () => {
    const { BadRequestError } = await import('../../middleware/error-handler');
    const { reorderCategoriesHandler } = await import('../second-brain');
    mockStorage.reorderCategories.mockRejectedValue(new BadRequestError('orderedIds length mismatch'));

    await expect(reorderCategoriesHandler(createReq({ body: { orderedIds: [1, 2] } }), createRes()))
      .rejects.toBeInstanceOf(BadRequestError);
  });

  it('propagates NotFoundError from storage (foreign id)', async () => {
    const { NotFoundError } = await import('../../middleware/error-handler');
    const { reorderCategoriesHandler } = await import('../second-brain');
    mockStorage.reorderCategories.mockRejectedValue(new NotFoundError('Category not found in this brainlift'));

    await expect(reorderCategoriesHandler(createReq({ body: { orderedIds: [99] } }), createRes()))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('FR3: listCategoriesHandler switches to getCategoriesWithCountsForSecondBrain', () => {
  it('uses the new storage function and returns { categories } shape', async () => {
    const { listCategoriesHandler } = await import('../second-brain');
    mockStorage.getCategoriesWithCountsForSecondBrain.mockResolvedValue([
      { id: 1, name: 'X', sortOrder: 0, sourceCount: 1, noteCount: 2 },
    ]);

    const res = createRes();
    await listCategoriesHandler(createReq(), res);

    expect(mockStorage.getCategoriesWithCountsForSecondBrain).toHaveBeenCalledWith(42);
    expect(res.json).toHaveBeenCalledWith({
      categories: [{ id: 1, name: 'X', sortOrder: 0, sourceCount: 1, noteCount: 2 }],
    });
  });
});

describe('FR3: route registration order', () => {
  it('registers /categories/reorder BEFORE /categories/:id to avoid path collision', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../second-brain.ts', import.meta.url),
      'utf8',
    );
    const reorderIdx = source.indexOf("'/api/brainlifts/:slug/categories/reorder'");
    const idIdx = source.indexOf("'/api/brainlifts/:slug/categories/:id'");
    expect(reorderIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(-1);
    expect(reorderIdx).toBeLessThan(idIdx);
  });

  it('mounts reorder route as PATCH with requireAuth + requireBrainliftModify + asyncHandler', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../second-brain.ts', import.meta.url),
      'utf8',
    );
    // The block after the reorder path string must contain the auth chain and asyncHandler.
    const after = source.slice(source.indexOf("'/api/brainlifts/:slug/categories/reorder'"));
    const block = after.slice(0, 400);
    expect(block).toMatch(/requireAuth/);
    expect(block).toMatch(/requireBrainliftModify/);
    expect(block).toMatch(/asyncHandler\(reorderCategoriesHandler\)/);
    expect(source).toMatch(/secondBrainRouter\.patch\(\s*'\/api\/brainlifts\/:slug\/categories\/reorder'/);
  });
});
