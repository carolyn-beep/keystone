import {
  and,
  asc,
  db,
  desc,
  eq,
  graderMonitoringBrainlifts,
  graderMonitoringPassResults,
  graderMonitoringRuns,
  graderMonitoringSets,
  sql,
} from './base';
import type {
  AnalyticsDateFilter,
  FreezeGraderMonitoringSetResponse,
  FreezeGraderMonitoringSetInput,
  FrozenBrainliftSnapshot,
  GraderConsistencyResponse,
  GraderMonitoringSetRow,
  ModelDriftResponse,
  WeeklyConsistencyMetrics,
  WeeklyConsistencyResultRow,
  WeeklyConsistencyRunRow,
  WeeklyConsistencyTriggerKind,
  WeeklyModelDriftMetrics,
} from '@shared/analytics-types';

const DEFAULT_ANALYTICS_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type AnalyticsDateWindow = {
  from: Date;
  to: Date;
};

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

function rangeCondition(column: unknown, from: Date, to: Date) {
  return sql`${column} between ${from} and ${to}`;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapSetRow(row: typeof graderMonitoringSets.$inferSelect): GraderMonitoringSetRow {
  return {
    id: row.id,
    monitoredSlugs: row.monitoredSlugs ?? [],
    scheduleTimezone: row.scheduleTimezone,
    driftRepresentative: row.driftRepresentative,
    snapshotVersion: row.snapshotVersion,
    active: row.active,
    frozenAt: toIsoString(row.frozenAt),
    createdByUserId: row.createdByUserId,
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

function mapRunRow(row: typeof graderMonitoringRuns.$inferSelect): WeeklyConsistencyRunRow {
  return {
    id: row.id,
    monitoringSetId: row.monitoringSetId,
    snapshotVersion: row.snapshotVersion,
    weekStart: toIsoString(row.weekStart) ?? new Date(0).toISOString(),
    timezone: row.timezone,
    triggerKind: row.triggerKind,
    status: row.status,
    representativePass: 1,
    metrics: row.metrics as WeeklyConsistencyMetrics | null,
    driftMetrics: row.driftMetrics as WeeklyModelDriftMetrics | null,
    error: row.error,
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoString(row.completedAt),
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
  };
}

export async function getActiveGraderMonitoringSet(): Promise<GraderMonitoringSetRow | null> {
  const [row] = await db.select().from(graderMonitoringSets)
    .where(eq(graderMonitoringSets.active, true))
    .orderBy(desc(graderMonitoringSets.updatedAt), desc(graderMonitoringSets.id))
    .limit(1);

  return row ? mapSetRow(row) : null;
}

export async function replaceActiveGraderMonitoringSet(
  input: FreezeGraderMonitoringSetInput & {
    frozenSnapshots: FrozenBrainliftSnapshot[];
  },
): Promise<FreezeGraderMonitoringSetResponse> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(graderMonitoringSets)
      .where(eq(graderMonitoringSets.active, true))
      .orderBy(desc(graderMonitoringSets.updatedAt), desc(graderMonitoringSets.id))
      .limit(1);

    const nextSnapshotVersion = (existing?.snapshotVersion ?? 0) + 1;
    const frozenAt = new Date();

    let setRow: typeof graderMonitoringSets.$inferSelect;

    if (existing) {
      const [updated] = await tx.update(graderMonitoringSets)
        .set({
          monitoredSlugs: input.slugs,
          scheduleTimezone: 'America/Sao_Paulo',
          driftRepresentative: 'pass1',
          snapshotVersion: nextSnapshotVersion,
          frozenAt,
          createdByUserId: input.createdByUserId ?? existing.createdByUserId ?? null,
          active: true,
        })
        .where(eq(graderMonitoringSets.id, existing.id))
        .returning();
      setRow = updated;

      await tx.delete(graderMonitoringBrainlifts)
        .where(eq(graderMonitoringBrainlifts.monitoringSetId, existing.id));
    } else {
      const [inserted] = await tx.insert(graderMonitoringSets).values({
        monitoredSlugs: input.slugs,
        scheduleTimezone: 'America/Sao_Paulo',
        driftRepresentative: 'pass1',
        snapshotVersion: nextSnapshotVersion,
        frozenAt,
        createdByUserId: input.createdByUserId ?? null,
        active: true,
      }).returning();
      setRow = inserted;
    }

    if (input.frozenSnapshots.length > 0) {
      await tx.insert(graderMonitoringBrainlifts).values(
        input.frozenSnapshots.map((snapshot) => ({
          monitoringSetId: setRow.id,
          snapshotVersion: nextSnapshotVersion,
          sourceBrainliftId: snapshot.sourceBrainliftId,
          sourceSlug: snapshot.sourceSlug,
          title: snapshot.title,
          purpose: snapshot.purpose,
          overallScore: snapshot.frozenOverallScore.toFixed(2),
          snapshot: {
            ...snapshot,
            monitoringSetId: setRow.id,
            snapshotVersion: nextSnapshotVersion,
            frozenAt: frozenAt.toISOString(),
          },
        })),
      );
    }

    return {
      set: mapSetRow(setRow),
      frozenBrainlifts: input.frozenSnapshots.length,
    };
  });
}

