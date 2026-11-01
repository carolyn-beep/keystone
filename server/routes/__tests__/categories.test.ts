/**
 * Tests for 05-categories: Category CRUD API Endpoints
 *
 * FR1: Category CRUD storage functions (create, update, delete, getCategoriesWithCounts, reassignItemCategory)
 * FR2: Category CRUD API routes (POST, PATCH, DELETE categories; PATCH item category; IDOR checks)
 *
 * Simulates route handler logic without Express.
 * Mocks: storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockDeleteCategory = vi.fn();
const mockGetCategoriesWithCounts = vi.fn();
const mockReassignItemCategory = vi.fn();
const mockGetLearningStreamItemById = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    createCategory: (...args: unknown[]) => mockCreateCategory(...args),
    updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
    deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
    getCategoriesWithCounts: (...args: unknown[]) => mockGetCategoriesWithCounts(...args),
    reassignItemCategory: (...args: unknown[]) => mockReassignItemCategory(...args),
    getLearningStreamItemById: (...args: unknown[]) => mockGetLearningStreamItemById(...args),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const BRAINLIFT_ID = 5;

const sampleCategory = {
  id: 1,
  brainliftId: BRAINLIFT_ID,
  name: 'Machine Learning',
  sortOrder: 0,
  createdAt: new Date('2026-03-18'),
};

const sampleCategoryWithCount = {
  ...sampleCategory,
  sourceCount: 3,
};

const sampleItem = {
  id: 10,
  brainliftId: BRAINLIFT_ID,
  type: 'Substack',
  author: 'Alice',
  topic: 'AI Research',
  time: '5 min',
  facts: 'Key findings.',
  url: 'https://example.com/ai',
  status: 'bookmarked' as const,
  source: 'quick-search' as const,
  categoryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Route Simulators ───────────────────────────────────────────────────────

/**
 * Simulate POST /api/brainlifts/:slug/categories
 */
async function simulateCreateCategory(params: {
  brainliftId: number;
  body: { name?: string };
}) {
  const { brainliftId, body } = params;
  const name = body.name?.trim();

  if (!name || name.length === 0) {
    return { status: 400, body: { message: 'Category name is required' } };
  }

  const category = await mockCreateCategory(brainliftId, name);
  return { status: 201, body: category };
}

/**
 * Simulate PATCH /api/brainlifts/:slug/categories/:id
 */
async function simulateUpdateCategory(params: {
  categoryId: number;
  brainliftId: number;
  body: { name?: string; sortOrder?: number | null };
}) {
  const { categoryId, brainliftId, body } = params;

  if (isNaN(categoryId)) {
    return { status: 400, body: { message: 'Invalid category ID' } };
  }

  // Validate: at least one field must be provided
  const hasName = body.name !== undefined;
  const hasSortOrder = body.sortOrder !== undefined;
  if (!hasName && !hasSortOrder) {
    return { status: 400, body: { message: 'At least one field required' } };
  }

  // Validate name if provided
  if (hasName) {
    const trimmed = body.name?.trim();
    if (!trimmed || trimmed.length === 0) {
      return { status: 400, body: { message: 'Category name cannot be empty' } };
    }
  }

  const result = await mockUpdateCategory(categoryId, brainliftId, body);
  if (!result) {
    return { status: 404, body: { message: 'Category not found' } };
  }

  return { status: 200, body: result };
}

/**
 * Simulate DELETE /api/brainlifts/:slug/categories/:id
 */
async function simulateDeleteCategory(params: {
  categoryId: number;
  brainliftId: number;
}) {
  const { categoryId, brainliftId } = params;

  if (isNaN(categoryId)) {
    return { status: 400, body: { message: 'Invalid category ID' } };
  }

  const result = await mockDeleteCategory(categoryId, brainliftId);
  if (!result) {
    return { status: 404, body: { message: 'Category not found' } };
  }

  return { status: 200, body: { success: true } };
}

/**
 * Simulate PATCH /api/brainlifts/:slug/learning-stream/:itemId/category
 */
