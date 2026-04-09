import {
  db,
  and,
  asc,
  desc,
  eq,
  inArray,
  sql,
  brainlifts,
  facts,
  dok2Summaries,
  dok3Insights,
  dok4Spovs,
  brainliftScoreLog,
  qaBatches,
} from './base';
import { dokItemVersions, user } from '@shared/schema';
import type {
  AnalyticsDokLevelFilter,
  AnalyticsDateFilter,
  AnalyticsOrigin,
  BrainliftScoreHistoryPoint,
  BrainliftScoreHistoryResponse,
  DokCliffLevelRow,
  DokCliffResponse,
  HumanVerificationMetricSummary,
  HumanVerificationResponse,
  LeaderboardRankBy,
  LeaderboardResponse,
  LeaderboardRow,
  ScoreDistributionFilters,
  ScoreDistributionBucket,
  ScoreDistributionResponse,
  ScoreImprovementResponse,
  ScoreImprovementRow,
  SpovDistributionResponse,
  VanillaComparisonResponse,
  VanillaComparisonRow,
  VolumeBucketRow,
  VolumeFilters,
  VolumeResponse,
} from '@shared/analytics-types';

const DEFAULT_ANALYTICS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DOK_CLIFF_LEVELS = [
  { dokLevel: 1, label: 'DOK1' },
  { dokLevel: 2, label: 'DOK2' },
  { dokLevel: 3, label: 'DOK3' },
  { dokLevel: 4, label: 'DOK4' },
] as const;
const SCORE_DISTRIBUTION_BUCKETS = [1, 2, 3, 4, 5] as const;

type AnalyticsDateWindow = {
  from: Date;
  to: Date;
};

type BrainliftScopeRow = {
  id: number;
  slug: string;
  title: string;
  createdByUserId: string | null;
  origin: AnalyticsOrigin | null;
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
};

type ScoreHistoryRow = {
  brainliftId: number;
  brainliftSlug: string;
  brainliftTitle: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  origin: AnalyticsOrigin | null;
  windowStartedAt: Date;
  lastEventAt: Date;
  eventCount: number;
  triggerSet: string[];
  startOverallScore: string;
  endOverallScore: string;
};

type QualityLeaderboardSourceRow = Pick<
  ScoreHistoryRow,
  'brainliftId' | 'ownerUserId' | 'ownerName' | 'ownerEmail' | 'lastEventAt' | 'endOverallScore'
>;

