/**
 * Tests for the manual-item metadata backfill in contentExtractJob: after
 * caching extracted content, pasted manual items get their placeholder
 * topic/author/type updated from the derived metadata; non-manual items are
 * left alone; backfill failures never fail the extraction job.
 *
 * Mocks: extractContent, deriveManualItemMetadata, storage, withJob.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/content-extractor', () => ({
  extractContent: vi.fn(),
}));

vi.mock('../../services/manual-item-metadata', () => ({
  deriveManualItemMetadata: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: {
    cacheExtractedContent: vi.fn(),
    getLearningStreamItemById: vi.fn(),
    updateLearningStreamItemMetadata: vi.fn(),
  },
}));

const { mockQueue, mockWithOptions, mockForPayload } = vi.hoisted(() => {
  const mockQueue = vi.fn().mockResolvedValue('job-id');
  const mockWithOptions = vi.fn().mockReturnValue({ queue: mockQueue });
  const mockForPayload = vi.fn().mockReturnValue({ withOptions: mockWithOptions, queue: mockQueue });
  return { mockQueue, mockWithOptions, mockForPayload };
});

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn().mockReturnValue({ forPayload: mockForPayload }),
}));

import { extractContent } from '../../services/content-extractor';
import { deriveManualItemMetadata } from '../../services/manual-item-metadata';
import { storage } from '../../storage';
import { contentExtractJob } from '../contentExtractJob';
import type { JobHelpers } from 'graphile-worker';

const mockExtract = vi.mocked(extractContent);
const mockDerive = vi.mocked(deriveManualItemMetadata);
const mockGetItem = vi.mocked(storage.getLearningStreamItemById);
const mockUpdateMeta = vi.mocked(storage.updateLearningStreamItemMetadata);

const mockHelpers = {
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  job: { id: 'test-job-id', attempts: 1, max_attempts: 1 },
} as unknown as JobHelpers;

const PAYLOAD = { itemId: 42, brainliftId: 7, url: 'https://example.com/story' };
const ARTICLE = { contentType: 'article' as const, markdown: '# Body', title: 'The Story' };

beforeEach(() => {
  vi.clearAllMocks();
  mockExtract.mockResolvedValue(ARTICLE);
});

describe('contentExtractJob - manual metadata backfill', () => {
  it('backfills topic/author/type for manual items', async () => {
    mockGetItem.mockResolvedValue({ id: 42, source: 'manual' } as any);
    mockDerive.mockResolvedValue({ topic: 'The Story', author: 'Jane Doe', type: 'News' });

    const result = await contentExtractJob(PAYLOAD, mockHelpers);

    expect(mockDerive).toHaveBeenCalledWith(PAYLOAD.url, ARTICLE);
    expect(mockUpdateMeta).toHaveBeenCalledWith(42, 7, {
      topic: 'The Story',
      author: 'Jane Doe',
      type: 'News',
    });
    expect(result).toEqual({ success: true, contentType: 'article' });
  });

  it('skips backfill for non-manual items', async () => {
    mockGetItem.mockResolvedValue({ id: 42, source: 'starter-pack' } as any);

    await contentExtractJob(PAYLOAD, mockHelpers);

    expect(mockDerive).not.toHaveBeenCalled();
    expect(mockUpdateMeta).not.toHaveBeenCalled();
  });

  it('a backfill failure logs but does not fail extraction', async () => {
    mockGetItem.mockRejectedValue(new Error('db hiccup'));

    const result = await contentExtractJob(PAYLOAD, mockHelpers);

    expect(result).toEqual({ success: true, contentType: 'article' });
    expect(mockHelpers.logger.error).toHaveBeenCalledWith(
      'Manual item metadata backfill failed',
      expect.objectContaining({ itemId: 42 }),
    );
  });
});
