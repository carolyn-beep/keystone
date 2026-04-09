import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsQueryString,
  getAnalyticsQuickRangeFilters,
  getDefaultAnalyticsPageFilters,
  getLastMonthAnalyticsPageFilters,
  getRollingAnalyticsPageFilters,
  normalizeAnalyticsPageFilters,
  parseAnalyticsLeaderboardAllowlist,
  resolveAnalyticsQuickRange,
  shouldShowAnalyticsLeaderboard,
} from '../useAnalyticsDashboard';

describe('analytics dashboard helpers', () => {
  it('builds a query string without empty values', () => {
    expect(
      buildAnalyticsQueryString({
        from: '2026-04-01',
        to: '2026-04-08',
        limit: 10,
        userId: '',
        origin: undefined,
      }),
    ).toBe('from=2026-04-01&to=2026-04-08&limit=10');
  });

  it('returns a default 30-day window ending today', () => {
    expect(getDefaultAnalyticsPageFilters(new Date('2026-04-08T12:00:00Z'))).toEqual({
      from: '2026-03-10',
      to: '2026-04-08',
    });
  });

  it('builds rolling quick ranges ending today', () => {
    expect(getRollingAnalyticsPageFilters(7, new Date('2026-04-08T12:00:00Z'))).toEqual({
      from: '2026-04-02',
      to: '2026-04-08',
    });

    expect(getAnalyticsQuickRangeFilters('14d', new Date('2026-04-08T12:00:00Z'))).toEqual({
      from: '2026-03-26',
      to: '2026-04-08',
    });
  });

  it('builds the previous calendar month quick range', () => {
    expect(getLastMonthAnalyticsPageFilters(new Date('2026-04-08T12:00:00Z'))).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    });
  });

  it('normalizes invalid or reversed date ranges', () => {
    expect(
      normalizeAnalyticsPageFilters(
        { from: '2026-04-20', to: '2026-04-08' },
        new Date('2026-04-08T12:00:00Z'),
      ),
    ).toEqual({
      from: '2026-04-08',
      to: '2026-04-20',
    });

    expect(
      normalizeAnalyticsPageFilters(
        { from: 'bad-date', to: undefined },
        new Date('2026-04-08T12:00:00Z'),
      ),
    ).toEqual({
      from: '2026-03-10',
      to: '2026-04-08',
    });
  });

  it('detects matching quick ranges and falls back to custom', () => {
    const now = new Date('2026-04-08T12:00:00Z');

    expect(resolveAnalyticsQuickRange({ from: '2026-04-02', to: '2026-04-08' }, now)).toBe('7d');
    expect(resolveAnalyticsQuickRange({ from: '2026-03-26', to: '2026-04-08' }, now)).toBe('14d');
    expect(resolveAnalyticsQuickRange({ from: '2026-03-01', to: '2026-03-31' }, now)).toBe('lastMonth');
    expect(resolveAnalyticsQuickRange({ from: '2026-03-10', to: '2026-04-08' }, now)).toBe('custom');
  });

  it('parses leaderboard allowlists and gates visibility by email', () => {
    expect(parseAnalyticsLeaderboardAllowlist('a@example.com, b@example.com')).toEqual([
      'a@example.com',
      'b@example.com',
    ]);

    expect(shouldShowAnalyticsLeaderboard('a@example.com', 'a@example.com, b@example.com')).toBe(true);
    expect(shouldShowAnalyticsLeaderboard('c@example.com', 'a@example.com, b@example.com')).toBe(false);
    expect(shouldShowAnalyticsLeaderboard('any@example.com', '')).toBe(true);
  });
});
