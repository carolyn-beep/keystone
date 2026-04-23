import { desc, eq } from '../storage/base';
import {
  db,
  brainlifts,
  brainliftScoreLog,
  brainliftScoreSummary,
} from '../storage/base';
import type {
  AnalyticsOrigin,
  ScoreEventContext,
  ScoreEventTrigger,
} from '@shared/analytics-types';

export const SCORE_WINDOW_INACTIVITY_MS = 15 * 60 * 1000;

export interface BrainliftScoreWindowState {
  brainliftId: number;
  ownerUserId: string | null;
  origin: AnalyticsOrigin | null;
  windowStartedAt: Date;
  lastEventAt: Date;
  eventCount: number;
  triggerSet: ScoreEventTrigger[];
  startOverallScore: number;
  endOverallScore: number;
  peakOverallScore: number;
  troughOverallScore: number;
  startFactCount: number;
  endFactCount: number;
  peakRecordedAt: Date;
  troughRecordedAt: Date;
}

export interface BrainliftScoreSummaryState {
  brainliftId: number;
  firstScore: number;
  firstRecordedAt: Date;
  latestScore: number;
  latestRecordedAt: Date;
  peakScore: number;
  peakRecordedAt: Date;
  totalEvents: number;
  totalWindows: number;
  updatedAt: Date;
}

