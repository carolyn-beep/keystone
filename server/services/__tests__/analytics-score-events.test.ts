import { describe, expect, it } from 'vitest';
import {
  buildScoreSummaryState,
  buildScoreWindowState,
  mergeScoreTriggers,
  serializeScoreWindowForInsertForTest,
  shouldStartNewScoreWindow,
} from '../analytics-score-events';

describe('analytics score-event helpers', () => {
  it('keeps triggers unique while preserving order', () => {
    expect(mergeScoreTriggers(['import', 'grade'], 'grade')).toEqual(['import', 'grade']);
    expect(mergeScoreTriggers(['import'], 'delete')).toEqual(['import', 'delete']);
  });

  it('starts a new score window only after the inactivity threshold is exceeded', () => {
    const start = new Date('2026-04-08T10:00:00.000Z');
    expect(shouldStartNewScoreWindow(start, new Date('2026-04-08T10:14:59.000Z'))).toBe(false);
    expect(shouldStartNewScoreWindow(start, new Date('2026-04-08T10:15:01.000Z'))).toBe(true);
  });

  it('creates a fresh window when no previous window exists', () => {
    const { window, isNewWindow } = buildScoreWindowState({
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'import',
      eventAt: new Date('2026-04-08T10:00:00.000Z'),
      score: 3.25,
      factCount: 12,
    });

    expect(isNewWindow).toBe(true);
    expect(window.eventCount).toBe(1);
    expect(window.triggerSet).toEqual(['import']);
    expect(window.startOverallScore).toBe(3.25);
    expect(window.endOverallScore).toBe(3.25);
    expect(window.peakOverallScore).toBe(3.25);
    expect(window.troughOverallScore).toBe(3.25);
    expect(window.startFactCount).toBe(12);
    expect(window.endFactCount).toBe(12);
  });

  it('folds recomputes into the active window within 15 minutes', () => {
    const existingWindow = buildScoreWindowState({
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'import',
      eventAt: new Date('2026-04-08T10:00:00.000Z'),
      score: 3.0,
      factCount: 10,
    }).window;

    const { window, isNewWindow } = buildScoreWindowState({
      existingWindow,
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'delete',
      eventAt: new Date('2026-04-08T10:10:00.000Z'),
      score: 4.5,
      factCount: 11,
    });

    expect(isNewWindow).toBe(false);
    expect(window.eventCount).toBe(2);
    expect(window.triggerSet).toEqual(['import', 'delete']);
    expect(window.startOverallScore).toBe(3.0);
    expect(window.endOverallScore).toBe(4.5);
    expect(window.peakOverallScore).toBe(4.5);
    expect(window.troughOverallScore).toBe(3.0);
    expect(window.endFactCount).toBe(11);
  });

  it('starts a new window after the inactivity threshold and preserves summary history', () => {
    const firstWindow = buildScoreWindowState({
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'import',
      eventAt: new Date('2026-04-08T10:00:00.000Z'),
      score: 2.0,
      factCount: 10,
    }).window;

    const secondWindowResult = buildScoreWindowState({
      existingWindow: firstWindow,
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'grade',
      eventAt: new Date('2026-04-08T10:20:01.000Z'),
      score: 4.0,
      factCount: 10,
    });

    expect(secondWindowResult.isNewWindow).toBe(true);

    const summary = buildScoreSummaryState({
      existingSummary: null,
      window: firstWindow,
      isNewWindow: true,
      updatedAt: new Date('2026-04-08T10:00:01.000Z'),
    });

    const updatedSummary = buildScoreSummaryState({
      existingSummary: summary,
      window: secondWindowResult.window,
      isNewWindow: true,
      updatedAt: new Date('2026-04-08T10:20:02.000Z'),
    });

    expect(updatedSummary.firstScore).toBe(2.0);
    expect(updatedSummary.latestScore).toBe(4.0);
    expect(updatedSummary.peakScore).toBe(4.0);
    expect(updatedSummary.totalEvents).toBe(2);
    expect(updatedSummary.totalWindows).toBe(2);
  });

  it('preserves peak and trough timestamps on fresh windows', () => {
    const eventAt = new Date('2026-04-08T10:20:01.000Z');
    const { window } = buildScoreWindowState({
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'grade',
      eventAt,
      score: 4.0,
      factCount: 10,
    });

    expect(window.peakRecordedAt).toEqual(eventAt);
    expect(window.troughRecordedAt).toEqual(eventAt);
  });

  it('keeps timestamp fields as Date objects for inserts', () => {
    const eventAt = new Date('2026-04-08T10:20:01.000Z');
    const { window } = buildScoreWindowState({
      brainliftId: 7,
      ownerUserId: 'user-1',
      origin: 'ui',
      trigger: 'grade',
      eventAt,
      score: 4.0,
      factCount: 10,
    });

    const serialized = serializeScoreWindowForInsertForTest(window);

    expect(serialized.windowStartedAt).toBeInstanceOf(Date);
    expect(serialized.lastEventAt).toBeInstanceOf(Date);
    expect(serialized.peakRecordedAt).toBeInstanceOf(Date);
    expect(serialized.troughRecordedAt).toBeInstanceOf(Date);
  });
});