type VanillaComparisonCandidate = VanillaComparisonRow & {
  createdAt?: string;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCount(value: unknown): number {
  const parsed = toNumber(value);
  return parsed === null ? 0 : parsed;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function bucketDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function rangeCondition(column: unknown, from: Date, to: Date) {
  return sql`${column} between ${from} and ${to}`;
}

function resolveWindow(filters: AnalyticsDateFilter = {}): AnalyticsDateWindow {
  const fallbackTo = new Date();
  const fallbackFrom = new Date(fallbackTo.getTime() - DEFAULT_ANALYTICS_WINDOW_DAYS * DAY_MS);

  const to = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : fallbackTo;
  const from = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : fallbackFrom;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { from: fallbackFrom, to: fallbackTo };
  }

  if (from.getTime() <= to.getTime()) {
    return { from, to };
  }

  return {
    from: filters.to ? new Date(`${filters.to}T00:00:00.000Z`) : fallbackFrom,
    to: filters.from ? new Date(`${filters.from}T23:59:59.999Z`) : fallbackTo,
  };
}

function buildScopeWhere(filters: Pick<VolumeFilters, 'userId' | 'origin'>) {
  const conditions = [];
  if (filters.userId) {
    conditions.push(eq(brainlifts.createdByUserId, filters.userId));
  }
  if (filters.origin && filters.origin !== 'all') {
    conditions.push(eq(brainlifts.origin, filters.origin));
  }
  return conditions.length > 0 ? and(...conditions) : sql`true`;
}

async function loadBrainliftScope(filters: Pick<VolumeFilters, 'userId' | 'origin'>): Promise<BrainliftScopeRow[]> {
  return db
    .select({
      id: brainlifts.id,
      slug: brainlifts.slug,
      title: brainlifts.title,
      createdByUserId: brainlifts.createdByUserId,
      origin: brainlifts.origin,
      createdAt: brainlifts.createdAt,
      ownerName: user.name,
      ownerEmail: user.email,
    })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(buildScopeWhere(filters));
}

function shouldIncludeDokLevel(filters: VolumeFilters, level: 1 | 2 | 3 | 4): boolean {
  return !filters.dokLevel || filters.dokLevel === 'all' || filters.dokLevel === level;
}

function upsertBucket(series: Map<string, VolumeBucketRow>, bucket: string): VolumeBucketRow {
  const existing = series.get(bucket);
  if (existing) return existing;

  const row = {
    bucket,
    brainlifts: 0,
    facts: 0,
    dok2Summaries: 0,
    dok3Insights: 0,
    dok4Spovs: 0,
    gradingEvents: 0,
  };
  series.set(bucket, row);
  return row;
}

function incrementBucket(
  series: Map<string, VolumeBucketRow>,
  bucket: string,
  field: keyof Omit<VolumeBucketRow, 'bucket'>,
  amount = 1,
) {
  upsertBucket(series, bucket)[field] += amount;
}

function sortBuckets(series: Map<string, VolumeBucketRow>): VolumeBucketRow[] {
  return Array.from(series.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function isRelevantScoreTier(scoreTier: VanillaComparisonRow['scoreTier']): scoreTier is 1 | 2 | 3 | 4 {
  return scoreTier === 1 || scoreTier === 2 || scoreTier === 3 || scoreTier === 4;
}

function scoreTierFromScore(score: number | null): VanillaComparisonRow['scoreTier'] {
  if (score === null) return 'rejected';
  const rounded = Math.max(1, Math.min(4, Math.round(score)));
  return rounded as 1 | 2 | 3 | 4;
}

function toHumanVerificationMetrics(metrics: unknown): HumanVerificationMetricSummary {
  const record = metrics && typeof metrics === 'object' && !Array.isArray(metrics)
    ? metrics as Record<string, unknown>
    : {};

  return {
    scoreStabilityRate: toNumber(record.scoreStabilityRate) ?? 0,
    changedCount: toCount(record.changedCount),
    agreeChangedCount: toCount(record.agreeChangedCount),
    borderlineChangedCount: toCount(record.borderlineChangedCount),
    disagreeChangedCount: toCount(record.disagreeChangedCount),
  };
}

function toHumanVerificationBaseline(row: { metrics: unknown; sampleCount: number } | undefined) {
  if (!row) return null;

  const metrics = row.metrics && typeof row.metrics === 'object' && !Array.isArray(row.metrics)
    ? row.metrics as Record<string, unknown>
    : null;

  const weightedAgreement = toNumber(metrics?.weightedAgreement);
  if (weightedAgreement === null) return null;

  return {
    weightedAgreement,
    totalItems: toCount(metrics?.totalItems) || row.sampleCount,
  };
}

function pickRepresentativeVanillaComparisonRows(
  primaryRows: VanillaComparisonCandidate[],
  fallbackRows: VanillaComparisonCandidate[] = [],
): VanillaComparisonCandidate[] {
  const picked = new Map<1 | 2 | 3 | 4, VanillaComparisonCandidate>();
  const seenIds = new Set<number>();

  const tryPick = (rows: VanillaComparisonCandidate[]) => {
    const ordered = [...rows].sort((a, b) => {
      const aTime = a.gradedAt ? new Date(a.gradedAt).getTime() : 0;
      const bTime = b.gradedAt ? new Date(b.gradedAt).getTime() : 0;
      return bTime - aTime;
    });

    for (const row of ordered) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      if (!isRelevantScoreTier(row.scoreTier)) continue;
      if (!picked.has(row.scoreTier)) {
        picked.set(row.scoreTier, row);
      }
    }
  };

  tryPick(primaryRows);
  if (picked.size < 4) {
    tryPick(fallbackRows);
  }

  return Array.from(picked.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

async function loadBrainliftScoreHistory(
  filters: AnalyticsDateFilter,
  brainliftId?: number,
): Promise<ScoreHistoryRow[]> {
  const { from, to } = resolveWindow(filters);

  return db
    .select({
      brainliftId: brainliftScoreLog.brainliftId,
      brainliftSlug: brainlifts.slug,
      brainliftTitle: brainlifts.title,
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      origin: brainlifts.origin,
      windowStartedAt: brainliftScoreLog.windowStartedAt,
      lastEventAt: brainliftScoreLog.lastEventAt,
      eventCount: brainliftScoreLog.eventCount,
      triggerSet: brainliftScoreLog.triggerSet,
      startOverallScore: brainliftScoreLog.startOverallScore,
      endOverallScore: brainliftScoreLog.endOverallScore,
    })
    .from(brainliftScoreLog)
    .innerJoin(brainlifts, eq(brainliftScoreLog.brainliftId, brainlifts.id))
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(and(
      rangeCondition(brainliftScoreLog.lastEventAt, from, to),
      brainliftId ? eq(brainliftScoreLog.brainliftId, brainliftId) : undefined,
    ))
    .orderBy(asc(brainliftScoreLog.lastEventAt));
}

function toRoundedAverage(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Number(parsed.toFixed(2));
}

function buildDokCliffResponse(rows: DokCliffLevelRow[], totalBrainlifts: number): DokCliffResponse {
  const dok1Average = rows.find((row) => row.dokLevel === 1)?.averageScore ?? null;
  const dok4Average = rows.find((row) => row.dokLevel === 4)?.averageScore ?? null;

  return {
    hasData: rows.some((row) => row.averageScore !== null),
    rows,
    summary: {
      totalBrainlifts,
      dok1Average,
      dok4Average,
      cliffDrop: dok1Average !== null && dok4Average !== null
        ? Number((dok1Average - dok4Average).toFixed(2))
        : null,
    },
  };
}

function toScoreBucket(value: unknown): 1 | 2 | 3 | 4 | 5 | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  return rounded >= 1 && rounded <= 5 ? rounded as 1 | 2 | 3 | 4 | 5 : null;
}

function buildScoreDistributionResponse(
  rows: Array<{ score: unknown; count: unknown }>,
): ScoreDistributionResponse {
  const counts = new Map<1 | 2 | 3 | 4 | 5, number>();
  for (const score of SCORE_DISTRIBUTION_BUCKETS) {
    counts.set(score, 0);
  }

  for (const row of rows) {
    const score = toScoreBucket(row.score);
    if (score === null) continue;
    counts.set(score, (counts.get(score) ?? 0) + toCount(row.count));
  }

  const totalScoredItems = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  const buckets: ScoreDistributionBucket[] = SCORE_DISTRIBUTION_BUCKETS.map((score) => {
    const count = counts.get(score) ?? 0;
    return {
      score,
      label: String(score) as '1' | '2' | '3' | '4' | '5',
      count,
      share: totalScoredItems > 0 ? Number((count / totalScoredItems).toFixed(4)) : 0,
    };
  });

  const weightedScore = buckets.reduce((sum, bucket) => sum + (bucket.score * bucket.count), 0);
  const modalBucket = buckets.reduce<ScoreDistributionBucket | null>((best, bucket) => {
    if (bucket.count === 0) return best;
    if (!best || bucket.count > best.count) return bucket;
    if (bucket.count === best.count && bucket.score > best.score) return bucket;
    return best;
  }, null);

  return {
    hasData: totalScoredItems > 0,
    buckets,
    totals: {
      totalScoredItems,
      averageScore: totalScoredItems > 0 ? Number((weightedScore / totalScoredItems).toFixed(2)) : null,
      modalScore: modalBucket?.score ?? null,
      distinctScores: buckets.filter((bucket) => bucket.count > 0).length,
    },
  };
}

async function getDok1ScoreDistributionRows(from: Date, to: Date) {
  return db.select({
    score: facts.score,
    count: sql<number>`count(*)`,
  }).from(facts)
    .innerJoin(brainlifts, eq(facts.brainliftId, brainlifts.id))
    .where(and(
      rangeCondition(brainlifts.createdAt, from, to),
      sql`${facts.score} between 1 and 5`,
    ))
    .groupBy(facts.score);
}

async function getDok2ScoreDistributionRows(from: Date, to: Date) {
  return db.select({
    score: dok2Summaries.grade,
    count: sql<number>`count(*)`,
  }).from(dok2Summaries)
    .innerJoin(brainlifts, eq(dok2Summaries.brainliftId, brainlifts.id))
    .where(and(
      rangeCondition(brainlifts.createdAt, from, to),
      sql`${dok2Summaries.grade} between 1 and 5`,
    ))
    .groupBy(dok2Summaries.grade);
}

async function getDok3ScoreDistributionRows(from: Date, to: Date) {
  return db.select({
    score: dok3Insights.score,
    count: sql<number>`count(*)`,
  }).from(dok3Insights)
    .innerJoin(brainlifts, eq(dok3Insights.brainliftId, brainlifts.id))
    .where(and(
      rangeCondition(brainlifts.createdAt, from, to),
      eq(dok3Insights.status, 'graded'),
      sql`${dok3Insights.score} between 1 and 5`,
    ))
    .groupBy(dok3Insights.score);
}

async function getDok4ScoreDistributionRows(from: Date, to: Date) {
  return db.select({
    score: dok4Spovs.score,
    count: sql<number>`count(*)`,
  }).from(dok4Spovs)
    .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
    .where(and(
      rangeCondition(brainlifts.createdAt, from, to),
      sql`${dok4Spovs.score} between 1 and 5`,
    ))
    .groupBy(dok4Spovs.score);
}

async function getScoreDistributionRows(
  dokLevel: AnalyticsDokLevelFilter,
  from: Date,
  to: Date,
): Promise<Array<{ score: unknown; count: unknown }>> {
  if (dokLevel === 1) {
    return getDok1ScoreDistributionRows(from, to);
  }

  if (dokLevel === 2) {
    return getDok2ScoreDistributionRows(from, to);
  }

  if (dokLevel === 3) {
    return getDok3ScoreDistributionRows(from, to);
  }

  if (dokLevel === 4) {
    return getDok4ScoreDistributionRows(from, to);
  }

  const [dok1Rows, dok2Rows, dok3Rows, dok4Rows] = await Promise.all([
    getDok1ScoreDistributionRows(from, to),
    getDok2ScoreDistributionRows(from, to),
    getDok3ScoreDistributionRows(from, to),
    getDok4ScoreDistributionRows(from, to),
  ]);

  return [
    ...dok1Rows,
    ...dok2Rows,
    ...dok3Rows,
    ...dok4Rows,
  ];
}

async function getDokCliffLevelAggregate(
  dokLevel: 1 | 2 | 3 | 4,
  from: Date,
  to: Date,
): Promise<Pick<DokCliffLevelRow, 'averageScore' | 'brainliftCount'>> {
  if (dokLevel === 1) {
    const perBrainlift = db.select({
      brainliftId: facts.brainliftId,
      meanScore: sql<number>`avg(${facts.score})`.as('mean_score'),
    }).from(facts)
      .innerJoin(brainlifts, eq(facts.brainliftId, brainlifts.id))
      .where(and(
        rangeCondition(brainlifts.createdAt, from, to),
        sql`${facts.score} > 0`,
      ))
      .groupBy(facts.brainliftId)
      .as('dok1_per_brainlift');

    const [aggregate] = await db.select({
      averageScore: sql<number | null>`avg(${perBrainlift.meanScore})`,
      brainliftCount: sql<number>`count(*)`,
    }).from(perBrainlift);

    return {
      averageScore: toRoundedAverage(aggregate?.averageScore),
      brainliftCount: toCount(aggregate?.brainliftCount),
    };
  }

  if (dokLevel === 2) {
    const perBrainlift = db.select({
      brainliftId: dok2Summaries.brainliftId,
      meanScore: sql<number>`avg(${dok2Summaries.grade})`.as('mean_score'),
    }).from(dok2Summaries)
      .innerJoin(brainlifts, eq(dok2Summaries.brainliftId, brainlifts.id))
      .where(and(
        rangeCondition(brainlifts.createdAt, from, to),
        sql`${dok2Summaries.grade} is not null`,
      ))
      .groupBy(dok2Summaries.brainliftId)
      .as('dok2_per_brainlift');

    const [aggregate] = await db.select({
      averageScore: sql<number | null>`avg(${perBrainlift.meanScore})`,
      brainliftCount: sql<number>`count(*)`,
    }).from(perBrainlift);

    return {
      averageScore: toRoundedAverage(aggregate?.averageScore),
      brainliftCount: toCount(aggregate?.brainliftCount),
    };
  }

  if (dokLevel === 3) {
    const perBrainlift = db.select({
      brainliftId: dok3Insights.brainliftId,
      meanScore: sql<number>`avg(${dok3Insights.score})`.as('mean_score'),
    }).from(dok3Insights)
      .innerJoin(brainlifts, eq(dok3Insights.brainliftId, brainlifts.id))
      .where(and(
        rangeCondition(brainlifts.createdAt, from, to),
        eq(dok3Insights.status, 'graded'),
      ))
      .groupBy(dok3Insights.brainliftId)
      .as('dok3_per_brainlift');

    const [aggregate] = await db.select({
      averageScore: sql<number | null>`avg(${perBrainlift.meanScore})`,
      brainliftCount: sql<number>`count(*)`,
    }).from(perBrainlift);

    return {
      averageScore: toRoundedAverage(aggregate?.averageScore),
      brainliftCount: toCount(aggregate?.brainliftCount),
    };
  }

  const perBrainlift = db.select({
    brainliftId: dok4Spovs.brainliftId,
    meanScore: sql<number>`avg(${dok4Spovs.score})`.as('mean_score'),
  }).from(dok4Spovs)
    .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
    .where(and(
      rangeCondition(brainlifts.createdAt, from, to),
      eq(dok4Spovs.status, 'graded'),
    ))
    .groupBy(dok4Spovs.brainliftId)
    .as('dok4_per_brainlift');

  const [aggregate] = await db.select({
    averageScore: sql<number | null>`avg(${perBrainlift.meanScore})`,
    brainliftCount: sql<number>`count(*)`,
  }).from(perBrainlift);

  return {
    averageScore: toRoundedAverage(aggregate?.averageScore),
    brainliftCount: toCount(aggregate?.brainliftCount),
  };
}

function countScoreImprovementEvents(row: Pick<ScoreHistoryRow, 'eventCount' | 'triggerSet'>): number {
  const totalEvents = toCount(row.eventCount);
  if (totalEvents === 0) return 0;
  return row.triggerSet.includes('import')
    ? Math.max(0, totalEvents - 1)
    : totalEvents;
}

function buildScoreImprovementRows(rows: ScoreHistoryRow[]): ScoreImprovementRow[] {
  const byBrainlift = new Map<number, ScoreHistoryRow[]>();
  for (const row of rows) {
    const group = byBrainlift.get(row.brainliftId) ?? [];
    group.push(row);
    byBrainlift.set(row.brainliftId, group);
  }

  return Array.from(byBrainlift.values())
    .map((group) => {
      const ordered = [...group].sort((a, b) => {
        const windowDiff = a.windowStartedAt.getTime() - b.windowStartedAt.getTime();
        if (windowDiff !== 0) return windowDiff;
        return a.lastEventAt.getTime() - b.lastEventAt.getTime();
      });
      const activityRows = ordered.filter((row) => countScoreImprovementEvents(row) > 0);
      if (activityRows.length === 0) return null;

      const baselineRow = ordered[0];
      const latestActivityRow = activityRows[activityRows.length - 1];
      const firstScore = toNumber(baselineRow.startOverallScore) ?? 0;
      const latestScore = toNumber(latestActivityRow.endOverallScore) ?? firstScore;

      return {
        brainliftId: baselineRow.brainliftId,
        brainliftSlug: baselineRow.brainliftSlug,
        brainliftTitle: baselineRow.brainliftTitle,
        ownerUserId: baselineRow.ownerUserId,
        ownerName: baselineRow.ownerName,
        ownerEmail: baselineRow.ownerEmail,
        origin: baselineRow.origin,
        firstScore,
        latestScore,
        delta: Number((latestScore - firstScore).toFixed(2)),
        totalEvents: activityRows.reduce((sum, row) => sum + countScoreImprovementEvents(row), 0),
        totalWindows: activityRows.length,
        latestRecordedAt: latestActivityRow.lastEventAt.toISOString(),
      } satisfies ScoreImprovementRow;
    })
    .filter((row): row is ScoreImprovementRow => row !== null)
    .sort((a, b) => {
      const deltaDiff = b.delta - a.delta;
      if (deltaDiff !== 0) return deltaDiff;
      return new Date(b.latestRecordedAt).getTime() - new Date(a.latestRecordedAt).getTime();
    });
}

function buildBrainliftScoreHistoryResponse(rows: ScoreHistoryRow[]): BrainliftScoreHistoryResponse {
  if (rows.length === 0) {
    return {
      hasData: false,
      points: [],
    };
  }

  const ordered = [...rows].sort((a, b) => {
    const windowDiff = a.windowStartedAt.getTime() - b.windowStartedAt.getTime();
    if (windowDiff !== 0) return windowDiff;
    return a.lastEventAt.getTime() - b.lastEventAt.getTime();
  });

  const points: BrainliftScoreHistoryPoint[] = [];
  const pushPoint = (point: BrainliftScoreHistoryPoint) => {
    const previous = points[points.length - 1];
    if (previous && previous.recordedAt === point.recordedAt && previous.score === point.score) {
      return;
    }
    points.push(point);
  };

  const baselineRow = ordered[0];
  pushPoint({
    recordedAt: baselineRow.windowStartedAt.toISOString(),
    score: toNumber(baselineRow.startOverallScore) ?? 0,
    kind: 'baseline',
  });

  for (const row of ordered) {
    pushPoint({
      recordedAt: row.lastEventAt.toISOString(),
      score: toNumber(row.endOverallScore) ?? 0,
      kind: 'window_end',
    });
  }

  return {
    hasData: points.length > 0,
    points,
  };
}

export function resolveAnalyticsDateWindowForTest(filters: AnalyticsDateFilter = {}): AnalyticsDateWindow {
  return resolveWindow(filters);
}

export function bucketAnalyticsDateForTest(value: Date | string): string {
  return bucketDate(value);
}

export function coerceHumanVerificationMetricsForTest(metrics: unknown): HumanVerificationMetricSummary {
  return toHumanVerificationMetrics(metrics);
}

export function selectVanillaComparisonRowsForTest(
  primaryRows: VanillaComparisonCandidate[],
  fallbackRows: VanillaComparisonCandidate[] = [],
): VanillaComparisonCandidate[] {
  return pickRepresentativeVanillaComparisonRows(primaryRows, fallbackRows);
}

export function buildDokCliffResponseForTest(rows: DokCliffLevelRow[], totalBrainlifts: number): DokCliffResponse {
  return buildDokCliffResponse(rows, totalBrainlifts);
}

export function buildScoreDistributionResponseForTest(
  rows: Array<{ score: unknown; count: unknown }>,
): ScoreDistributionResponse {
  return buildScoreDistributionResponse(rows);
}

export async function getVolumeAnalytics(filters: VolumeFilters = {}): Promise<VolumeResponse> {
  const { from, to } = resolveWindow(filters);
  const scopeRows = await loadBrainliftScope({ userId: filters.userId, origin: filters.origin });
  const scopeIds = scopeRows.map((row) => row.id);

  const empty = {
    totals: {
      brainlifts: 0,
      facts: 0,
      dok2Summaries: 0,
      dok3Insights: 0,
      dok4Spovs: 0,
      gradingEvents: 0,
    },
    series: [] as VolumeBucketRow[],
  };

  if (scopeIds.length === 0) {
    return empty;
  }

  const series = new Map<string, VolumeBucketRow>();

  const brainliftRows = scopeRows.filter((row) => row.createdAt >= from && row.createdAt <= to);
  for (const row of brainliftRows) {
    incrementBucket(series, bucketDate(row.createdAt), 'brainlifts');
  }

  let totalFacts = 0;
  let totalDok2 = 0;
  let totalDok3 = 0;
  let totalDok4 = 0;
  let totalEvents = 0;

  if (shouldIncludeDokLevel(filters, 1)) {
    const factRows = await db.select({
      createdAt: facts.createdAt,
    }).from(facts)
      .where(and(
        inArray(facts.brainliftId, scopeIds),
        rangeCondition(facts.createdAt, from, to),
      ));

    totalFacts = factRows.length;
    for (const row of factRows) {
      incrementBucket(series, bucketDate(row.createdAt), 'facts');
    }
  }

  if (shouldIncludeDokLevel(filters, 2)) {
    const rows = await db.select({
      createdAt: dok2Summaries.createdAt,
    }).from(dok2Summaries)
      .where(and(
        inArray(dok2Summaries.brainliftId, scopeIds),
        rangeCondition(dok2Summaries.createdAt, from, to),
      ));

    totalDok2 = rows.length;
    for (const row of rows) {
      incrementBucket(series, bucketDate(row.createdAt), 'dok2Summaries');
    }
  }

  if (shouldIncludeDokLevel(filters, 3)) {
    const rows = await db.select({
      createdAt: dok3Insights.createdAt,
    }).from(dok3Insights)
      .where(and(
        inArray(dok3Insights.brainliftId, scopeIds),
        rangeCondition(dok3Insights.createdAt, from, to),
      ));

    totalDok3 = rows.length;
    for (const row of rows) {
      if (row.createdAt) {
        incrementBucket(series, bucketDate(row.createdAt), 'dok3Insights');
      }
    }
  }

  if (shouldIncludeDokLevel(filters, 4)) {
    const rows = await db.select({
      createdAt: dok4Spovs.createdAt,
    }).from(dok4Spovs)
      .where(and(
        inArray(dok4Spovs.brainliftId, scopeIds),
        rangeCondition(dok4Spovs.createdAt, from, to),
      ));

    totalDok4 = rows.length;
    for (const row of rows) {
      if (row.createdAt) {
        incrementBucket(series, bucketDate(row.createdAt), 'dok4Spovs');
      }
    }
  }

  const scoreEventRows = await db.select({
    lastEventAt: brainliftScoreLog.lastEventAt,
    eventCount: brainliftScoreLog.eventCount,
  }).from(brainliftScoreLog)
    .where(and(
      inArray(brainliftScoreLog.brainliftId, scopeIds),
      rangeCondition(brainliftScoreLog.lastEventAt, from, to),
    ));

  for (const row of scoreEventRows) {
    const amount = toCount(row.eventCount);
    totalEvents += amount;
    incrementBucket(series, bucketDate(row.lastEventAt), 'gradingEvents', amount);
  }

  return {
    totals: {
      brainlifts: brainliftRows.length,
      facts: totalFacts,
      dok2Summaries: totalDok2,
      dok3Insights: totalDok3,
      dok4Spovs: totalDok4,
      gradingEvents: totalEvents,
    },
    series: sortBuckets(series),
  };
}

export async function getHumanVerificationAnalytics(_filters: AnalyticsDateFilter = {}): Promise<HumanVerificationResponse> {
  const completedBatches = await db.select().from(qaBatches)
    .where(and(
      eq(qaBatches.type, 'verification'),
      eq(qaBatches.status, 'completed'),
    ))
    .orderBy(desc(qaBatches.completedAt), desc(qaBatches.createdAt));

  const baselineBatch = completedBatches.find((batch) => batch.isBaseline) ?? null;
  const latestBatch = completedBatches[0] ?? null;

  if (!baselineBatch && !latestBatch) {
    return { hasData: false, baseline: null, latestBatch: null, trend: [] };
  }

  const trend = completedBatches
    .slice()
    .reverse()
    .map((batch) => ({
      batchId: batch.id,
      completedAt: batch.completedAt?.toISOString() ?? batch.createdAt.toISOString(),
      scoreStabilityRate: toHumanVerificationMetrics(batch.metrics).scoreStabilityRate,
    }));

  return {
    hasData: true,
    baseline: toHumanVerificationBaseline(baselineBatch ?? undefined),
    latestBatch: latestBatch ? {
      id: latestBatch.id,
      completedAt: latestBatch.completedAt?.toISOString() ?? latestBatch.createdAt.toISOString(),
      metrics: toHumanVerificationMetrics(latestBatch.metrics),
    } : null,
    trend,
  };
}

async function loadVanillaComparisonCandidates(filters: AnalyticsDateFilter): Promise<VanillaComparisonCandidate[]> {
  const { from, to } = resolveWindow(filters);

  const rows = await db.select({
    id: dok4Spovs.id,
    brainliftId: dok4Spovs.brainliftId,
    brainliftSlug: brainlifts.slug,
    brainliftTitle: brainlifts.title,
    score: dok4Spovs.score,
    text: dok4Spovs.text,
    divergenceQuestion: dok4Spovs.divergenceQuestion,
    divergenceVanillaResponse: dok4Spovs.divergenceVanillaResponse,
    gradedAt: dok4Spovs.gradedAt,
    createdAt: dok4Spovs.createdAt,
  }).from(dok4Spovs)
    .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
    .where(and(
      sql`${dok4Spovs.gradedAt} is not null`,
      rangeCondition(dok4Spovs.gradedAt!, from, to),
      sql`${dok4Spovs.status} in ('graded', 'rejected')`,
    ))
    .orderBy(desc(dok4Spovs.gradedAt));

  return rows.map((row) => ({
    id: row.id,
    brainliftId: row.brainliftId,
    brainliftSlug: row.brainliftSlug,
    brainliftTitle: row.brainliftTitle,
    score: row.score,
    scoreTier: scoreTierFromScore(row.score),
    text: row.text,
    divergenceQuestion: row.divergenceQuestion,
    divergenceVanillaResponse: row.divergenceVanillaResponse,
    gradedAt: row.gradedAt ? row.gradedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date(0).toISOString(),
  }));
}

export async function getVanillaComparisonAnalytics(filters: AnalyticsDateFilter = {}): Promise<VanillaComparisonResponse> {
  const primaryRows = await loadVanillaComparisonCandidates(filters);
  let selected = pickRepresentativeVanillaComparisonRows(primaryRows);

  if (selected.length < 4) {
    const fallbackRows = await loadVanillaComparisonCandidates({});
    selected = pickRepresentativeVanillaComparisonRows(primaryRows, fallbackRows);
  }

  return {
    hasData: selected.length > 0,
    items: selected,
  };
}

export async function getDokCliffAnalytics(filters: AnalyticsDateFilter = {}): Promise<DokCliffResponse> {
  const { from, to } = resolveWindow(filters);
  const [brainliftCountRow] = await db.select({
    count: sql<number>`count(*)`,
  }).from(brainlifts)
    .where(rangeCondition(brainlifts.createdAt, from, to));

  const totalBrainlifts = toCount(brainliftCountRow?.count);
  const aggregateRows = await Promise.all(
    DOK_CLIFF_LEVELS.map(async ({ dokLevel, label }) => {
      const aggregate = await getDokCliffLevelAggregate(dokLevel, from, to);
      return {
        dokLevel,
        label,
        averageScore: aggregate.averageScore,
        brainliftCount: aggregate.brainliftCount,
      } satisfies DokCliffLevelRow;
    }),
  );

  return buildDokCliffResponse(aggregateRows, totalBrainlifts);
}

export async function getScoreDistributionAnalytics(filters: ScoreDistributionFilters = {}): Promise<ScoreDistributionResponse> {
  const { from, to } = resolveWindow(filters);
  const rows = await getScoreDistributionRows(filters.dokLevel ?? 'all', from, to);
  return buildScoreDistributionResponse(rows);
}

export async function getSpovDistributionAnalytics(filters: AnalyticsDateFilter = {}): Promise<SpovDistributionResponse> {
  const { from, to } = resolveWindow(filters);

  const rows = await db.select({
    status: dok4Spovs.status,
    score: dok4Spovs.score,
    createdAt: dok4Spovs.createdAt,
  }).from(dok4Spovs)
    .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
    .where(rangeCondition(dok4Spovs.createdAt!, from, to));

  if (rows.length === 0) {
    return {
      hasData: false,
      totals: {
        total: 0,
        graded: 0,
        rejected: 0,
        pending: 0,
        error: 0,
        linked: 0,
        averageScore: null,
      },
      buckets: [],
    };
  }

  const bucketCounts = new Map<string, { count: number; totalScore: number; scoreCount: number }>();
  let graded = 0;
  let rejected = 0;
  let pending = 0;
  let error = 0;
  let linked = 0;
  let scoreTotal = 0;
  let scoreCount = 0;

  const bump = (label: string, score: number | null) => {
    const current = bucketCounts.get(label) ?? { count: 0, totalScore: 0, scoreCount: 0 };
    current.count += 1;
    if (score !== null) {
      current.totalScore += score;
      current.scoreCount += 1;
    }
    bucketCounts.set(label, current);
  };

  for (const row of rows) {
    if (row.status === 'graded') {
      graded += 1;
      const tier = scoreTierFromScore(row.score);
      const label = String(tier);
      bump(label, row.score);
      if (row.score !== null) {
        scoreTotal += row.score;
        scoreCount += 1;
      }
      continue;
    }

    if (row.status === 'rejected') rejected += 1;
    else if (row.status === 'pending_linking') pending += 1;
    else if (row.status === 'linked') linked += 1;
    else if (row.status === 'error') error += 1;
    bump(row.status, null);
  }

  return {
    hasData: true,
    totals: {
      total: rows.length,
      graded,
      rejected,
      pending,
      error,
      linked,
      averageScore: scoreCount > 0 ? Number((scoreTotal / scoreCount).toFixed(2)) : null,
    },
    buckets: [
      'rejected',
      '1',
      '2',
      '3',
      '4',
    ].map((label) => {
      const bucket = bucketCounts.get(label);
      return {
        label: label === 'rejected' ? 'Rejected' : label,
        count: bucket?.count ?? 0,
        averageScore: bucket && bucket.scoreCount > 0
          ? Number((bucket.totalScore / bucket.scoreCount).toFixed(2))
          : null,
      };
    }),
  };
}

export async function getScoreImprovementAnalytics(filters: AnalyticsDateFilter = {}): Promise<ScoreImprovementResponse> {
  const rows = await loadBrainliftScoreHistory(filters);

  if (rows.length === 0) {
    return {
      hasData: false,
      rows: [],
      summary: {
        totalBrainlifts: 0,
        improving: 0,
        declining: 0,
        averageDelta: 0,
      },
    };
  }

  const resultRows = buildScoreImprovementRows(rows);
  if (resultRows.length === 0) {
    return {
      hasData: false,
      rows: [],
      summary: {
        totalBrainlifts: 0,
        improving: 0,
        declining: 0,
        averageDelta: 0,
      },
    };
  }

  const totalDelta = resultRows.reduce((sum, row) => sum + row.delta, 0);

  return {
    hasData: true,
    rows: resultRows,
    summary: {
      totalBrainlifts: resultRows.length,
      improving: resultRows.filter((row) => row.delta > 0).length,
      declining: resultRows.filter((row) => row.delta < 0).length,
      averageDelta: Number((totalDelta / resultRows.length).toFixed(2)),
    },
  };
}

export async function getBrainliftScoreHistoryAnalytics(
  filters: AnalyticsDateFilter & { brainliftId: number },
): Promise<BrainliftScoreHistoryResponse> {
  const rows = await loadBrainliftScoreHistory(filters, filters.brainliftId);
  return buildBrainliftScoreHistoryResponse(rows);
}

function groupLeaderboardRows(
  rows: Array<{
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    brainliftId: number | null;
    value: number;
  }>,
  options: {
    valueMode?: 'sum' | 'average';
    includeSecondary?: boolean;
  } = {},
): LeaderboardRow[] {
  const valueMode = options.valueMode ?? 'sum';
  const includeSecondary = options.includeSecondary ?? true;
  const grouped = new Map<string, {
    userId: string;
    userName: string;
    userEmail: string;
    valueTotal: number;
    valueCount: number;
    secondaryIds: Set<number>;
  }>();

  for (const row of rows) {
    if (!row.ownerUserId) continue;
    const key = row.ownerUserId;
    const value = toNumber(row.value);
    const existing = grouped.get(key) ?? {
      userId: row.ownerUserId,
      userName: row.ownerName ?? 'Unknown user',
      userEmail: row.ownerEmail ?? '',
      valueTotal: 0,
      valueCount: 0,
      secondaryIds: new Set<number>(),
    };

    if (value !== null) {
      existing.valueTotal += value;
      existing.valueCount += 1;
    }
    if (row.brainliftId !== null) {
      existing.secondaryIds.add(row.brainliftId);
    }
    grouped.set(key, existing);
  }

  return Array.from(grouped.values())
    .map((row) => ({
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      value: Number((
        valueMode === 'average' && row.valueCount > 0
          ? row.valueTotal / row.valueCount
          : row.valueTotal
      ).toFixed(2)),
      secondaryValue: includeSecondary ? row.secondaryIds.size : undefined,
    }))
    .sort((a, b) => b.value - a.value || a.userName.localeCompare(b.userName));
}

function buildQualityLeaderboardRows(rows: QualityLeaderboardSourceRow[]): LeaderboardRow[] {
  const latestByBrainlift = new Map<number, QualityLeaderboardSourceRow>();

  for (const row of rows) {
    const existing = latestByBrainlift.get(row.brainliftId);
    if (!existing || row.lastEventAt.getTime() > existing.lastEventAt.getTime()) {
      latestByBrainlift.set(row.brainliftId, row);
    }
  }

  return groupLeaderboardRows(
    Array.from(latestByBrainlift.values()).map((row) => ({
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerName,
      ownerEmail: row.ownerEmail,
      brainliftId: row.brainliftId,
      value: toNumber(row.endOverallScore) ?? 0,
    })),
    { valueMode: 'average', includeSecondary: true },
  );
}

export function groupLeaderboardRowsForTest(
  rows: Array<{
    ownerUserId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    brainliftId: number | null;
    value: number;
  }>,
  options: {
    valueMode?: 'sum' | 'average';
    includeSecondary?: boolean;
  } = {},
): LeaderboardRow[] {
  return groupLeaderboardRows(rows, options);
}

export function buildQualityLeaderboardRowsForTest(rows: QualityLeaderboardSourceRow[]): LeaderboardRow[] {
  return buildQualityLeaderboardRows(rows);
}

export function buildScoreImprovementRowsForTest(rows: ScoreHistoryRow[]): ScoreImprovementRow[] {
  return buildScoreImprovementRows(rows);
}

export function buildBrainliftScoreHistoryResponseForTest(rows: ScoreHistoryRow[]): BrainliftScoreHistoryResponse {
  return buildBrainliftScoreHistoryResponse(rows);
}

export async function getLeaderboardAnalytics(filters: AnalyticsDateFilter & { rankBy: LeaderboardRankBy; limit?: number }): Promise<LeaderboardResponse> {
  const { from, to } = resolveWindow(filters);
  const limit = filters.limit ?? 10;

  if (filters.rankBy === 'brainlifts') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: brainlifts.id,
      value: sql<number>`1`,
    }).from(brainlifts)
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(rangeCondition(brainlifts.createdAt, from, to));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows, { includeSecondary: false }).slice(0, limit),
    };
  }

  if (filters.rankBy === 'edits') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: dokItemVersions.brainliftId,
      value: sql<number>`1`,
    }).from(dokItemVersions)
      .innerJoin(brainlifts, eq(dokItemVersions.brainliftId, brainlifts.id))
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(rangeCondition(dokItemVersions.createdAt, from, to));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows).slice(0, limit),
    };
  }

  if (filters.rankBy === 'dok1') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: facts.brainliftId,
      value: sql<number>`1`,
    }).from(facts)
      .innerJoin(brainlifts, eq(facts.brainliftId, brainlifts.id))
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(rangeCondition(facts.createdAt, from, to));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows).slice(0, limit),
    };
  }

  if (filters.rankBy === 'dok2') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: dok2Summaries.brainliftId,
      value: sql<number>`1`,
    }).from(dok2Summaries)
      .innerJoin(brainlifts, eq(dok2Summaries.brainliftId, brainlifts.id))
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(rangeCondition(dok2Summaries.createdAt, from, to));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows).slice(0, limit),
    };
  }

  if (filters.rankBy === 'dok3') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: dok3Insights.brainliftId,
      value: sql<number>`1`,
    }).from(dok3Insights)
      .innerJoin(brainlifts, eq(dok3Insights.brainliftId, brainlifts.id))
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(and(
        rangeCondition(dok3Insights.createdAt!, from, to),
        sql`${dok3Insights.status} = 'graded'`,
      ));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows).slice(0, limit),
    };
  }

  if (filters.rankBy === 'dok4') {
    const rows = await db.select({
      ownerUserId: brainlifts.createdByUserId,
      ownerName: user.name,
      ownerEmail: user.email,
      brainliftId: dok4Spovs.brainliftId,
      value: sql<number>`1`,
    }).from(dok4Spovs)
      .innerJoin(brainlifts, eq(dok4Spovs.brainliftId, brainlifts.id))
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(and(
        rangeCondition(dok4Spovs.createdAt!, from, to),
        sql`${dok4Spovs.status} in ('graded', 'rejected')`,
      ));

    return {
      rankBy: filters.rankBy,
      rows: groupLeaderboardRows(rows).slice(0, limit),
    };
  }

  const scoreRows = await loadBrainliftScoreHistory(filters);
  if (scoreRows.length === 0) {
    return { rankBy: filters.rankBy, rows: [] };
  }

  return {
    rankBy: filters.rankBy,
    rows: buildQualityLeaderboardRows(scoreRows).slice(0, limit),
  };
}