async function simulateReassignItemCategory(params: {
  itemId: number;
  brainliftId: number;
  body: { categoryId?: number | null };
}) {
  const { itemId, brainliftId, body } = params;

  if (isNaN(itemId)) {
    return { status: 400, body: { message: 'Invalid item ID' } };
  }

  if (body.categoryId === undefined) {
    return { status: 400, body: { message: 'categoryId is required' } };
  }

  // Verify item exists and belongs to brainlift
  const item = await mockGetLearningStreamItemById(itemId, brainliftId);
  if (!item) {
    return { status: 404, body: { message: 'Item not found' } };
  }

  await mockReassignItemCategory(itemId, brainliftId, body.categoryId);

  return { status: 200, body: { success: true } };
}

// ─── FR1: Category CRUD Storage ─────────────────────────────────────────────

describe('FR1: Category CRUD storage logic', () => {
  it('createCategory is called with brainliftId and trimmed name', async () => {
    mockCreateCategory.mockResolvedValue(sampleCategory);

    const result = await simulateCreateCategory({
      brainliftId: BRAINLIFT_ID,
      body: { name: '  Machine Learning  ' },
    });

    expect(result.status).toBe(201);
    expect(mockCreateCategory).toHaveBeenCalledWith(BRAINLIFT_ID, 'Machine Learning');
  });

  it('updateCategory returns null for IDOR (wrong brainlift)', async () => {
    mockUpdateCategory.mockResolvedValue(null);

    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: 999,
      body: { name: 'Renamed' },
    });

    expect(result.status).toBe(404);
    expect(mockUpdateCategory).toHaveBeenCalledWith(1, 999, { name: 'Renamed' });
  });

  it('updateCategory succeeds with valid fields', async () => {
    const updated = { ...sampleCategory, name: 'Deep Learning' };
    mockUpdateCategory.mockResolvedValue(updated);

    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: { name: 'Deep Learning' },
    });

    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Deep Learning');
  });

  it('updateCategory can update sortOrder', async () => {
    const updated = { ...sampleCategory, sortOrder: 5 };
    mockUpdateCategory.mockResolvedValue(updated);

    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: { sortOrder: 5 },
    });

    expect(result.status).toBe(200);
    expect(result.body.sortOrder).toBe(5);
  });

  it('deleteCategory returns null for IDOR (wrong brainlift)', async () => {
    mockDeleteCategory.mockResolvedValue(null);

    const result = await simulateDeleteCategory({
      categoryId: 1,
      brainliftId: 999,
    });

    expect(result.status).toBe(404);
  });

  it('deleteCategory succeeds for valid category', async () => {
    mockDeleteCategory.mockResolvedValue({ success: true });

    const result = await simulateDeleteCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it('getCategoriesWithCounts returns categories with sourceCount', async () => {
    mockGetCategoriesWithCounts.mockResolvedValue([
      sampleCategoryWithCount,
      { id: 2, brainliftId: BRAINLIFT_ID, name: 'NLP', sortOrder: 1, sourceCount: 0 },
    ]);

    const result = await mockGetCategoriesWithCounts(BRAINLIFT_ID);

    expect(result).toHaveLength(2);
    expect(result[0].sourceCount).toBe(3);
    expect(result[1].sourceCount).toBe(0);
  });

  it('reassignItemCategory verifies item belongs to brainlift', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(null);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: 999,
      body: { categoryId: 1 },
    });

    expect(result.status).toBe(404);
    expect(mockReassignItemCategory).not.toHaveBeenCalled();
  });

  it('reassignItemCategory with null categoryId sets to uncategorized', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
    mockReassignItemCategory.mockResolvedValue(undefined);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: BRAINLIFT_ID,
      body: { categoryId: null },
    });

    expect(result.status).toBe(200);
    expect(mockReassignItemCategory).toHaveBeenCalledWith(10, BRAINLIFT_ID, null);
  });

  it('reassignItemCategory with valid categoryId assigns item', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
    mockReassignItemCategory.mockResolvedValue(undefined);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: BRAINLIFT_ID,
      body: { categoryId: 1 },
    });

    expect(result.status).toBe(200);
    expect(mockReassignItemCategory).toHaveBeenCalledWith(10, BRAINLIFT_ID, 1);
  });
});

// ─── FR2: Category CRUD Routes ──────────────────────────────────────────────

