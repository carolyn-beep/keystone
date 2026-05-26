/**
 * Tests for FR4: pangramAnalyzeJob (polymorphic AI Writing Signal analyzer).
 *
 * Uses unit-level mocking of analyzeText + storage + assembleTextForEntity to
 * exercise hash-and-skip, retry exhaustion, and storage-error re-throw branches
 * without hitting the real Pangram API or the DB.
 *
 * Integration coverage of the storage layer lives in
 * server/storage/__tests__/pangramAssessments.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { JobHelpers } from 'graphile-worker';
import { createHash } from 'crypto';

vi.mock('../../ai/pangram/client', () => ({
  analyzeText: vi.fn(),
}));

vi.mock('../../ai/pangram/assembleText', () => ({
  assembleTextForEntity: vi.fn(),
}));

vi.mock('../../storage/pangramAssessments', () => ({
  pangramAssessmentsStorage: {
    getByEntity: vi.fn(),
    upsertAnalyzing: vi.fn(),
    markDone: vi.fn(),
    markError: vi.fn(),
    getLabelsByEntities: vi.fn(),
    predictionShortToLabel: vi.fn(),
  },
}));

import { pangramAnalyzeJob } from '../pangramAnalyzeJob';
import { analyzeText } from '../../ai/pangram/client';
import { assembleTextForEntity } from '../../ai/pangram/assembleText';
import { pangramAssessmentsStorage } from '../../storage/pangramAssessments';
import {
  PangramHttpError,
  PangramTimeoutError,
  type PangramResponse,
} from '../../ai/pangram/types';

const FIXTURE_RESPONSE: PangramResponse = {
  text: 'fixture text',
  version: '3.0',
  prediction_short: 'AI-Assisted',
  fraction_ai: 0.1,
  fraction_ai_assisted: 0.7,
  fraction_human: 0.2,
  num_ai_segments: 1,
  num_ai_assisted_segments: 1,
  num_human_segments: 1,
  headline: 'Likely AI-Assisted',
  prediction: 'Mostly AI assisted',
  windows: [],
};

const mockHelpers = {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  job: { attempts: 1, max_attempts: 3 },
} as unknown as JobHelpers;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: getByEntity returns null. Tests override as needed.
  (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
  (pangramAssessmentsStorage.markDone as any).mockResolvedValue(true);
  (pangramAssessmentsStorage.markError as any).mockResolvedValue(true);
});

describe('pangramAnalyzeJob -- happy path', () => {
  it('first run on DOK3 insight: inserts analyzing, calls Pangram, marks done', async () => {
    const text = 'A non-empty insight about systems thinking.';
    (assembleTextForEntity as any).mockResolvedValue(text);
    (analyzeText as any).mockResolvedValue(FIXTURE_RESPONSE);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 42, brainliftId: 7 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'done' });
    expect(pangramAssessmentsStorage.upsertAnalyzing).toHaveBeenCalledWith(
      'dok3_insight',
      42,
      7,
      sha256(text),
    );
    expect(analyzeText).toHaveBeenCalledOnce();
    expect(analyzeText).toHaveBeenCalledWith({ text });
    expect(pangramAssessmentsStorage.markDone).toHaveBeenCalledWith(
      'dok3_insight',
      42,
      FIXTURE_RESPONSE,
      sha256(text),
    );
    expect(pangramAssessmentsStorage.markError).not.toHaveBeenCalled();
  });
});

describe('pangramAnalyzeJob -- hash-and-skip', () => {
  it('skips entirely when text unchanged AND prior status=done', async () => {
    const text = 'Stable text';
    (assembleTextForEntity as any).mockResolvedValue(text);
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue({
      textHash: sha256(text),
      status: 'done',
    });

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 1, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(analyzeText).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.upsertAnalyzing).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.markDone).not.toHaveBeenCalled();
  });

  it('does NOT skip when hash matches but prior status is error (allow retry)', async () => {
    const text = 'Same text that failed last time';
    (assembleTextForEntity as any).mockResolvedValue(text);
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue({
      textHash: sha256(text),
      status: 'error',
    });
    (analyzeText as any).mockResolvedValue(FIXTURE_RESPONSE);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 2, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'done' });
    expect(analyzeText).toHaveBeenCalled();
  });

  it('text change: flips analyzing → done with new hash + new fields', async () => {
    const oldHash = sha256('old text');
    const newText = 'edited text';
    (assembleTextForEntity as any).mockResolvedValue(newText);
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue({
      textHash: oldHash,
      status: 'done',
    });
    (analyzeText as any).mockResolvedValue(FIXTURE_RESPONSE);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 3, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'done' });
    expect(pangramAssessmentsStorage.upsertAnalyzing).toHaveBeenCalledWith(
      'dok3_insight',
      3,
      1,
      sha256(newText),
    );
    expect(pangramAssessmentsStorage.markDone).toHaveBeenCalledWith(
      'dok3_insight',
      3,
      FIXTURE_RESPONSE,
      sha256(newText),
    );
  });

  it('returns skipped when a stale job finishes after a newer text hash superseded it', async () => {
    const oldText = 'old text still in flight';
    (assembleTextForEntity as any).mockResolvedValue(oldText);
    (analyzeText as any).mockResolvedValue(FIXTURE_RESPONSE);
    (pangramAssessmentsStorage.markDone as any).mockResolvedValueOnce(false);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 4, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(pangramAssessmentsStorage.markDone).toHaveBeenCalledWith(
      'dok3_insight',
      4,
      FIXTURE_RESPONSE,
      sha256(oldText),
    );
    expect(pangramAssessmentsStorage.markError).not.toHaveBeenCalled();
  });
});

describe('pangramAnalyzeJob -- empty text', () => {
  it('returns skipped without inserting a row when assembled text is empty', async () => {
    (assembleTextForEntity as any).mockResolvedValue('');

    const result = await pangramAnalyzeJob(
      { entityType: 'dok2_summary', entityId: 99, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(pangramAssessmentsStorage.getByEntity).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.upsertAnalyzing).not.toHaveBeenCalled();
    expect(analyzeText).not.toHaveBeenCalled();
  });
});

describe('pangramAnalyzeJob -- retry exhaustion', () => {
  it('3 consecutive 5xx → marks error, populates message, returns error, does NOT throw', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    const httpErr = new PangramHttpError('5xx', 503, 'service unavailable');
    (analyzeText as any).mockRejectedValue(httpErr);
    // Make sleeps near-instant for the test.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => {
      fn();
      return 0 as any;
    }) as any);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 10, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'error' });
    expect(analyzeText).toHaveBeenCalledTimes(3);
    expect(pangramAssessmentsStorage.markError).toHaveBeenCalledWith(
      'dok3_insight',
      10,
      expect.stringContaining('PangramHttpError'),
      sha256('some text'),
    );
    expect(pangramAssessmentsStorage.markDone).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('3 consecutive timeouts → marks error with timeout-flavored message', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    (analyzeText as any).mockRejectedValue(new PangramTimeoutError(30_000));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => {
      fn();
      return 0 as any;
    }) as any);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 11, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'error' });
    expect(pangramAssessmentsStorage.markError).toHaveBeenCalledWith(
      'dok3_insight',
      11,
      expect.stringContaining('PangramTimeoutError'),
      sha256('some text'),
    );

    vi.restoreAllMocks();
  });
});

describe('pangramAnalyzeJob -- cascade cost discipline (FR5 hook target)', () => {
  it('5 invocations on unchanged text result in zero analyzeText calls', async () => {
    const text = 'identical text across the cascade';
    (assembleTextForEntity as any).mockResolvedValue(text);
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue({
      textHash: sha256(text),
      status: 'done',
    });

    for (let i = 0; i < 5; i++) {
      const r = await pangramAnalyzeJob(
        { entityType: 'dok3_insight', entityId: 200 + i, brainliftId: 1 },
        mockHelpers,
      );
      expect(r).toEqual({ status: 'skipped' });
    }
    expect(analyzeText).not.toHaveBeenCalled();
  });
});

describe('pangramAnalyzeJob -- storage write failure', () => {
  it('skips without retrying when upsertAnalyzing hits brainlift FK violation', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    (pangramAssessmentsStorage.upsertAnalyzing as any).mockRejectedValueOnce({
      cause: { code: '23503' },
    });

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 13, brainliftId: 999 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(analyzeText).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.markDone).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.markError).not.toHaveBeenCalled();
  });

  it('skips without retrying when FK violation code is on the error itself', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    (pangramAssessmentsStorage.upsertAnalyzing as any).mockRejectedValueOnce({
      code: '23503',
    });

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 14, brainliftId: 999 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(analyzeText).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.markDone).not.toHaveBeenCalled();
    expect(pangramAssessmentsStorage.markError).not.toHaveBeenCalled();
  });

  it('returns skipped when retry exhaustion error write is superseded by a newer hash', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    (analyzeText as any).mockRejectedValue(new PangramTimeoutError(30_000));
    (pangramAssessmentsStorage.markError as any).mockResolvedValueOnce(false);
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any) => {
      fn();
      return 0 as any;
    }) as any);

    const result = await pangramAnalyzeJob(
      { entityType: 'dok3_insight', entityId: 15, brainliftId: 1 },
      mockHelpers,
    );

    expect(result).toEqual({ status: 'skipped' });
    expect(pangramAssessmentsStorage.markError).toHaveBeenCalledWith(
      'dok3_insight',
      15,
      expect.stringContaining('PangramTimeoutError'),
      sha256('some text'),
    );

    vi.restoreAllMocks();
  });

  it('re-throws when markDone fails after Pangram success', async () => {
    (assembleTextForEntity as any).mockResolvedValue('some text');
    (pangramAssessmentsStorage.getByEntity as any).mockResolvedValue(null);
    (analyzeText as any).mockResolvedValue(FIXTURE_RESPONSE);
    const dbErr = new Error('connection terminated');
    (pangramAssessmentsStorage.markDone as any).mockRejectedValue(dbErr);

    await expect(
      pangramAnalyzeJob(
        { entityType: 'dok3_insight', entityId: 12, brainliftId: 1 },
        mockHelpers,
      ),
    ).rejects.toThrow('connection terminated');
  });
});
