import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RewriteResult } from '../rewrite';

// Mock the rewrite engine and the storage facade BEFORE importing the SUT.
vi.mock('../rewrite', () => ({
  rewriteField: vi.fn(),
}));
vi.mock('../../../storage', () => ({
  storage: {
    recordRewriteMetric: vi.fn().mockResolvedValue(undefined),
  },
}));

import { rewriteForPersist } from '../integrate';
import { rewriteField } from '../rewrite';
import { storage } from '../../../storage';

const mockRewriteField = vi.mocked(rewriteField);
const mockRecord = vi.mocked(storage.recordRewriteMetric);

const ctx = { level: 'DOK3' as const, itemId: 42, brainliftId: 7 };

function okResult(text: string): RewriteResult {
  return {
    text,
    rewritten: true,
    reason: 'ok',
    metrics: {
      fkBefore: 14.2,
      fkAfter: 8.1,
      wordsBefore: 200,
      wordsAfter: 90,
      candidateFk: 8.1,
      candidateWords: 90,
      rounds: 1,
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
    },
  };
}

function fallbackResult(original: string, reason: RewriteResult['reason']): RewriteResult {
  return {
    text: original,
    rewritten: false,
    reason,
    metrics: {
      fkBefore: 14.2,
      fkAfter: 14.2,
      wordsBefore: 200,
      wordsAfter: 200,
      // The rejected candidate did achieve a lower FK/length, captured separately.
      candidateFk: 9.4,
      candidateWords: 120,
      rounds: 1,
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
    },
  };
}

describe('rewriteForPersist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecord.mockResolvedValue(undefined);
  });

  it('happy path: returns rewritten userFacing + original raw, records ok metric', async () => {
    const original = 'A very long and verbose grader rationale.';
    const rewritten = 'Short rationale.';
    mockRewriteField.mockResolvedValue(okResult(rewritten));

    const out = await rewriteForPersist(original, ctx);

    expect(out).toEqual({ userFacing: rewritten, raw: original });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    const metric = mockRecord.mock.calls[0][0];
    expect(metric).toMatchObject({
      dokLevel: 3,
      itemId: 42,
      brainliftId: 7,
      rewritten: true,
      reason: 'ok',
      fkBefore: 14.2,
      fkAfter: 8.1,
      wordsBefore: 200,
      wordsAfter: 90,
      rounds: 1,
    });
  });

  it('fallback: both fields equal original, records rewritten=false with reason + candidate metrics, warns, no throw', async () => {
    const original = 'Grader rationale that the engine could not improve.';
    mockRewriteField.mockResolvedValue(fallbackResult(original, 'sanity_failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await rewriteForPersist(original, ctx);

    expect(out).toEqual({ userFacing: original, raw: original });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({
      rewritten: false,
      reason: 'sanity_failed',
      candidateFk: 9.4,
      candidateWords: 120,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('accepted_below_target is a success: keeps the rewrite, no fallback warning', async () => {
    const original = 'A long grader rationale that did not fully meet the gate.';
    const kept = 'Shorter but still a touch over target.';
    mockRewriteField.mockResolvedValue({
      text: kept,
      rewritten: true,
      reason: 'accepted_below_target',
      metrics: {
        fkBefore: 14.2, fkAfter: 11.0, wordsBefore: 200, wordsAfter: 150,
        candidateFk: 11.0, candidateWords: 150, rounds: 1,
        model: 'qwen/qwen3-30b-a3b-instruct-2507',
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await rewriteForPersist(original, ctx);

    expect(out).toEqual({ userFacing: kept, raw: original });
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ rewritten: true, reason: 'accepted_below_target' });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('engine rejection is caught: returns original in both fields, records model_failed, no throw', async () => {
    const original = 'Grader rationale.';
    mockRewriteField.mockRejectedValue(new Error('unexpected engine crash'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await rewriteForPersist(original, ctx);

    expect(out).toEqual({ userFacing: original, raw: original });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord.mock.calls[0][0]).toMatchObject({ rewritten: false, reason: 'model_failed' });
    warn.mockRestore();
  });

  it('metric write failure is swallowed: still returns the rewrite, never throws', async () => {
    const original = 'Long rationale.';
    const rewritten = 'Short.';
    mockRewriteField.mockResolvedValue(okResult(rewritten));
    mockRecord.mockRejectedValue(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await rewriteForPersist(original, ctx);

    expect(out).toEqual({ userFacing: rewritten, raw: original });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('maps each DokLevel to its numeric dok_level', async () => {
    mockRewriteField.mockResolvedValue(okResult('x'));
    for (const [level, num] of [['DOK1', 1], ['DOK2', 2], ['DOK3', 3], ['DOK4', 4]] as const) {
      mockRecord.mockClear();
      await rewriteForPersist('text', { level, itemId: 1, brainliftId: 1 });
      expect(mockRecord.mock.calls[0][0].dokLevel).toBe(num);
    }
  });
});
