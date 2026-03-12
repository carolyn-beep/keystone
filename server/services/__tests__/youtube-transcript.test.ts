/**
 * Tests for FR1: YouTube Transcript Extraction Service
 *
 * Validates that fetchYouTubeTranscript() correctly wraps the youtube-transcript
 * package, cleans output, handles errors gracefully, and respects timeout.
 *
 * Mocks: youtube-transcript package
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('youtube-transcript', () => ({
  YoutubeTranscript: {
    fetchTranscript: vi.fn(),
  },
}));

import { YoutubeTranscript } from 'youtube-transcript';
import { fetchYouTubeTranscript } from '../youtube-transcript';

const mockFetchTranscript = vi.mocked(YoutubeTranscript.fetchTranscript);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('fetchYouTubeTranscript', () => {
  it('returns cleaned text for a video with auto-captions', async () => {
    mockFetchTranscript.mockResolvedValue([
      { text: 'Hello everyone', duration: 2, offset: 0 },
      { text: 'welcome to the video', duration: 3, offset: 2 },
      { text: 'today we discuss testing', duration: 4, offset: 5 },
    ]);

    const result = await fetchYouTubeTranscript('abc123');

    expect(result).toBe('Hello everyone welcome to the video today we discuss testing');
    expect(mockFetchTranscript).toHaveBeenCalledWith('abc123');
  });

  it('returns text with no timestamps, only spoken content', async () => {
    mockFetchTranscript.mockResolvedValue([
      { text: 'First segment', duration: 5, offset: 0 },
      { text: 'Second segment', duration: 5, offset: 5 },
    ]);

    const result = await fetchYouTubeTranscript('vid456');

    // Result should be plain text with no timestamps or offset info
    expect(result).not.toContain('0');
    expect(result).not.toContain('5');
    expect(result).toContain('First segment');
    expect(result).toContain('Second segment');
  });

  it('handles multi-line transcript output by joining segments', async () => {
    mockFetchTranscript.mockResolvedValue([
      { text: 'Line one', duration: 2, offset: 0 },
      { text: 'Line two', duration: 2, offset: 2 },
      { text: 'Line three', duration: 2, offset: 4 },
      { text: 'Line four', duration: 2, offset: 6 },
      { text: 'Line five', duration: 2, offset: 8 },
    ]);

    const result = await fetchYouTubeTranscript('multi123');

    expect(result).toBe('Line one Line two Line three Line four Line five');
  });

  it('returns null for age-restricted video (package throws)', async () => {
    mockFetchTranscript.mockRejectedValue(new Error('Video unavailable'));

    const result = await fetchYouTubeTranscript('restricted123');

    expect(result).toBeNull();
  });

  it('returns null for private/deleted video', async () => {
    mockFetchTranscript.mockRejectedValue(new Error('Video not found'));

    const result = await fetchYouTubeTranscript('private456');

    expect(result).toBeNull();
  });

  it('returns null for live stream (no transcript)', async () => {
    mockFetchTranscript.mockRejectedValue(new Error('Transcript not available'));

    const result = await fetchYouTubeTranscript('live789');

    expect(result).toBeNull();
  });

  it('returns null when youtube-transcript package throws any error', async () => {
    mockFetchTranscript.mockRejectedValue(new Error('Unexpected error'));

    const result = await fetchYouTubeTranscript('error123');

    expect(result).toBeNull();
  });

  it('returns null when transcript is empty array', async () => {
    mockFetchTranscript.mockResolvedValue([]);

    const result = await fetchYouTubeTranscript('empty123');

    expect(result).toBeNull();
  });

  it('never throws an unhandled exception', async () => {
    mockFetchTranscript.mockRejectedValue(new Error('catastrophic'));

    // Should not throw
    await expect(fetchYouTubeTranscript('crash123')).resolves.toBeNull();
  });
});