export async function getFrozenSnapshotsForMonitoringSet(
  monitoringSetId: number,
  snapshotVersion: number,
): Promise<FrozenBrainliftSnapshot[]> {
  const rows = await db.select().from(graderMonitoringBrainlifts)
    .where(and(
      eq(graderMonitoringBrainlifts.monitoringSetId, monitoringSetId),
      eq(graderMonitoringBrainlifts.snapshotVersion, snapshotVersion),
    ))
    .orderBy(asc(graderMonitoringBrainlifts.sourceSlug));

  return rows.map((row) => row.snapshot as FrozenBrainliftSnapshot);
}

export async function createOrReuseWeeklyConsistencyRun(input: {
  monitoringSetId: number;
  snapshotVersion: number;
  weekStart: Date;
  triggerKind: WeeklyConsistencyTriggerKind;
}): Promise<WeeklyConsistencyRunRow> {
  const [existing] = await db.select().from(graderMonitoringRuns)
    .where(and(
      eq(graderMonitoringRuns.monitoringSetId, input.monitoringSetId),
      eq(graderMonitoringRuns.snapshotVersion, input.snapshotVersion),
      eq(graderMonitoringRuns.weekStart, input.weekStart),
    ))
    .limit(1);

  if (existing) {
    const [updated] = await db.update(graderMonitoringRuns)
      .set({
        triggerKind: input.triggerKind,
        status: 'pending',
        error: null,
        metrics: null,
        driftMetrics: null,
        startedAt: null,
        completedAt: null,
      })
      .where(eq(graderMonitoringRuns.id, existing.id))
      .returning();

    await db.delete(graderMonitoringPassResults).where(eq(graderMonitoringPassResults.runId, existing.id));
    return mapRunRow(updated);
  }

  const [inserted] = await db.insert(graderMonitoringRuns).values({
    monitoringSetId: input.monitoringSetId,
    snapshotVersion: input.snapshotVersion,
    weekStart: input.weekStart,
    timezone: 'America/Sao_Paulo',
    triggerKind: input.triggerKind,
    status: 'pending',
    representativePass: 1,
  }).returning();

  return mapRunRow(inserted);
}

export async function setWeeklyConsistencyRunRunning(runId: number): Promise<WeeklyConsistencyRunRow> {
  const [updated] = await db.update(graderMonitoringRuns)
    .set({
      status: 'running',
      startedAt: new Date(),
      error: null,
    })
    .where(eq(graderMonitoringRuns.id, runId))
    .returning();

  return mapRunRow(updated);
}

export async function replaceWeeklyConsistencyPassResults(
  runId: number,
  passNumber: 1 | 2,
  rows: WeeklyConsistencyResultRow[],
): Promise<void> {
  await db.delete(graderMonitoringPassResults)
    .where(and(
      eq(graderMonitoringPassResults.runId, runId),
      eq(graderMonitoringPassResults.passNumber, passNumber),
    ));

  if (rows.length === 0) {
    return;
  }

  await db.insert(graderMonitoringPassResults).values(
    rows.map((row) => ({
      runId,
      passNumber,
      brainliftStableKey: row.brainliftStableKey,
      level: row.level,
      stableKey: row.stableKey,
      score: row.score === null ? null : String(row.score),
      metadata: row.metadata ?? null,
    })),
  );
}

