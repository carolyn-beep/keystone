import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows: Array<{ url: string | null }> = [];
const selectDistinct = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(async () => rows),
  })),
}));

vi.mock('../base', () => ({
  db: { selectDistinct },
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn(),
  sql: vi.fn(),
  learningStreamItems: {
    brainliftId: 'brainlift_id',
    url: 'url',
  },
  swarmUsage: {},
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn(),
}));

vi.mock('../../db', () => ({
  pool: { query: vi.fn() },
}));

const { getLearningStreamUrls } = await import('../learning-stream');

describe('getLearningStreamUrls', () => {
  beforeEach(() => {
    rows.length = 0;
    selectDistinct.mockClear();
  });

  it('FR4 returns a flat array of URL strings', async () => {
    rows.push(
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
      { url: 'https://example.com/c' },
    );

    await expect(getLearningStreamUrls(123)).resolves.toEqual([
      'https://example.com/a',
      'https://example.com/b',
      'https://example.com/c',
    ]);
  });

  it('FR4 returns [] when there are no learning stream items', async () => {
    await expect(getLearningStreamUrls(123)).resolves.toEqual([]);
  });

  it('FR4 uses a distinct URL projection and filters null defensively', async () => {
    rows.push(
      { url: 'https://example.com/a' },
      { url: 'https://example.com/a' },
      { url: null },
    );

    await expect(getLearningStreamUrls(123)).resolves.toEqual(['https://example.com/a']);
    expect(selectDistinct).toHaveBeenCalledWith({ url: 'url' });
  });
});
