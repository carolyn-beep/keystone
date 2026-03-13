/**
 * Tests for FR2: Reactive trigger from contentExtractJob
 *
 * Validates that contentExtractJob queues quiz generation for quizzable
 * content types and skips for non-quizzable types.
 *
 * Mocks: extractContent, storage, withJob
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/content-extractor', () => ({
  extractContent: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: {
    cacheExtractedContent: vi.fn(),
  },
}));

// withJob returns a builder chain: withJob(name).forPayload(p).withOptions(o).queue()
// Use vi.hoisted to define mock fns before vi.mock runs
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
import { storage } from '../../storage';
import { withJob } from '../../utils/withJob';
import { contentExtractJob } from '../contentExtractJob';
import type { JobHelpers } from 'graphile-worker';

const mockExtract = vi.mocked(extractContent);
const mockCache = vi.mocked(storage.cacheExtractedContent);
const mockWithJob = vi.mocked(withJob);

const mockHelpers = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  job: { id: 'test-job-id', attempts: 1, max_attempts: 1 },
} as unknown as JobHelpers;

const PAYLOAD = { itemId: 42, brainliftId: 7, url: 'https://example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the chain mocks
  mockQueue.mockResolvedValue('job-id');
  mockWithOptions.mockReturnValue({ queue: mockQueue });
  mockForPayload.mockReturnValue({ withOptions: mockWithOptions, queue: mockQueue });
  mockWithJob.mockReturnValue({ forPayload: mockForPayload } as any);
  mockCache.mockResolvedValue(undefined as any);
});

describe('contentExtractJob - quiz trigger (FR2)', () => {
  describe('quizzable content types trigger quiz job', () => {
    it('queues quiz generation for article extraction', async () => {
      const articleResult = { contentType: 'article' as const, markdown: '# Article', title: 'Test' };
      mockExtract.mockResolvedValue(articleResult);

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).toHaveBeenCalledWith('learning-stream:generate-quiz');
      expect(mockForPayload).toHaveBeenCalledWith({ itemId: 42, brainliftId: 7 });
      expect(mockWithOptions).toHaveBeenCalledWith({ jobKey: 'generate-quiz-42' });
    });

    it('queues quiz generation for YouTube extraction', async () => {
      const youtubeResult = { contentType: 'embed' as const, embedType: 'youtube' as const, embedId: 'abc' };
      mockExtract.mockResolvedValue(youtubeResult);

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).toHaveBeenCalledWith('learning-stream:generate-quiz');
    });
  });

  describe('non-quizzable content types do NOT trigger quiz job', () => {
    it('does not queue for Spotify extraction', async () => {
      mockExtract.mockResolvedValue({ contentType: 'embed' as const, embedType: 'spotify' as const, embedId: 'track1' });

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });

    it('does not queue for Apple Podcast extraction', async () => {
      mockExtract.mockResolvedValue({ contentType: 'embed' as const, embedType: 'apple-podcast' as const, embedUrl: 'https://podcasts.apple.com/...' });

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });

    it('does not queue for Tweet extraction', async () => {
      mockExtract.mockResolvedValue({ contentType: 'embed' as const, embedType: 'tweet' as const, tweetId: '123' });

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });

    it('does not queue for PDF extraction', async () => {
      mockExtract.mockResolvedValue({ contentType: 'pdf' as const, url: 'https://example.com/doc.pdf' });

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });

    it('does not queue for fallback extraction', async () => {
      mockExtract.mockResolvedValue({ contentType: 'fallback' as const, reason: 'Failed' });

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });
  });

  describe('error cases', () => {
    it('does not queue quiz job when content extraction fails', async () => {
      mockExtract.mockRejectedValue(new Error('Network error'));

      await contentExtractJob(PAYLOAD, mockHelpers);

      expect(mockWithJob).not.toHaveBeenCalledWith('learning-stream:generate-quiz');
    });
  });
});
