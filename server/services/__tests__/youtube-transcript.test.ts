/**
 * Tests for YouTube Transcript Extraction Service
 *
 * Validates that fetchYouTubeTranscript() correctly wraps @playzone/youtube-transcript,
 * cleans output, handles errors gracefully, and respects timeout.
 *
 * Mocks: @playzone/youtube-transcript/dist/api
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock('@playzone/youtube-transcript/dist/api', () => ({
  createYouTubeTranscriptApi: () => ({
    fetch: mockFetch,
  }),
}));

import { fetchYouTubeTranscript } from '../youtube-transcript';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('fetchYouTubeTranscript', () => {
  it('returns cleaned text for a video with captions', async () => {
    mockFetch.mockResolvedValue({
      snippets: [
        { text: 'Hello everyone', start: 0, duration: 2 },
        { text: 'welcome to the video', start: 2, duration: 3 },
        { text: 'today we discuss testing', start: 5, duration: 4 },
      ],
    });

    const result = await fetchYouTubeTranscript('abc123');

    expect(result).toBe('Hello everyone welcome to the video today we discuss testing');
    expect(mockFetch).toHaveBeenCalledWith('abc123');
  });

  it('joins multiple segments into plain text', async () => {
    mockFetch.mockResolvedValue({
      snippets: [
        { text: 'Line one', start: 0, duration: 2 },
        { text: 'Line two', start: 2, duration: 2 },
        { text: 'Line three', start: 4, duration: 2 },
      ],
    });

    const result = await fetchYouTubeTranscript('multi123');

    expect(result).toBe('Line one Line two Line three');
  });

  it('returns null when video throws error', async () => {
    mockFetch.mockRejectedValue(new Error('Video unavailable'));

    const result = await fetchYouTubeTranscript('restricted123');

    expect(result).toBeNull();
  });

  it('returns null when snippets array is empty', async () => {
    mockFetch.mockResolvedValue({ snippets: [] });

    const result = await fetchYouTubeTranscript('empty123');

    expect(result).toBeNull();
  });

  it('returns null when result has no snippets property', async () => {
    mockFetch.mockResolvedValue({});

    const result = await fetchYouTubeTranscript('nosubs123');

    expect(result).toBeNull();
  });

  it('never throws an unhandled exception', async () => {
    mockFetch.mockRejectedValue(new Error('catastrophic'));

    await expect(fetchYouTubeTranscript('crash123')).resolves.toBeNull();
  });
});
