import { describe, expect, it } from 'vitest';
import {
  buildWeeklyConsistencyMetricsForTest,
  buildWeeklyModelDriftMetricsForTest,
  getSaoPauloWeekStartForTest,
  isScheduledConsistencyWindowForTest,
} from '../run-weekly-grader-consistency';
import type { WeeklyConsistencyResultRow } from '@shared/analytics-types';

function row(
  brainliftStableKey: string,
  level: WeeklyConsistencyResultRow['level'],
  stableKey: string,
  score: number | null,
): WeeklyConsistencyResultRow {
  return {
    runId: 1,
    passNumber: 1,
    brainliftStableKey,
    level,
    stableKey,
    score,
    metadata: null,
  };
}

describe('weekly grader consistency helpers', () => {
  it('recognizes the Sao Paulo Saturday 23:59 trigger window', () => {
    expect(isScheduledConsistencyWindowForTest(new Date('2026-04-12T02:59:00.000Z'))).toBe(true);
    expect(isScheduledConsistencyWindowForTest(new Date('2026-04-12T02:58:00.000Z'))).toBe(false);
    expect(isScheduledConsistencyWindowForTest(new Date('2026-04-11T23:59:00.000Z'))).toBe(false);
  });

  it('buckets runs by Sao Paulo local week start', () => {
    expect(getSaoPauloWeekStartForTest(new Date('2026-04-12T02:59:00.000Z')).toISOString()).toBe('2026-04-06T03:00:00.000Z');
  });

  it('computes weekly Pearson metrics by level and overall', () => {
    const pass1 = [
      row('brainlift:a', 'dok1', 'dok1:1', 2),
      row('brainlift:a', 'dok2', 'dok2:1', 3),
      row('brainlift:a', 'brainlift', 'brainlift:a', 2.5),
      row('brainlift:b', 'dok1', 'dok1:2', 4),
      row('brainlift:b', 'dok2', 'dok2:2', 5),
      row('brainlift:b', 'brainlift', 'brainlift:b', 4.5),
    ];
    const pass2 = [
      row('brainlift:a', 'dok1', 'dok1:1', 2),
      row('brainlift:a', 'dok2', 'dok2:1', 3),
      row('brainlift:a', 'brainlift', 'brainlift:a', 2.5),
      row('brainlift:b', 'dok1', 'dok1:2', 4),
      row('brainlift:b', 'dok2', 'dok2:2', 5),
      row('brainlift:b', 'brainlift', 'brainlift:b', 4.5),
    ];

    const metrics = buildWeeklyConsistencyMetricsForTest(pass1, pass2, 2);

    expect(metrics.monitoredBrainlifts).toBe(2);
    expect(metrics.overallPearsonR).toBe(1);
    expect(metrics.brainliftPearsonR).toBe(1);
    expect(metrics.byDokLevel.dok1).toBe(1);
    expect(metrics.byDokLevel.dok2).toBe(1);
    expect(metrics.comparableCoverage.dok1).toBe(1);
    expect(metrics.comparableCoverage.dok2).toBe(1);
  });

  it('computes week-over-week drift from pass 1 only', () => {
    const previous = [
      row('brainlift:a', 'dok1', 'dok1:1', 2),
      row('brainlift:a', 'dok2', 'dok2:1', 3),
      row('brainlift:a', 'brainlift', 'brainlift:a', 2.5),
      row('brainlift:b', 'dok1', 'dok1:2', 4),
      row('brainlift:b', 'dok2', 'dok2:2', 5),
      row('brainlift:b', 'brainlift', 'brainlift:b', 4.5),
    ];
    const current = [
      row('brainlift:a', 'dok1', 'dok1:1', 3),
      row('brainlift:a', 'dok2', 'dok2:1', 4),
      row('brainlift:a', 'brainlift', 'brainlift:a', 3.5),
      row('brainlift:b', 'dok1', 'dok1:2', 5),
      row('brainlift:b', 'dok2', 'dok2:2', 5),
      row('brainlift:b', 'brainlift', 'brainlift:b', 5),
    ];

    const drift = buildWeeklyModelDriftMetricsForTest(current, previous, '2026-04-06T03:00:00.000Z');

    expect(drift.comparedToWeekStart).toBe('2026-04-06T03:00:00.000Z');
    expect(drift.overallBrainliftDelta).toBe(0.75);
    expect(drift.byDokLevel.dok1).toBe(1);
    expect(drift.byDokLevel.dok2).toBe(0.5);
  });
});
