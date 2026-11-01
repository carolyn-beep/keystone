/**
 * Spec 02 (web-ui) -- attachAiWritingSignal helper.
 *
 * Unit tests with the underlying storage call mocked, so we only verify the
 * helper's contract (single batch lookup, attach-by-id, empty fast path).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetFullByEntities } = vi.hoisted(() => ({
  mockGetFullByEntities: vi.fn(),
}));

vi.mock('../../storage/pangramAssessments', () => ({
  pangramAssessmentsStorage: {
    getFullByEntities: mockGetFullByEntities,
  },
}));

import { attachAiWritingSignal } from '../aiWritingSignal';
import type { AiWritingSignalPayload } from '@shared/schema';

const donePayload: AiWritingSignalPayload = {
  status: 'done',
  label: 'ai-assisted',
  version: '3.0',
  fractions: { ai: 0.1, aiAssisted: 0.7, human: 0.2 },
  headline: 'Likely AI-Assisted',
  confidence: 'High',
  errorMessage: null,
  analyzedAt: '2026-05-26T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attachAiWritingSignal', () => {
  it('returns an empty array without calling storage when items is empty', async () => {
    const result = await attachAiWritingSignal([], 'dok3_insight');
    expect(result).toEqual([]);
    expect(mockGetFullByEntities).not.toHaveBeenCalled();
  });

  it('issues a single batch lookup with the full id list', async () => {
    mockGetFullByEntities.mockResolvedValueOnce(new Map([[1, null], [2, null], [3, null]]));
    await attachAiWritingSignal(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      'dok2_summary',
    );
    expect(mockGetFullByEntities).toHaveBeenCalledTimes(1);
    expect(mockGetFullByEntities).toHaveBeenCalledWith('dok2_summary', [1, 2, 3]);
  });

  it('attaches the payload from the Map onto each item by id', async () => {
    const payloadMap = new Map<number, AiWritingSignalPayload | null>([
      [10, donePayload],
      [11, null],
      [12, {
        ...donePayload,
        status: 'analyzing',
        label: null,
        version: null,
        fractions: null,
        headline: null,
        confidence: null,
        analyzedAt: null,
      }],
    ]);
    mockGetFullByEntities.mockResolvedValueOnce(payloadMap);

    const items = [
      { id: 10, text: 'a' },
      { id: 11, text: 'b' },
      { id: 12, text: 'c' },
    ];
    const result = await attachAiWritingSignal(items, 'dok3_insight');

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 10, text: 'a', aiWritingSignal: donePayload });
    expect(result[1]).toEqual({ id: 11, text: 'b', aiWritingSignal: null });
    expect(result[2].aiWritingSignal!.status).toBe('analyzing');
  });

  it('attaches aiWritingSignal: null when the storage Map omits an item id', async () => {
    // Defensive case: even if storage forgot an id, the helper must produce a
    // payload field on every item (web UI relies on the field existing).
    mockGetFullByEntities.mockResolvedValueOnce(new Map<number, AiWritingSignalPayload | null>());

    const result = await attachAiWritingSignal(
      [{ id: 99, other: 'x' }],
      'dok4_spov',
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 99, other: 'x', aiWritingSignal: null });
  });

  it('preserves all other fields on the input items (does not strip)', async () => {
    mockGetFullByEntities.mockResolvedValueOnce(new Map([[42, donePayload]]));
    const result = await attachAiWritingSignal(
      [{ id: 42, score: 3, feedback: 'good', nested: { a: 1 } } as const],
      'dok3_insight',
    );
    expect(result[0]).toMatchObject({
      id: 42,
      score: 3,
      feedback: 'good',
      nested: { a: 1 },
      aiWritingSignal: donePayload,
    });
  });
});
