/**
 * Tests for Discussion Verify Fact Job - YouTube transcript resolution
 *
 * Validates that the job resolves YouTube transcripts via resolveYouTubeTranscript
 * and passes them to fetchEvidenceForFact as cachedTranscript.
 *
 * Mocks: storage, fetchEvidenceForFact, verifyFactWithAllModels, resolveYouTubeTranscript
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({
  storage: {
    getFactByIdForBrainlift: vi.fn(),
    createFactVerification: vi.fn(),
  },
}));

vi.mock('../../ai/evidenceFetcher', () => ({
  fetchEvidenceForFact: vi.fn(),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: vi.fn(),
}));

vi.mock('../../utils/resolve-youtube-transcript', () => ({
  resolveYouTubeTranscript: vi.fn(),
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
import { resolveYouTubeTranscript } from '../../utils/resolve-youtube-transcript';
import { discussionVerifyFactJob } from '../discussionVerifyFactJob';
import type { JobHelpers } from 'graphile-worker';

const mockGetFact = vi.mocked(storage.getFactByIdForBrainlift);
const mockFetchEvidence = vi.mocked(fetchEvidenceForFact);
const mockVerify = vi.mocked(verifyFactWithAllModels);
const mockResolveTranscript = vi.mocked(resolveYouTubeTranscript);

const mockHelpers = {
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  job: {
    attempts: 1,
    max_attempts: 3,
  },
} as unknown as JobHelpers;

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTranscript.mockResolvedValue(null);
});

describe('discussionVerifyFactJob - transcript integration', () => {
  it('passes resolved transcript for facts with YouTube source URL', async () => {
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

    mockResolveTranscript.mockResolvedValue(
      'This is the video transcript about testing and retention.'
    );

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

    // Should have called resolveYouTubeTranscript with the source URL
    expect(mockResolveTranscript).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.any(Map)
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

    // resolveYouTubeTranscript returns null for non-YouTube URLs
    expect(mockResolveTranscript).toHaveBeenCalledWith(
      'https://example.com/article',
      expect.any(Map)
    );

    // Should have called fetchEvidenceForFact with null transcript
    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'Some fact from article',
      'https://example.com/article',
      undefined,
      null
    );
  });

  it('passes null transcript when YouTube transcript is unavailable', async () => {
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

    mockResolveTranscript.mockResolvedValue(null);

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

    expect(mockFetchEvidence).toHaveBeenCalledWith(
      'A fact from video',
      'https://www.youtube.com/watch?v=orphan456',
      undefined,
      null
    );
  });

  it('re-throws verification errors on non-final attempts', async () => {
    mockGetFact.mockResolvedValue({
      id: 4,
      brainliftId: 10,
      fact: 'Non-final retry behavior',
      source: 'https://example.com',
      originalId: '4',
      category: 'General',
      score: 0,
      isGradeable: true,
      note: null,
    } as any);

    mockFetchEvidence.mockResolvedValue({
      content: 'doc',
      url: 'https://example.com',
      error: null,
      fetchedAt: new Date(),
    });
    mockVerify.mockRejectedValueOnce(new Error('transient'));

    const nonFinalHelpers = {
      ...mockHelpers,
      job: { attempts: 1, max_attempts: 3 },
    } as unknown as JobHelpers;

    await expect(
      discussionVerifyFactJob({ factId: 4, brainliftId: 10 }, nonFinalHelpers),
    ).rejects.toThrow('transient');
  });
});
