import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the values object passed to db.insert(...).values(...)
let capturedInsertValues: Record<string, any> | null = null;

// Controls whether the insert succeeds or throws a duplicate-URL (23505) error.
let insertShouldThrowDuplicate = false;

// Row returned by the dedup SELECT fallback (the pre-existing item).
let existingRow: Record<string, any> | null = null;

const returning = vi.fn(async () => {
  if (insertShouldThrowDuplicate) {
    const err: any = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    err.constraint = 'unique_brainlift_url';
    throw err;
  }
  // Echo back the inserted values plus an id, simulating the DB default for
  // categoryId (null) when it is not part of the values object.
  return [{ id: 1, status: 'pending', ...capturedInsertValues }];
});

const insert = vi.fn(() => ({
  values: vi.fn((vals: Record<string, any>) => {
    capturedInsertValues = vals;
    return { returning };
  }),
}));

// Dedup fallback: db.select().from().where().limit() resolves to [existingRow]
const limit = vi.fn(async () => (existingRow ? [existingRow] : []));
const select = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit,
    })),
  })),
}));

vi.mock('../base', () => ({
  db: { insert, select },
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...args) => ({ and: args })),
  sql: vi.fn(),
  inArray: vi.fn(),
  learningStreamItems: {
    brainliftId: 'brainlift_id',
    url: 'url',
  },
  swarmUsage: {},
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn(() => ({
    forPayload: vi.fn(() => ({
      queue: vi.fn(() => Promise.resolve()),
    })),
  })),
}));

vi.mock('../../db', () => ({
  pool: { query: vi.fn() },
}));

const { addLearningStreamItem } = await import('../learning-stream');

const baseItem = {
  type: 'Article',
  author: 'Jane Doe',
  topic: 'History of Education',
  time: '2024',
  facts: 'Some facts',
  url: 'https://example.com/article',
  source: 'swarm-research' as const,
};

describe('addLearningStreamItem categoryId persistence (FR1)', () => {
  beforeEach(() => {
    capturedInsertValues = null;
    insertShouldThrowDuplicate = false;
    existingRow = null;
    insert.mockClear();
    returning.mockClear();
    select.mockClear();
    limit.mockClear();
  });

  it('FR1 persists a provided categoryId (7) and returns it on the item', async () => {
    const result = await addLearningStreamItem(123, { ...baseItem, categoryId: 7 });

    expect(capturedInsertValues).toMatchObject({ categoryId: 7 });
    expect(result.categoryId).toBe(7);
  });

  it('FR1 persists categoryId: null when explicitly null', async () => {
    const result = await addLearningStreamItem(123, { ...baseItem, categoryId: null });

    expect(capturedInsertValues).toMatchObject({ categoryId: null });
    expect(result.categoryId).toBeNull();
  });

  it('FR1 defaults categoryId to null when omitted', async () => {
    const result = await addLearningStreamItem(123, { ...baseItem });

    expect(capturedInsertValues).toMatchObject({ categoryId: null });
    expect(result.categoryId).toBeNull();
  });

  it('FR1 does not overwrite categoryId on duplicate URL (dedup path returns existing unchanged)', async () => {
    // Simulate an existing item already saved with categoryId: 2
    insertShouldThrowDuplicate = true;
    existingRow = { id: 99, ...baseItem, status: 'pending', categoryId: 2 };

    const result = await addLearningStreamItem(123, { ...baseItem, categoryId: 5 });

    // The dedup path returns the existing row, NOT the new categoryId (5)
    expect(result.id).toBe(99);
    expect(result.categoryId).toBe(2);
  });
});
