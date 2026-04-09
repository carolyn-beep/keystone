import { describe, expect, it, vi } from 'vitest';
vi.mock('../../db', () => ({
  db: {},
}));
import {
  buildBrainliftScoreHistoryResponseForTest,
  buildDokCliffResponseForTest,
  buildScoreDistributionResponseForTest,
  buildScoreImprovementRowsForTest,
  buildQualityLeaderboardRowsForTest,
  bucketAnalyticsDateForTest,
  coerceHumanVerificationMetricsForTest,
  groupLeaderboardRowsForTest,
  resolveAnalyticsDateWindowForTest,
  selectVanillaComparisonRowsForTest,
} from '../analytics-dashboard';

describe('analytics-dashboard helpers', () => {
  it('normalizes date windows and swaps reversed inputs', () => {
    const window = resolveAnalyticsDateWindowForTest({
      from: '2026-04-08',
      to: '2026-04-01',
    });

    expect(window.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-04-08T23:59:59.999Z');
  });

  it('buckets dates by UTC day', () => {
    expect(bucketAnalyticsDateForTest('2026-04-08T12:34:56.000Z')).toBe('2026-04-08');
  });

  it('coerces human verification metrics into stable numeric shapes', () => {
    expect(coerceHumanVerificationMetricsForTest({
      scoreStabilityRate: '0.72',
      changedCount: '3',
      agreeChangedCount: '1',
      borderlineChangedCount: '1',
      disagreeChangedCount: '1',
    })).toEqual({
      scoreStabilityRate: 0.72,
      changedCount: 3,
      agreeChangedCount: 1,
      borderlineChangedCount: 1,
      disagreeChangedCount: 1,
    });
  });

  it('fills missing vanilla-comparison tiers from fallback rows', () => {
    const rows = selectVanillaComparisonRowsForTest(
      [
        { id: 1, brainliftId: 1, brainliftSlug: 'a', brainliftTitle: 'A', score: 4, scoreTier: 4, text: 'tier 4', divergenceQuestion: null, divergenceVanillaResponse: null, gradedAt: '2026-04-08T10:00:00.000Z' },
        { id: 2, brainliftId: 1, brainliftSlug: 'a', brainliftTitle: 'A', score: 2, scoreTier: 2, text: 'tier 2', divergenceQuestion: null, divergenceVanillaResponse: null, gradedAt: '2026-04-08T09:00:00.000Z' },
      ],
      [
        { id: 3, brainliftId: 2, brainliftSlug: 'b', brainliftTitle: 'B', score: 1, scoreTier: 1, text: 'tier 1', divergenceQuestion: null, divergenceVanillaResponse: null, gradedAt: '2026-04-07T10:00:00.000Z' },
        { id: 4, brainliftId: 2, brainliftSlug: 'b', brainliftTitle: 'B', score: 3, scoreTier: 3, text: 'tier 3', divergenceQuestion: null, divergenceVanillaResponse: null, gradedAt: '2026-04-07T09:00:00.000Z' },
      ],
    );

    expect(rows.map((row) => row.scoreTier)).toEqual([1, 2, 3, 4]);
  });

  it('groups leaderboard rows by owner and sums row counts without SQL aggregation', () => {
    const rows = groupLeaderboardRowsForTest([
      { ownerUserId: 'u1', ownerName: 'Alpha', ownerEmail: 'alpha@example.com', brainliftId: 10, value: 1 },
      { ownerUserId: 'u1', ownerName: 'Alpha', ownerEmail: 'alpha@example.com', brainliftId: 10, value: 1 },
      { ownerUserId: 'u1', ownerName: 'Alpha', ownerEmail: 'alpha@example.com', brainliftId: 11, value: 1 },
      { ownerUserId: 'u2', ownerName: 'Beta', ownerEmail: 'beta@example.com', brainliftId: 20, value: 1 },
      { ownerUserId: null, ownerName: 'Ignored', ownerEmail: 'ignored@example.com', brainliftId: 30, value: 99 },
    ]);

    expect(rows).toEqual([
      {
        userId: 'u1',
        userName: 'Alpha',
        userEmail: 'alpha@example.com',
        value: 3,
        secondaryValue: 2,
      },
      {
        userId: 'u2',
        userName: 'Beta',
        userEmail: 'beta@example.com',
        value: 1,
        secondaryValue: 1,
      },
    ]);
  });

  it('builds quality leaderboard rows from each brainlift latest score and averages by owner', () => {
    const rows = buildQualityLeaderboardRowsForTest([
      {
        brainliftId: 1,
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        lastEventAt: new Date('2026-04-08T10:00:00.000Z'),
        endOverallScore: '2.00',
      },
      {
        brainliftId: 1,
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        lastEventAt: new Date('2026-04-08T12:00:00.000Z'),
        endOverallScore: '3.00',
      },
      {
        brainliftId: 2,
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        lastEventAt: new Date('2026-04-08T11:00:00.000Z'),
        endOverallScore: '4.00',
      },
      {
        brainliftId: 3,
        ownerUserId: 'u2',
        ownerName: 'Beta',
        ownerEmail: 'beta@example.com',
        lastEventAt: new Date('2026-04-08T09:00:00.000Z'),
        endOverallScore: '4.50',
      },
    ]);

    expect(rows).toEqual([
      {
        userId: 'u2',
        userName: 'Beta',
        userEmail: 'beta@example.com',
        value: 4.5,
        secondaryValue: 1,
      },
      {
        userId: 'u1',
        userName: 'Alpha',
        userEmail: 'alpha@example.com',
        value: 3.5,
        secondaryValue: 2,
      },
    ]);
  });

  it('summarizes the DOK cliff from level averages', () => {
    expect(buildDokCliffResponseForTest([
      { dokLevel: 1, label: 'DOK1', averageScore: 3.92, brainliftCount: 12 },
      { dokLevel: 2, label: 'DOK2', averageScore: 3.68, brainliftCount: 10 },
      { dokLevel: 3, label: 'DOK3', averageScore: 2.84, brainliftCount: 8 },
      { dokLevel: 4, label: 'DOK4', averageScore: 2.11, brainliftCount: 6 },
    ], 14)).toEqual({
      hasData: true,
      rows: [
        { dokLevel: 1, label: 'DOK1', averageScore: 3.92, brainliftCount: 12 },
        { dokLevel: 2, label: 'DOK2', averageScore: 3.68, brainliftCount: 10 },
        { dokLevel: 3, label: 'DOK3', averageScore: 2.84, brainliftCount: 8 },
        { dokLevel: 4, label: 'DOK4', averageScore: 2.11, brainliftCount: 6 },
      ],
      summary: {
        totalBrainlifts: 14,
        dok1Average: 3.92,
        dok4Average: 2.11,
        cliffDrop: 1.81,
      },
    });
  });

  it('builds an item histogram response across score buckets', () => {
    expect(buildScoreDistributionResponseForTest([
      { score: 1, count: 2 },
      { score: 3, count: 8 },
      { score: 4, count: 6 },
      { score: 5, count: 4 },
    ])).toEqual({
      hasData: true,
      buckets: [
        { score: 1, label: '1', count: 2, share: 0.1 },
        { score: 2, label: '2', count: 0, share: 0 },
        { score: 3, label: '3', count: 8, share: 0.4 },
        { score: 4, label: '4', count: 6, share: 0.3 },
        { score: 5, label: '5', count: 4, share: 0.2 },
      ],
      totals: {
        totalScoredItems: 20,
        averageScore: 3.5,
        modalScore: 3,
        distinctScores: 4,
      },
    });
  });

  it('uses import rows as baseline only and excludes import-only brainlifts from score improvement', () => {
    const rows = buildScoreImprovementRowsForTest([
      {
        brainliftId: 1,
        brainliftSlug: 'import-only',
        brainliftTitle: 'Import Only',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T10:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T10:00:00.000Z'),
        eventCount: 1,
        triggerSet: ['import'],
        startOverallScore: '2.50',
        endOverallScore: '2.50',
      },
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T09:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T09:00:00.000Z'),
        eventCount: 1,
        triggerSet: ['import'],
        startOverallScore: '2.77',
        endOverallScore: '2.77',
      },
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T10:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T10:05:00.000Z'),
        eventCount: 2,
        triggerSet: ['import', 'regrade'],
        startOverallScore: '2.77',
        endOverallScore: '3.73',
      },
    ]);

    expect(rows).toEqual([
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        firstScore: 2.77,
        latestScore: 3.73,
        delta: 0.96,
        totalEvents: 1,
        totalWindows: 1,
        latestRecordedAt: '2026-04-08T10:05:00.000Z',
      },
    ]);
  });

  it('builds chart points from baseline plus each score window end', () => {
    expect(buildBrainliftScoreHistoryResponseForTest([
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T09:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T09:00:00.000Z'),
        eventCount: 1,
        triggerSet: ['import'],
        startOverallScore: '2.77',
        endOverallScore: '2.77',
      },
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T10:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T10:05:00.000Z'),
        eventCount: 2,
        triggerSet: ['import', 'regrade'],
        startOverallScore: '2.77',
        endOverallScore: '3.73',
      },
      {
        brainliftId: 2,
        brainliftSlug: 'improved',
        brainliftTitle: 'Improved',
        ownerUserId: 'u1',
        ownerName: 'Alpha',
        ownerEmail: 'alpha@example.com',
        origin: 'ui',
        windowStartedAt: new Date('2026-04-08T12:00:00.000Z'),
        lastEventAt: new Date('2026-04-08T12:04:00.000Z'),
        eventCount: 1,
        triggerSet: ['regrade'],
        startOverallScore: '3.73',
        endOverallScore: '4.00',
      },
    ])).toEqual({
      hasData: true,
      points: [
        { recordedAt: '2026-04-08T09:00:00.000Z', score: 2.77, kind: 'baseline' },
        { recordedAt: '2026-04-08T10:05:00.000Z', score: 3.73, kind: 'window_end' },
        { recordedAt: '2026-04-08T12:04:00.000Z', score: 4, kind: 'window_end' },
      ],
    });
  });
});