export async function getWeeklyConsistencyPassResults(
  runId: number,
  passNumber: 1 | 2,
): Promise<WeeklyConsistencyResultRow[]> {
  const rows = await db.select().from(graderMonitoringPassResults)
    .where(and(
      eq(graderMonitoringPassResults.runId, runId),
      eq(graderMonitoringPassResults.passNumber, passNumber),
    ))
    .orderBy(
      asc(graderMonitoringPassResults.brainliftStableKey),
      asc(graderMonitoringPassResults.level),
      asc(graderMonitoringPassResults.stableKey),
    );

  return rows.map((row) => ({
    runId: row.runId,
    passNumber: row.passNumber as 1 | 2,
    brainliftStableKey: row.brainliftStableKey,
    level: row.level,
    stableKey: row.stableKey,
    score: row.score === null ? null : Number(row.score),
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}

export async function getPreviousCompletedWeeklyConsistencyRun(input: {
  monitoringSetId: number;
  snapshotVersion: number;
  beforeWeekStart: Date;
}): Promise<WeeklyConsistencyRunRow | null> {
  const [row] = await db.select().from(graderMonitoringRuns)
    .where(and(
      eq(graderMonitoringRuns.monitoringSetId, input.monitoringSetId),
      eq(graderMonitoringRuns.snapshotVersion, input.snapshotVersion),
      eq(graderMonitoringRuns.status, 'completed'),
      sql`${graderMonitoringRuns.weekStart} < ${input.beforeWeekStart}`,
    ))
    .orderBy(desc(graderMonitoringRuns.weekStart))
    .limit(1);

  return row ? mapRunRow(row) : null;
}

export async function completeWeeklyConsistencyRun(
  runId: number,
  metrics: WeeklyConsistencyMetrics,
  driftMetrics: WeeklyModelDriftMetrics,
): Promise<WeeklyConsistencyRunRow> {
  const [updated] = await db.update(graderMonitoringRuns)
    .set({
      status: 'completed',
      metrics,
      driftMetrics,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(graderMonitoringRuns.id, runId))
    .returning();

  return mapRunRow(updated);
}

export async function failWeeklyConsistencyRun(runId: number, error: string): Promise<WeeklyConsistencyRunRow> {
  const [updated] = await db.update(graderMonitoringRuns)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(eq(graderMonitoringRuns.id, runId))
    .returning();

  return mapRunRow(updated);
}

export async function getGraderConsistencyAnalytics(): Promise<GraderConsistencyResponse> {
  const rows = await db.select().from(graderMonitoringRuns)
    .where(eq(graderMonitoringRuns.status, 'completed'))
    .orderBy(desc(graderMonitoringRuns.weekStart), desc(graderMonitoringRuns.id));

  const mapped = rows.map(mapRunRow);
  const latest = mapped[0];

  return {
    hasData: mapped.length > 0 && !!latest?.metrics,
    latestRun: latest?.metrics ? {
      weekStart: latest.weekStart,
      completedAt: latest.completedAt ?? latest.weekStart,
      overallPearsonR: latest.metrics.overallPearsonR,
      brainliftPearsonR: latest.metrics.brainliftPearsonR,
      byDokLevel: latest.metrics.byDokLevel,
      comparableCoverage: latest.metrics.comparableCoverage,
      monitoredBrainlifts: latest.metrics.monitoredBrainlifts,
    } : null,
    trend: mapped
      .filter((row) => row.metrics)
      .reverse()
      .map((row) => ({
        weekStart: row.weekStart,
        completedAt: row.completedAt ?? row.weekStart,
        overallPearsonR: row.metrics?.overallPearsonR ?? null,
        brainliftPearsonR: row.metrics?.brainliftPearsonR ?? null,
      })),
  };
}

export async function getModelDriftAnalytics(): Promise<ModelDriftResponse> {
  const rows = await db.select().from(graderMonitoringRuns)
    .where(eq(graderMonitoringRuns.status, 'completed'))
    .orderBy(desc(graderMonitoringRuns.weekStart), desc(graderMonitoringRuns.id));

  const mapped = rows.map(mapRunRow);
  const latest = mapped[0];
  const latestDrift = latest?.driftMetrics;
  const rowsByWeekStart = new Map(mapped.map((row) => [row.weekStart, row]));
  const normalizedComparedToWeekStart = latestDrift?.comparedToWeekStart
    ? toIsoString(latestDrift.comparedToWeekStart) ?? latestDrift.comparedToWeekStart
    : null;
  const comparedToRun = normalizedComparedToWeekStart
    ? rowsByWeekStart.get(normalizedComparedToWeekStart) ?? null
    : null;

  return {
    hasData: mapped.length > 0 && !!latestDrift,
    latestRun: latest && latestDrift ? {
      weekStart: latest.weekStart,
      completedAt: latest.completedAt ?? latest.weekStart,
      comparedToWeekStart: normalizedComparedToWeekStart,
      comparedToCompletedAt: comparedToRun?.completedAt ?? comparedToRun?.weekStart ?? null,
      representativePass: 1,
      overallBrainliftDelta: latestDrift.overallBrainliftDelta,
      byDokLevel: latestDrift.byDokLevel,
    } : null,
    trend: mapped
      .filter((row) => row.driftMetrics)
      .reverse()
      .map((row) => ({
        weekStart: row.weekStart,
        completedAt: row.completedAt ?? row.weekStart,
        overallBrainliftDelta: row.driftMetrics?.overallBrainliftDelta ?? null,
        dok1Delta: row.driftMetrics?.byDokLevel.dok1 ?? null,
        dok2Delta: row.driftMetrics?.byDokLevel.dok2 ?? null,
        dok3Delta: row.driftMetrics?.byDokLevel.dok3 ?? null,
        dok4Delta: row.driftMetrics?.byDokLevel.dok4 ?? null,
      })),
  };
}