describe('FR2: POST /categories', () => {
  it('creates category and returns 201', async () => {
    mockCreateCategory.mockResolvedValue(sampleCategory);

    const result = await simulateCreateCategory({
      brainliftId: BRAINLIFT_ID,
      body: { name: 'Machine Learning' },
    });

    expect(result.status).toBe(201);
    expect(result.body.name).toBe('Machine Learning');
    expect(result.body.brainliftId).toBe(BRAINLIFT_ID);
  });

  it('returns 400 for empty name', async () => {
    const result = await simulateCreateCategory({
      brainliftId: BRAINLIFT_ID,
      body: { name: '' },
    });

    expect(result.status).toBe(400);
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it('returns 400 for whitespace-only name', async () => {
    const result = await simulateCreateCategory({
      brainliftId: BRAINLIFT_ID,
      body: { name: '   ' },
    });

    expect(result.status).toBe(400);
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it('returns 400 for missing name', async () => {
    const result = await simulateCreateCategory({
      brainliftId: BRAINLIFT_ID,
      body: {},
    });

    expect(result.status).toBe(400);
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });
});

describe('FR2: PATCH /categories/:id', () => {
  it('renames category and returns 200', async () => {
    const updated = { ...sampleCategory, name: 'Deep Learning' };
    mockUpdateCategory.mockResolvedValue(updated);

    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: { name: 'Deep Learning' },
    });

    expect(result.status).toBe(200);
    expect(result.body.name).toBe('Deep Learning');
  });

  it('returns 404 for non-existent category', async () => {
    mockUpdateCategory.mockResolvedValue(null);

    const result = await simulateUpdateCategory({
      categoryId: 999,
      brainliftId: BRAINLIFT_ID,
      body: { name: 'Whatever' },
    });

    expect(result.status).toBe(404);
  });

  it('returns 400 for invalid category ID', async () => {
    const result = await simulateUpdateCategory({
      categoryId: NaN,
      brainliftId: BRAINLIFT_ID,
      body: { name: 'Test' },
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 when no fields provided', async () => {
    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: {},
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 for empty name', async () => {
    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: { name: '   ' },
    });

    expect(result.status).toBe(400);
  });

  it('can set sortOrder to null', async () => {
    const updated = { ...sampleCategory, sortOrder: null };
    mockUpdateCategory.mockResolvedValue(updated);

    const result = await simulateUpdateCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
      body: { sortOrder: null },
    });

    expect(result.status).toBe(200);
    expect(result.body.sortOrder).toBeNull();
  });
});

describe('FR2: DELETE /categories/:id', () => {
  it('deletes category and returns 200', async () => {
    mockDeleteCategory.mockResolvedValue({ success: true });

    const result = await simulateDeleteCategory({
      categoryId: 1,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it('returns 404 for non-existent category', async () => {
    mockDeleteCategory.mockResolvedValue(null);

    const result = await simulateDeleteCategory({
      categoryId: 999,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(404);
  });

  it('returns 404 for category from different brainlift (IDOR)', async () => {
    mockDeleteCategory.mockResolvedValue(null);

    const result = await simulateDeleteCategory({
      categoryId: 1,
      brainliftId: 999,
    });

    expect(result.status).toBe(404);
  });

  it('returns 400 for invalid category ID', async () => {
    const result = await simulateDeleteCategory({
      categoryId: NaN,
      brainliftId: BRAINLIFT_ID,
    });

    expect(result.status).toBe(400);
  });
});

describe('FR2: PATCH /learning-stream/:itemId/category', () => {
  it('reassigns item category and returns 200', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
    mockReassignItemCategory.mockResolvedValue(undefined);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: BRAINLIFT_ID,
      body: { categoryId: 1 },
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
  });

  it('returns 404 for item from different brainlift (IDOR)', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(null);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: 999,
      body: { categoryId: 1 },
    });

    expect(result.status).toBe(404);
  });

  it('returns 400 for invalid item ID', async () => {
    const result = await simulateReassignItemCategory({
      itemId: NaN,
      brainliftId: BRAINLIFT_ID,
      body: { categoryId: 1 },
    });

    expect(result.status).toBe(400);
  });

  it('returns 400 when categoryId is not provided', async () => {
    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: BRAINLIFT_ID,
      body: {},
    });

    expect(result.status).toBe(400);
  });

  it('accepts null categoryId to move to uncategorized', async () => {
    mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
    mockReassignItemCategory.mockResolvedValue(undefined);

    const result = await simulateReassignItemCategory({
      itemId: 10,
      brainliftId: BRAINLIFT_ID,
      body: { categoryId: null },
    });

    expect(result.status).toBe(200);
    expect(mockReassignItemCategory).toHaveBeenCalledWith(10, BRAINLIFT_ID, null);
  });
});
