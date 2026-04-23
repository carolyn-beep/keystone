import type { JobHelpers } from 'graphile-worker';
import {
  completeWeeklyConsistencyRun,
  createOrReuseWeeklyConsistencyRun,
  failWeeklyConsistencyRun,
  getActiveGraderMonitoringSet,
  getFrozenSnapshotsForMonitoringSet,
  getPreviousCompletedWeeklyConsistencyRun,
  getWeeklyConsistencyPassResults,
  replaceWeeklyConsistencyPassResults,
  setWeeklyConsistencyRunRunning,
} from '../storage/grader-monitoring';
import { runFrozenConsistencyPass } from '../services/run-frozen-consistency-pass';
import type {
  RunWeeklyConsistencyJobPayload,
  WeeklyConsistencyMetrics,
  WeeklyConsistencyResultRow,
  WeeklyModelDriftMetrics,
  WeeklyResultLevel,
} from '@shared/analytics-types';

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';
const SAO_PAULO_OFFSET = '-03:00';
const SAO_PAULO_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getSaoPauloParts(date = new Date()) {
  const parts = SAO_PAULO_PARTS_FORMATTER.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: value('weekday'),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function getSaoPauloWeekStart(date = new Date()): Date {
  const parts = getSaoPauloParts(date);
  const weekdayIndex = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  }[parts.weekday] ?? 0;

  const localMidnight = new Date(
    `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T00:00:00${SAO_PAULO_OFFSET}`,
  );
  localMidnight.setUTCDate(localMidnight.getUTCDate() - weekdayIndex);
  return localMidnight;
}

function isScheduledConsistencyWindow(date = new Date()): boolean {
  const parts = getSaoPauloParts(date);
  return parts.weekday === 'Sat' && parts.hour === 23 && parts.minute === 59;
}

function pearsonCorrelation(pairs: Array<{ left: number; right: number }>): number | null {
  if (pairs.length < 2) {
    return null;
  }

  const leftMean = pairs.reduce((sum, pair) => sum + pair.left, 0) / pairs.length;
  const rightMean = pairs.reduce((sum, pair) => sum + pair.right, 0) / pairs.length;

  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (const pair of pairs) {
    const leftDelta = pair.left - leftMean;
    const rightDelta = pair.right - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  if (!Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  const value = numerator / denominator;
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : null;
}

function comparablePairs(
  leftRows: WeeklyConsistencyResultRow[],
  rightRows: WeeklyConsistencyResultRow[],
  level: Exclude<WeeklyResultLevel, 'brainlift'> | 'brainlift' | 'all',
): Array<{ left: number; right: number }> {
  const leftByKey = new Map<string, number>();

  for (const row of leftRows) {
    if (row.score === null) {
      continue;
    }
    if (level !== 'all' && row.level !== level) {
      continue;
    }
    if (level === 'all' && row.level === 'brainlift') {
      continue;
    }
    leftByKey.set(`${row.brainliftStableKey}:${row.level}:${row.stableKey}`, row.score);
  }

  const pairs: Array<{ left: number; right: number }> = [];
  for (const row of rightRows) {
    if (row.score === null) {
      continue;
    }
    if (level !== 'all' && row.level !== level) {
      continue;
    }
    if (level === 'all' && row.level === 'brainlift') {
      continue;
    }
    const key = `${row.brainliftStableKey}:${row.level}:${row.stableKey}`;
    const left = leftByKey.get(key);
    if (left === undefined) {
      continue;
    }
    pairs.push({ left, right: row.score });
  }

  return pairs;
}

function coverage(
  leftRows: WeeklyConsistencyResultRow[],
  rightRows: WeeklyConsistencyResultRow[],
  level: Exclude<WeeklyResultLevel, 'brainlift'>,
): number {
  const leftKeys = new Set(
    leftRows
      .filter((row) => row.level === level && row.score !== null)
      .map((row) => `${row.brainliftStableKey}:${row.stableKey}`),
  );
  if (leftKeys.size === 0) {
    return 0;
  }

  let comparable = 0;
  for (const row of rightRows) {
    if (row.level !== level || row.score === null) {
      continue;
    }
    if (leftKeys.has(`${row.brainliftStableKey}:${row.stableKey}`)) {
      comparable += 1;
    }
  }

  return comparable / leftKeys.size;
}

function meanComparableScore(
  currentRows: WeeklyConsistencyResultRow[],
  previousRows: WeeklyConsistencyResultRow[],
  level: WeeklyResultLevel,
): number | null {
  const pairs = comparablePairs(previousRows, currentRows, level);
  if (pairs.length === 0) {
    return null;
  }
  return pairs.reduce((sum, pair) => sum + pair.right, 0) / pairs.length;
}

function meanPreviousComparableScore(
  currentRows: WeeklyConsistencyResultRow[],
  previousRows: WeeklyConsistencyResultRow[],
  level: WeeklyResultLevel,
): number | null {
  const pairs = comparablePairs(previousRows, currentRows, level);
  if (pairs.length === 0) {
    return null;
  }
  return pairs.reduce((sum, pair) => sum + pair.left, 0) / pairs.length;
}

function buildWeeklyConsistencyMetrics(
  pass1Rows: WeeklyConsistencyResultRow[],
  pass2Rows: WeeklyConsistencyResultRow[],
  monitoredBrainlifts: number,
): WeeklyConsistencyMetrics {
  return {
    overallPearsonR: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'all')),
    brainliftPearsonR: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'brainlift')),
    byDokLevel: {
      dok1: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'dok1')),
      dok2: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'dok2')),
      dok3: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'dok3')),
      dok4: pearsonCorrelation(comparablePairs(pass1Rows, pass2Rows, 'dok4')),
    },
    comparableCoverage: {
      dok1: coverage(pass1Rows, pass2Rows, 'dok1'),
      dok2: coverage(pass1Rows, pass2Rows, 'dok2'),
      dok3: coverage(pass1Rows, pass2Rows, 'dok3'),
      dok4: coverage(pass1Rows, pass2Rows, 'dok4'),
    },
    monitoredBrainlifts,
  };
}

