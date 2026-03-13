import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/youtube-transcript', () => ({
  fetchYouTubeTranscript: vi.fn(),
}));

import { fetchYouTubeTranscript } from '../../services/youtube-transcript';
import { resolveYouTubeTranscript } from '../resolve-youtube-transcript';

const mockFetch = vi.mocked(fetchYouTubeTranscript);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveYouTubeTranscript', () => {
  it('fetches transcript for youtube.com/watch URL and caches it', async () => {
    mockFetch.mockResolvedValue('The transcript text');
    const cache = new Map<string, string | null>();

    const result = await resolveYouTubeTranscript(
      'https://www.youtube.com/watch?v=abc123',
      cache
    );

    expect(result).toBe('The transcript text');
    expect(mockFetch).toHaveBeenCalledWith('abc123');
    expect(cache.get('abc123')).toBe('The transcript text');
  });

  it('fetches transcript for youtu.be short URL', async () => {
    mockFetch.mockResolvedValue('Short URL transcript');
    const cache = new Map<string, string | null>();

    const result = await resolveYouTubeTranscript(
      'https://youtu.be/xyz789',
      cache
    );

    expect(result).toBe('Short URL transcript');
    expect(mockFetch).toHaveBeenCalledWith('xyz789');
  });

  it('fetches transcript for youtube.com/embed URL', async () => {
    mockFetch.mockResolvedValue('Embed transcript');
    const cache = new Map<string, string | null>();

    const result = await resolveYouTubeTranscript(
      'https://www.youtube.com/embed/emb456',
      cache
    );

    expect(result).toBe('Embed transcript');
    expect(mockFetch).toHaveBeenCalledWith('emb456');
  });

  it('returns null for non-YouTube URLs without calling fetch', async () => {
    const cache = new Map<string, string | null>();

    const result = await resolveYouTubeTranscript(
      'https://example.com/article',
      cache
    );

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns cached value on second call for same video', async () => {
    mockFetch.mockResolvedValue('Cached transcript');
    const cache = new Map<string, string | null>();

    // First call — fetches
    await resolveYouTubeTranscript('https://www.youtube.com/watch?v=dup1', cache);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — uses cache
    const result = await resolveYouTubeTranscript(
      'https://www.youtube.com/watch?v=dup1',
      cache
    );

    expect(result).toBe('Cached transcript');
    expect(mockFetch).toHaveBeenCalledTimes(1); // Still only 1 call
  });

  it('caches null when transcript fetch fails', async () => {
    mockFetch.mockResolvedValue(null);
    const cache = new Map<string, string | null>();

    const result1 = await resolveYouTubeTranscript(
      'https://www.youtube.com/watch?v=fail1',
      cache
    );
    expect(result1).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call — returns cached null, does NOT retry
    const result2 = await resolveYouTubeTranscript(
      'https://www.youtube.com/watch?v=fail1',
      cache
    );
    expect(result2).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('caches per video ID, not per URL variant', async () => {
    mockFetch.mockResolvedValue('Same video transcript');
    const cache = new Map<string, string | null>();

    // Fetch via full URL
    await resolveYouTubeTranscript('https://www.youtube.com/watch?v=same1', cache);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Same video ID via embed URL — should hit cache
    const result = await resolveYouTubeTranscript(
      'https://www.youtube.com/embed/same1',
      cache
    );
    expect(result).toBe('Same video transcript');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
