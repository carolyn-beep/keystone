import { describe, expect, it } from 'vitest';
import {
  brainlifts,
  facts,
  brainliftScoreLog,
  brainliftScoreSummary,
  qaBatches,
  verificationTruthSet,
} from '../schema';
import {
  ANALYTICS_ORIGINS,
  QABATCH_STATUSES,
  QABATCH_TYPES,
  SCORE_EVENT_TRIGGERS,
} from '../analytics-types';

describe('analytics foundation schema', () => {
  it('exposes the analytics origin taxonomy', () => {
    expect(ANALYTICS_ORIGINS).toEqual(['ui', 'mcp', 'builder', 'seed']);
    expect(Object.keys(ANALYTICS_ORIGINS)).toHaveLength(4);
  });

  it('exposes the fixed score-event trigger set', () => {
    expect(SCORE_EVENT_TRIGGERS).toEqual(['import', 'pipeline', 'grade', 'regrade', 'delete']);
  });

  it('exposes the QA batch lifecycle enums', () => {
    expect(QABATCH_TYPES).toEqual(['verification']);
    expect(QABATCH_STATUSES).toEqual(['pending', 'running', 'completed', 'failed']);
  });

  it('adds the analytics columns and tables needed by the foundation', () => {
    expect(Object.keys(brainlifts)).toContain('origin');
    expect(Object.keys(facts)).toContain('createdAt');
    expect(Object.keys(brainliftScoreLog)).toEqual(expect.arrayContaining([
      'brainliftId',
      'ownerUserId',
      'origin',
      'windowStartedAt',
      'lastEventAt',
      'eventCount',
      'triggerSet',
      'startOverallScore',
      'endOverallScore',
      'peakOverallScore',
      'troughOverallScore',
      'startFactCount',
      'endFactCount',
    ]));
    expect(Object.keys(brainliftScoreSummary)).toEqual(expect.arrayContaining([
      'brainliftId',
      'firstScore',
      'firstRecordedAt',
      'latestScore',
      'latestRecordedAt',
      'peakScore',
      'peakRecordedAt',
      'totalEvents',
      'totalWindows',
    ]));
    expect(Object.keys(qaBatches)).toEqual(expect.arrayContaining([
      'id',
      'type',
      'status',
      'isBaseline',
      'baselineBatchId',
      'sampleCount',
      'metrics',
      'artifactLabel',
      'error',
      'startedAt',
      'completedAt',
    ]));
    expect(Object.keys(verificationTruthSet)).toEqual(expect.arrayContaining([
      'batchId',
      'assetKey',
      'dokLevel',
      'stableKey',
      'frozenContext',
      'humanScore',
      'aiScore',
      'metadata',
    ]));
  });
});