function buildWeeklyModelDriftMetrics(
  currentPass1Rows: WeeklyConsistencyResultRow[],
  previousPass1Rows: WeeklyConsistencyResultRow[] | null,
  previousWeekStart: string | null,
): WeeklyModelDriftMetrics {
  if (!previousPass1Rows || previousPass1Rows.length === 0 || !previousWeekStart) {
    return {
      representativePass: 1,
      comparedToWeekStart: null,
      overallBrainliftDelta: null,
      byDokLevel: {
        dok1: null,
        dok2: null,
        dok3: null,
        dok4: null,
      },
    };
  }

  const deltaFor = (level: WeeklyResultLevel): number | null => {
    const currentMean = meanComparableScore(currentPass1Rows, previousPass1Rows, level);
    const previousMean = meanPreviousComparableScore(currentPass1Rows, previousPass1Rows, level);
    if (currentMean === null || previousMean === null) {
      return null;
    }
    return currentMean - previousMean;
  };

  return {
    representativePass: 1,
    comparedToWeekStart: previousWeekStart,
    overallBrainliftDelta: deltaFor('brainlift'),
    byDokLevel: {
      dok1: deltaFor('dok1'),
      dok2: deltaFor('dok2'),
      dok3: deltaFor('dok3'),
      dok4: deltaFor('dok4'),
    },
  };
}

export function getSaoPauloWeekStartForTest(date = new Date()) {
  return getSaoPauloWeekStart(date);
}

export function isScheduledConsistencyWindowForTest(date = new Date()) {
  return isScheduledConsistencyWindow(date);
}

export function buildWeeklyConsistencyMetricsForTest(
  pass1Rows: WeeklyConsistencyResultRow[],
  pass2Rows: WeeklyConsistencyResultRow[],
  monitoredBrainlifts: number,
) {
  return buildWeeklyConsistencyMetrics(pass1Rows, pass2Rows, monitoredBrainlifts);
}

export function buildWeeklyModelDriftMetricsForTest(
  currentPass1Rows: WeeklyConsistencyResultRow[],
  previousPass1Rows: WeeklyConsistencyResultRow[] | null,
  previousWeekStart: string | null,
) {
  return buildWeeklyModelDriftMetrics(currentPass1Rows, previousPass1Rows, previousWeekStart);
}

export async function runWeeklyGraderConsistencyJob(
  payload: RunWeeklyConsistencyJobPayload,
  helpers: JobHelpers,
): Promise<void> {
  if (payload.triggerKind === 'cron' && !isScheduledConsistencyWindow()) {
    helpers.logger.info('[Analytics Weekly Consistency] Outside Sao Paulo weekly window, skipping');
    return;
  }

  let runId: number | null = null;

  try {
    const monitoringSet = await getActiveGraderMonitoringSet();
    if (!monitoringSet) {
      throw new Error('No active grader monitoring set configured');
    }

    const snapshots = await getFrozenSnapshotsForMonitoringSet(monitoringSet.id, monitoringSet.snapshotVersion);
    if (snapshots.length === 0) {
      throw new Error('Active grader monitoring set has no frozen brainlifts');
    }

    const weekStart = getSaoPauloWeekStart();
    const run = await createOrReuseWeeklyConsistencyRun({
      monitoringSetId: monitoringSet.id,
      snapshotVersion: monitoringSet.snapshotVersion,
      weekStart,
      triggerKind: payload.triggerKind,
    });
    runId = run.id;

    await setWeeklyConsistencyRunRunning(run.id);

    const pass1Rows = await runFrozenConsistencyPass(snapshots, 1);
    await replaceWeeklyConsistencyPassResults(
      run.id,
      1,
      pass1Rows.map((row) => ({ ...row, runId: run.id })),
    );

    const pass2Rows = await runFrozenConsistencyPass(snapshots, 2);
    await replaceWeeklyConsistencyPassResults(
      run.id,
      2,
      pass2Rows.map((row) => ({ ...row, runId: run.id })),
    );

    const previousRun = await getPreviousCompletedWeeklyConsistencyRun({
      monitoringSetId: monitoringSet.id,
      snapshotVersion: monitoringSet.snapshotVersion,
      beforeWeekStart: weekStart,
    });

    const previousPass1Rows = previousRun
      ? await getWeeklyConsistencyPassResults(previousRun.id, 1)
      : null;

    const metrics = buildWeeklyConsistencyMetrics(pass1Rows, pass2Rows, snapshots.length);
    const driftMetrics = buildWeeklyModelDriftMetrics(
      pass1Rows,
      previousPass1Rows,
      previousRun?.weekStart ?? null,
    );

    await completeWeeklyConsistencyRun(run.id, metrics, driftMetrics);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    helpers.logger.error(`[Analytics Weekly Consistency] ${message}`);
    if (runId !== null) {
      await failWeeklyConsistencyRun(runId, message);
    }
    throw error;
  }
}
