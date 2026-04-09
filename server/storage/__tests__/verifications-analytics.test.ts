import { describe, expect, it, vi } from 'vitest';

vi.mock('../base', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  eq: vi.fn(),
  and: vi.fn(),
  sql: Object.assign(vi.fn(), { join: vi.fn() }),
  facts: {},
  factVerifications: {},
  factModelScores: {},
  llmFeedback: {},
  modelAccuracyStats: {},
}));

vi.mock('../../middleware/error-handler', () => ({
  NotFoundError: class NotFoundError extends Error {},
}));

describe('verification persistence helpers', () => {
  it('derives the verification status from model results', async () => {
    const { deriveVerificationStatusForTest } = await import('../verifications');

    expect(deriveVerificationStatusForTest([
      { model: 'a', score: 4, rationale: 'ok', status: 'failed', error: null },
      { model: 'b', score: 5, rationale: 'ok', status: 'completed', error: null },
    ] as any)).toBe('completed');

    expect(deriveVerificationStatusForTest([
      { model: 'a', score: 4, rationale: 'ok', status: 'in_progress', error: null },
      { model: 'b', score: 5, rationale: 'ok', status: 'failed', error: null },
    ] as any)).toBe('in_progress');

    expect(deriveVerificationStatusForTest([
      { model: 'a', score: 4, rationale: 'ok', status: 'pending', error: null },
      { model: 'b', score: 5, rationale: 'ok', status: 'failed', error: null },
    ] as any)).toBe('failed');
  });

  it('builds one persisted model-score row per model result', async () => {
    const { buildFactModelScoreRowsForTest } = await import('../verifications');

    const rows = buildFactModelScoreRowsForTest(77, [
      { model: 'gpt-4.1', score: 4.6, rationale: 'close', status: 'completed', error: null },
      { model: 'o3', score: null, rationale: 'bad link', status: 'failed', error: 'network' },
    ] as any);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(expect.objectContaining({
      verificationId: 77,
      model: 'gpt-4.1',
      score: 5,
      rationale: 'close',
      status: 'completed',
      error: null,
    }));
    expect(rows[1]).toEqual(expect.objectContaining({
      verificationId: 77,
      model: 'o3',
      score: null,
      status: 'failed',
      error: 'network',
    }));
    expect(rows[0].completedAt).toBeInstanceOf(Date);
    expect(rows[1].completedAt).toBeInstanceOf(Date);
  });
});