function parseScoreValue(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScoreValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function toWindowState(row: any): BrainliftScoreWindowState {
  return {
    brainliftId: row.brainliftId,
    ownerUserId: row.ownerUserId,
    origin: row.origin,
    windowStartedAt: new Date(row.windowStartedAt),
    lastEventAt: new Date(row.lastEventAt),
    eventCount: row.eventCount,
    triggerSet: [...row.triggerSet],
    startOverallScore: parseScoreValue(row.startOverallScore),
    endOverallScore: parseScoreValue(row.endOverallScore),
    peakOverallScore: parseScoreValue(row.peakOverallScore),
    troughOverallScore: parseScoreValue(row.troughOverallScore),
    startFactCount: row.startFactCount,
    endFactCount: row.endFactCount,
    peakRecordedAt: new Date(row.peakRecordedAt),
    troughRecordedAt: new Date(row.troughRecordedAt),
  };
}

function toSummaryState(row: any): BrainliftScoreSummaryState {
  return {
    brainliftId: row.brainliftId,
    firstScore: parseScoreValue(row.firstScore),
    firstRecordedAt: new Date(row.firstRecordedAt),
    latestScore: parseScoreValue(row.latestScore),
    latestRecordedAt: new Date(row.latestRecordedAt),
    peakScore: parseScoreValue(row.peakScore),
    peakRecordedAt: new Date(row.peakRecordedAt),
    totalEvents: row.totalEvents,
    totalWindows: row.totalWindows,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
  };
}

function fromWindowState(window: BrainliftScoreWindowState): any {
  return {
    brainliftId: window.brainliftId,
    ownerUserId: window.ownerUserId,
    origin: window.origin,
    windowStartedAt: window.windowStartedAt,
    lastEventAt: window.lastEventAt,
    eventCount: window.eventCount,
    triggerSet: window.triggerSet,
    startOverallScore: formatScoreValue(window.startOverallScore),
    endOverallScore: formatScoreValue(window.endOverallScore),
    peakOverallScore: formatScoreValue(window.peakOverallScore),
    troughOverallScore: formatScoreValue(window.troughOverallScore),
    startFactCount: window.startFactCount,
    endFactCount: window.endFactCount,
    peakRecordedAt: window.peakRecordedAt,
    troughRecordedAt: window.troughRecordedAt,
  };
}

function fromSummaryState(summary: BrainliftScoreSummaryState): any {
  return {
    brainliftId: summary.brainliftId,
    firstScore: formatScoreValue(summary.firstScore),
    firstRecordedAt: summary.firstRecordedAt,
    latestScore: formatScoreValue(summary.latestScore),
    latestRecordedAt: summary.latestRecordedAt,
    peakScore: formatScoreValue(summary.peakScore),
    peakRecordedAt: summary.peakRecordedAt,
    totalEvents: summary.totalEvents,
    totalWindows: summary.totalWindows,
  };
}

export function mergeScoreTriggers(
  existing: ScoreEventTrigger[] | null | undefined,
  next: ScoreEventTrigger,
): ScoreEventTrigger[] {
  const result = existing ? [...existing] : [];
  if (!result.includes(next)) {
    result.push(next);
  }
  return result;
}

export function shouldStartNewScoreWindow(
  lastEventAt: Date,
  eventAt: Date,
  inactivityWindowMs = SCORE_WINDOW_INACTIVITY_MS,
): boolean {
  return eventAt.getTime() - lastEventAt.getTime() > inactivityWindowMs;
}

export function buildScoreWindowState(params: {
  existingWindow?: BrainliftScoreWindowState | null;
  brainliftId: number;
  ownerUserId: string | null;
  origin: AnalyticsOrigin | null;
  trigger: ScoreEventTrigger;
  eventAt: Date;
  score: number;
  factCount: number;
}): { window: BrainliftScoreWindowState; isNewWindow: boolean } {
  const {
    existingWindow,
    brainliftId,
    ownerUserId,
    origin,
    trigger,
    eventAt,
    score,
    factCount,
  } = params;

  const isNewWindow = !existingWindow || shouldStartNewScoreWindow(existingWindow.lastEventAt, eventAt);
  if (isNewWindow) {
    return {
      isNewWindow: true,
      window: {
        brainliftId,
        ownerUserId,
        origin,
        windowStartedAt: eventAt,
        lastEventAt: eventAt,
        eventCount: 1,
        triggerSet: [trigger],
        startOverallScore: score,
        endOverallScore: score,
        peakOverallScore: score,
        troughOverallScore: score,
        startFactCount: factCount,
        endFactCount: factCount,
        peakRecordedAt: eventAt,
        troughRecordedAt: eventAt,
      },
    };
  }

  const triggerSet = mergeScoreTriggers(existingWindow.triggerSet, trigger);
  const peakOverallScore = Math.max(existingWindow.peakOverallScore, score);
  const troughOverallScore = Math.min(existingWindow.troughOverallScore, score);

  return {
    isNewWindow: false,
    window: {
      ...existingWindow,
      lastEventAt: eventAt,
      eventCount: existingWindow.eventCount + 1,
      triggerSet,
      endOverallScore: score,
      peakOverallScore,
      troughOverallScore,
      endFactCount: factCount,
      peakRecordedAt: score > existingWindow.peakOverallScore ? eventAt : existingWindow.peakRecordedAt,
      troughRecordedAt: score < existingWindow.troughOverallScore ? eventAt : existingWindow.troughRecordedAt,
    },
  };
}

export function buildScoreSummaryState(params: {
  existingSummary?: BrainliftScoreSummaryState | null;
  window: BrainliftScoreWindowState;
  isNewWindow: boolean;
  updatedAt: Date;
}): BrainliftScoreSummaryState {
  const { existingSummary, window, isNewWindow, updatedAt } = params;

  if (!existingSummary) {
    return {
      brainliftId: window.brainliftId,
      firstScore: window.startOverallScore,
      firstRecordedAt: window.windowStartedAt,
      latestScore: window.endOverallScore,
      latestRecordedAt: window.lastEventAt,
      peakScore: window.peakOverallScore,
      peakRecordedAt: window.peakRecordedAt,
      totalEvents: window.eventCount,
      totalWindows: 1,
      updatedAt,
    };
  }

  const peakScore = Math.max(existingSummary.peakScore, window.peakOverallScore);
  const peakRecordedAt =
    window.peakOverallScore > existingSummary.peakScore
      ? window.peakRecordedAt
      : existingSummary.peakRecordedAt;

  return {
    ...existingSummary,
    latestScore: window.endOverallScore,
    latestRecordedAt: window.lastEventAt,
    peakScore,
    peakRecordedAt,
    totalEvents: existingSummary.totalEvents + 1,
    totalWindows: existingSummary.totalWindows + (isNewWindow ? 1 : 0),
    updatedAt,
  };
}

export function serializeScoreWindowForInsertForTest(window: BrainliftScoreWindowState) {
  return fromWindowState(window);
}

export async function recordBrainliftScoreEvent(context: ScoreEventContext): Promise<void> {
  const eventAt = new Date();

  await db.transaction(async (tx) => {
    const [brainlift] = await tx.select().from(brainlifts).where(eq(brainlifts.id, context.brainliftId));
    if (!brainlift) {
      return;
    }

    const currentScore = parseScoreValue(brainlift.summary?.meanScore);
    const currentFactCount = Number(brainlift.summary?.totalFacts ?? 0) || 0;

    const [existingWindowRow] = await tx.select().from(brainliftScoreLog)
      .where(eq(brainliftScoreLog.brainliftId, context.brainliftId))
      .orderBy(desc(brainliftScoreLog.lastEventAt))
      .limit(1);

    const [existingSummaryRow] = await tx.select().from(brainliftScoreSummary)
      .where(eq(brainliftScoreSummary.brainliftId, context.brainliftId));

    const existingWindow = existingWindowRow ? toWindowState(existingWindowRow) : null;
    const existingSummary = existingSummaryRow ? toSummaryState(existingSummaryRow) : null;

    const { window, isNewWindow } = buildScoreWindowState({
      existingWindow,
      brainliftId: context.brainliftId,
      ownerUserId: brainlift.createdByUserId ?? null,
      origin: (brainlift.origin as AnalyticsOrigin | null) ?? null,
      trigger: context.trigger,
      eventAt,
      score: currentScore,
      factCount: currentFactCount,
    });

    if (existingWindow && !isNewWindow) {
      await tx.update(brainliftScoreLog)
        .set({
          ownerUserId: window.ownerUserId,
          origin: window.origin,
          windowStartedAt: window.windowStartedAt,
          lastEventAt: window.lastEventAt,
          eventCount: window.eventCount,
          triggerSet: window.triggerSet,
          startOverallScore: formatScoreValue(window.startOverallScore),
          endOverallScore: formatScoreValue(window.endOverallScore),
          peakOverallScore: formatScoreValue(window.peakOverallScore),
          troughOverallScore: formatScoreValue(window.troughOverallScore),
          startFactCount: window.startFactCount,
          endFactCount: window.endFactCount,
          peakRecordedAt: window.peakRecordedAt,
          troughRecordedAt: window.troughRecordedAt,
        })
        .where(eq(brainliftScoreLog.id, existingWindowRow.id));
    } else {
      await tx.insert(brainliftScoreLog).values(fromWindowState(window));
    }

    const summary = buildScoreSummaryState({
      existingSummary,
      window,
      isNewWindow,
      updatedAt: eventAt,
    });

    if (existingSummary) {
      await tx.update(brainliftScoreSummary)
        .set({
          latestScore: formatScoreValue(summary.latestScore),
          latestRecordedAt: summary.latestRecordedAt,
          peakScore: formatScoreValue(summary.peakScore),
          peakRecordedAt: summary.peakRecordedAt,
          totalEvents: summary.totalEvents,
          totalWindows: summary.totalWindows,
          updatedAt: summary.updatedAt,
        })
        .where(eq(brainliftScoreSummary.brainliftId, context.brainliftId));
    } else {
      await tx.insert(brainliftScoreSummary).values({
        brainliftId: summary.brainliftId,
        firstScore: formatScoreValue(summary.firstScore),
        firstRecordedAt: summary.firstRecordedAt,
        latestScore: formatScoreValue(summary.latestScore),
        latestRecordedAt: summary.latestRecordedAt,
        peakScore: formatScoreValue(summary.peakScore),
        peakRecordedAt: summary.peakRecordedAt,
        totalEvents: summary.totalEvents,
        totalWindows: summary.totalWindows,
        updatedAt: summary.updatedAt,
      });
    }
  });
}
