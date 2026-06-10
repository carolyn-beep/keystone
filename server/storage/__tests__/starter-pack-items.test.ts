/**
 * Tests for 05-starter-pack FR3 storage helpers:
 *   - hasStarterPackItems     (any-status existence check, source='starter-pack')
 *   - getPendingStarterPackItems (status='pending' AND source='starter-pack', DB-side)
 *   - discardStarterPackItems (single brainlift-scoped UPDATE over an id list)
 *   - getSwarmUsageToday quick-row exclusion (run_spec->>'quick' IS DISTINCT FROM 'true')
 *
 * `db` is mocked: each helper's query builder records the predicate factory
 * calls so we can assert WHAT was filtered (source/status/brainliftId/id-list)
 * without a real Postgres.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Recorders for the predicate factories.
const eqCalls: Array<[unknown, unknown]> = [];
const inArrayCalls: Array<[unknown, unknown]> = [];
const andCalls: unknown[][] = [];
const sqlCalls: string[] = [];

// Query-builder spies. Each terminal returns the queued rows.
let selectRows: unknown[] = [];
const limit = vi.fn(async () => selectRows);
// `where` is both chainable (.limit / .orderBy) AND awaitable (getSwarmUsageToday
// awaits db.select().from().where() directly).
const where = vi.fn(() => {
  const chain = {
    limit,
    orderBy: vi.fn(async () => selectRows),
    then: (resolve: (v: unknown[]) => void) => resolve(selectRows),
  };
  return chain;
});
const from = vi.fn(() => ({ where }));
const select = vi.fn(() => ({ from }));

const updateWhere = vi.fn(async () => undefined);
const set = vi.fn(() => ({ where: updateWhere }));
const update = vi.fn(() => ({ set }));

vi.mock('../base', () => ({
  db: { select, update },
  eq: (a: unknown, b: unknown) => { eqCalls.push([a, b]); return { eq: [a, b] }; },
  inArray: (a: unknown, b: unknown) => { inArrayCalls.push([a, b]); return { inArray: [a, b] }; },
  and: (...preds: unknown[]) => { andCalls.push(preds); return { and: preds }; },
  sql: (strings: TemplateStringsArray, ...vals: unknown[]) => {
    const raw = strings.join('?');
    sqlCalls.push(raw);
    return { sqlRaw: raw, vals };
  },
  learningStreamItems: {
    id: 'col.id',
    brainliftId: 'col.brainlift_id',
    status: 'col.status',
    source: 'col.source',
    createdAt: 'col.created_at',
    updatedAt: 'col.updated_at',
  },
  swarmUsage: { userId: 'su.user_id', createdAt: 'su.created_at' },
}));

vi.mock('../../utils/withJob', () => ({ withJob: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: vi.fn() } }));

const {
  hasStarterPackItems,
  getPendingStarterPackItems,
  discardStarterPackItems,
  getSwarmUsageToday,
} = await import('../learning-stream');

beforeEach(() => {
  eqCalls.length = 0;
  inArrayCalls.length = 0;
  andCalls.length = 0;
  sqlCalls.length = 0;
  selectRows = [];
  vi.clearAllMocks();
});

describe('FR3: hasStarterPackItems', () => {
  it('returns true when a starter-pack row exists (any status)', async () => {
    selectRows = [{ id: 1 }];
    await expect(hasStarterPackItems(42)).resolves.toBe(true);
    // Filters on brainliftId AND source='starter-pack'; existence uses LIMIT 1.
    expect(eqCalls).toContainEqual(['col.brainlift_id', 42]);
    expect(eqCalls).toContainEqual(['col.source', 'starter-pack']);
    expect(limit).toHaveBeenCalledWith(1);
    // No status predicate — existence check is status-agnostic.
    expect(eqCalls).not.toContainEqual(['col.status', 'pending']);
  });

  it('returns false when no starter-pack row exists', async () => {
    selectRows = [];
    await expect(hasStarterPackItems(42)).resolves.toBe(false);
  });
});

describe('FR3: getPendingStarterPackItems', () => {
  it('filters status=pending AND source=starter-pack AND brainliftId DB-side', async () => {
    selectRows = [{ id: 1, topic: 'A', facts: 'fa', url: 'https://a' }];
    const rows = await getPendingStarterPackItems(42);

    expect(rows).toEqual([{ id: 1, topic: 'A', facts: 'fa', url: 'https://a' }]);
    expect(eqCalls).toContainEqual(['col.brainlift_id', 42]);
    expect(eqCalls).toContainEqual(['col.status', 'pending']);
    expect(eqCalls).toContainEqual(['col.source', 'starter-pack']);
  });
});

describe('FR3: discardStarterPackItems', () => {
  it('issues one UPDATE scoped to the brainlift and the id list', async () => {
    await discardStarterPackItems([2, 5], 42);

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: 'discarded' }));
    expect(inArrayCalls).toContainEqual(['col.id', [2, 5]]);
    expect(eqCalls).toContainEqual(['col.brainlift_id', 42]);
  });

  it('is a no-op (no UPDATE) for an empty id list', async () => {
    await discardStarterPackItems([], 42);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('FR3: getSwarmUsageToday quick-row exclusion', () => {
  it('excludes rows whose run_spec quick flag is true so the quota is unaffected', async () => {
    selectRows = [{ count: 1 }];
    await getSwarmUsageToday('user-1');

    // The day-boundary + quick-exclusion predicates are SQL fragments.
    const allSql = sqlCalls.join(' | ');
    expect(allSql).toMatch(/run_spec/);
    expect(allSql).toMatch(/quick/);
    expect(allSql).toMatch(/DISTINCT FROM|<>|!=/i);
  });
});
