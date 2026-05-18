/**
 * Spec 03 - Bulk source endpoints.
 *
 * Tests the handler shape for POST /sources/bulk-delete and
 * POST /sources/bulk-recategorize (FR2, FR3). Storage is mocked because
 * the contract we care about is request validation + status mapping;
 * the real DB behavior is covered by the storage-layer test suite.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    bulkDeleteSources: vi.fn(),
    bulkUpdateSourceCategories: vi.fn(),
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
    params: { slug: 'research-project' },
    body: {},
    brainlift: { id: 11, slug: 'research-project', phase: 'research' },
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

// ===========================================================================
// FR2 — bulk-delete
// ===========================================================================
describe('FR2 bulkDeleteSourcesHandler', () => {
  it('returns 204 when every requested id was deleted', async () => {
    const { bulkDeleteSourcesHandler } = await import('../second-brain');
    mockStorage.bulkDeleteSources.mockResolvedValue(3);

    const req = createReq({ body: { ids: [1, 2, 3] } });
    const res = createRes();
    await bulkDeleteSourcesHandler(req, res);

    expect(mockStorage.bulkDeleteSources).toHaveBeenCalledWith(11, [1, 2, 3]);
    expect(res.sendStatus).toHaveBeenCalledWith(204);
  });

  it('throws BadRequestError when ids is missing', async () => {
    const { bulkDeleteSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: {} });
    const res = createRes();
    await expect(bulkDeleteSourcesHandler(req, res)).rejects.toThrow(/ids/i);
  });

  it('throws BadRequestError when ids is an empty array', async () => {
    const { bulkDeleteSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: { ids: [] } });
    const res = createRes();
    await expect(bulkDeleteSourcesHandler(req, res)).rejects.toThrow(/ids/i);
  });

  it('throws BadRequestError when ids contains a non-number', async () => {
    const { bulkDeleteSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: { ids: [1, 'two', 3] } });
    const res = createRes();
    await expect(bulkDeleteSourcesHandler(req, res)).rejects.toThrow(/ids/i);
  });

  it('throws NotFoundError when deleted count is less than requested count (IDOR)', async () => {
    const { bulkDeleteSourcesHandler } = await import('../second-brain');
    mockStorage.bulkDeleteSources.mockResolvedValue(1); // requested 2, got 1

    const req = createReq({ body: { ids: [1, 999] } });
    const res = createRes();
    await expect(bulkDeleteSourcesHandler(req, res)).rejects.toThrow(/not found/i);
  });
});

// ===========================================================================
// FR3 — bulk-recategorize
// ===========================================================================
describe('FR3 bulkRecategorizeSourcesHandler', () => {
  it('returns { updated: N } on success', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    mockStorage.bulkUpdateSourceCategories.mockResolvedValue(2);

    const req = createReq({ body: { ids: [1, 2], categoryId: 7 } });
    const res = createRes();
    await bulkRecategorizeSourcesHandler(req, res);

    expect(mockStorage.bulkUpdateSourceCategories).toHaveBeenCalledWith(11, [1, 2], 7);
    expect(res.json).toHaveBeenCalledWith({ updated: 2 });
  });

  it('throws BadRequestError when ids is empty', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: { ids: [], categoryId: 7 } });
    const res = createRes();
    await expect(bulkRecategorizeSourcesHandler(req, res)).rejects.toThrow(/ids/i);
  });

  it('throws BadRequestError when categoryId is missing', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: { ids: [1, 2] } });
    const res = createRes();
    await expect(bulkRecategorizeSourcesHandler(req, res)).rejects.toThrow(/categoryId/i);
  });

  it('throws BadRequestError when ids contains a non-number', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    const req = createReq({ body: { ids: [1, 'x'], categoryId: 7 } });
    const res = createRes();
    await expect(bulkRecategorizeSourcesHandler(req, res)).rejects.toThrow(/ids/i);
  });

  it('lets cross-brainlift categoryId errors from storage propagate as 400', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    const { BadRequestError } = await import('../../middleware/error-handler');
    mockStorage.bulkUpdateSourceCategories.mockRejectedValue(
      new BadRequestError('Category does not belong to this brainlift'),
    );

    const req = createReq({ body: { ids: [1, 2], categoryId: 99 } });
    const res = createRes();
    await expect(bulkRecategorizeSourcesHandler(req, res)).rejects.toThrow(/category/i);
  });

  it('throws NotFoundError when updated count is less than requested count (IDOR)', async () => {
    const { bulkRecategorizeSourcesHandler } = await import('../second-brain');
    mockStorage.bulkUpdateSourceCategories.mockResolvedValue(1); // requested 2, got 1

    const req = createReq({ body: { ids: [1, 999], categoryId: 7 } });
    const res = createRes();
    await expect(bulkRecategorizeSourcesHandler(req, res)).rejects.toThrow(/not found/i);
  });
});
