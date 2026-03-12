/**
 * Tests for FR5: Discussion Verify Fact Job - transcript lookup
 *
 * Validates that the job looks up YouTube transcripts from learning stream
 * items and passes them to fetchEvidenceForFact as cachedTranscript.
 *
 * Mocks: storage, fetchEvidenceForFact, verifyFactWithAllModels
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({
  storage: {
    getFactByIdForBrainlift: vi.fn(),
    getLearningStreamItemByUrl: vi.fn(),
    createFactVerification: vi.fn(),
  },
}));

vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn(),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: vi.fn(),
}));

vi.mock('../../storage/base', () => ({
  db: {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  eq: vi.fn(),
  facts: {},
}));

import { storage } from '../../storage';
import { fetchEvidenceForFact } from '../../ai/evidenceFetcher';
import { verifyFactWithAllModels } from '../../ai/factVerifier';
import { discussionVerifyFactJob } from '../discussionVerifyFactJob';
import type { JobHelpers } from 'graphile-worker';

const mockGetFact = vi.mocked(storage.getFactByIdForBrainlift);
const mockGetItemByUrl = vi.mocked(storage.getLearningStreamItemByUrl);
const mockFetchEvidence = vi.mocked(fetchEvidenceForFact);
const mockVerify = vi.mocked(verifyFactWithAllModels);

const mockHelpers = {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
} as unknown as JobHelpers;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('discussionVerifyFactJob - transcript integration', () => {
  it('passes cached transcript for facts with YouTube source URL', async () => {
    mockGetFact.mockResolvedValue({
      id: 1,
      brainliftId: 10,
      fact: 'Testing helps retention',
      source: 'https://www.youtube.com/watch?v=abc123',
      originalId: '1',
      category: 'Learning',
      score: 0,
      isGradeable: true,
      note: null,
    } as any);

    mockGetItemByUrl.mockResolvedValue({
      id: 42,
      brainliftId: 10,
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'abc123',
        transcript: 'This is the video transcript about testing and retention.',
      },
    } as any);

    mockFetchEvidence.mockResolvedValue({
      content: 'This is the video transcript about testing and retention.',
      url: 'https://www.youtube.com/watch?v=abc123',
      error: null,
      fetchedAt: new Date(),
    });

    mockVerify.mockResolvedValue({
      consensus: {
        consensusScore: 4,
        verificationNotes: 'Verified from transcript',
        isNonGradeable: false,
      },
    } as any);

    await discussionVerifyFactJob({ factId: 1, brainliftId: 10 }, mockHelpers);

    // Should have looked up item by URL
    expect(mockGetItemByUrl).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      10
    );

    // Should have passed transcript to fetchEvidenceForFact
    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'Testing helps retention',
      'https://www.youtube.com/watch?v=abc123',
      undefined,
      'This is the video transcript about testing and retention.'
    );
  });

  it('uses existing behavior for non-YouTube source', async () => {
    mockGetFact.mockResolvedValue({
      id: 2,
      brainliftId: 10,
      fact: 'Some fact from article',
      source: 'https://example.com/article',
      originalId: '2',
      category: 'General',
      score: 0,
      isGradeable: true,
      note: null,
    } as any);

    mockFetchEvidence.mockResolvedValue({
      content: 'Article content',
      url: 'https://example.com/article',
      error: null,
      fetchedAt: new Date(),
    });

    mockVerify.mockResolvedValue({
      consensus: {
        consensusScore: 3,
        verificationNotes: 'Checked',
        isNonGradeable: false,
      },
    } as any);

    await discussionVerifyFactJob({ factId: 2, brainliftId: 10 }, mockHelpers);

    // Should NOT have looked up by URL (not a YouTube URL)
    expect(mockGetItemByUrl).not.toHaveBeenCalled();

    // Should have called fetchEvidenceForFact without cached transcript
    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'Some fact from article',
      'https://example.com/article'
    );
  });

  it('falls back when YouTube URL has no matching learning stream item', async () => {
    mockGetFact.mockResolvedValue({
      id: 3,
      brainliftId: 10,
      fact: 'A fact from video',
      source: 'https://www.youtube.com/watch?v=orphan456',
      originalId: '3',
      category: 'Learning',
      score: 0,
      isGradeable: true,
      note: null,
    } as any);

    mockGetItemByUrl.mockResolvedValue(null); // No matching item

    mockFetchEvidence.mockResolvedValue({
      content: null,
      url: 'https://www.youtube.com/watch?v=orphan456',
      error: 'No content',
      fetchedAt: new Date(),
    });

    mockVerify.mockResolvedValue({
      consensus: {
        consensusScore: 0,
        verificationNotes: 'Could not verify',
        isNonGradeable: true,
      },
    } as any);

    await discussionVerifyFactJob({ factId: 3, brainliftId: 10 }, mockHelpers);

    expect(mockGetItemByUrl).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=orphan456',
      10
    );

    // Should pass null/undefined transcript (falls back to existing behavior)
    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'A fact from video',
      'https://www.youtube.com/watch?v=orphan456',
      undefined,
      null
    );
  });

  it('falls back when YouTube item exists but has no transcript', async () => {
    mockGetFact.mockResolvedValue({
      id: 4,
      brainliftId: 10,
      fact: 'A fact without transcript',
      source: 'https://www.youtube.com/watch?v=notrans789',
      originalId: '4',
      category: 'Testing',
      score: 0,
      isGradeable: true,
      note: null,
    } as any);

    mockGetItemByUrl.mockResolvedValue({
      id: 99,
      brainliftId: 10,
      extractedContent: {
        contentType: 'embed',
        embedType: 'youtube',
        embedId: 'notrans789',
        // No transcript field
      },
    } as any);

    mockFetchEvidence.mockResolvedValue({
      content: null,
      url: 'https://www.youtube.com/watch?v=notrans789',
      error: 'No evidence found',
      fetchedAt: new Date(),
    });

    mockVerify.mockResolvedValue({
      consensus: {
        consensusScore: 0,
        verificationNotes: 'No evidence',
        isNonGradeable: true,
      },
    } as any);

    await discussionVerifyFactJob({ factId: 4, brainliftId: 10 }, mockHelpers);

    // Should pass null transcript (no transcript on item)
    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'A fact without transcript',
      'https://www.youtube.com/watch?v=notrans789',
      undefined,
      null
    );
  });
});
