/**
 * Tests for FR3: Wire Transcript into Content Extraction Pipeline
 *
 * Validates that content-extractor.ts attempts transcript extraction
 * for YouTube URLs and gracefully degrades when transcript fails.
 *
 * Mocks: fetchYouTubeTranscript from youtube-transcript service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../youtube-transcript', () => ({
  fetchYouTubeTranscript: vi.fn(),
}));

import { fetchYouTubeTranscript } from '../youtube-transcript';
import { extractContent } from '../content-extractor';

const mockFetchTranscript = vi.mocked(fetchYouTubeTranscript);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractContent - YouTube transcript integration', () => {
  it('produces embed with transcript when transcript available (youtube.com/watch)', async () => {
    mockFetchTranscript.mockResolvedValue('Hello this is the transcript text');

    const result = await extractContent('https://www.youtube.com/watch?v=abc123');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'abc123',
      transcript: 'Hello this is the transcript text',
    });
    expect(mockFetchTranscript).toHaveBeenCalledWith('abc123');
  });

  it('produces embed without transcript when transcript fails', async () => {
    mockFetchTranscript.mockResolvedValue(null);

    const result = await extractContent('https://www.youtube.com/watch?v=abc123');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'abc123',
    });
  });

  it('extracts transcript for youtu.be short URL', async () => {
    mockFetchTranscript.mockResolvedValue('Short URL transcript');

    const result = await extractContent('https://youtu.be/xyz789');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'xyz789',
      transcript: 'Short URL transcript',
    });
    expect(mockFetchTranscript).toHaveBeenCalledWith('xyz789');
  });

  it('extracts transcript for youtube.com/embed/ URL', async () => {
    mockFetchTranscript.mockResolvedValue('Embed URL transcript');

    const result = await extractContent('https://www.youtube.com/embed/def456');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'def456',
      transcript: 'Embed URL transcript',
    });
    expect(mockFetchTranscript).toHaveBeenCalledWith('def456');
  });

  it('falls back to embed-only when transcript extraction times out', async () => {
    mockFetchTranscript.mockResolvedValue(null);

    const result = await extractContent('https://www.youtube.com/watch?v=timeout123');

    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'youtube',
      embedId: 'timeout123',
    });
  });

  it('does not call fetchYouTubeTranscript for non-YouTube embeds', async () => {
    // Spotify URL should not trigger transcript fetch
    const result = await extractContent('https://open.spotify.com/episode/sp123');

    expect(mockFetchTranscript).not.toHaveBeenCalled();
    expect(result).toEqual({
      contentType: 'embed',
      embedType: 'spotify',
      embedId: 'sp123',
    });
  });
});
