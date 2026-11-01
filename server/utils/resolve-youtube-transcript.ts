import { fetchYouTubeTranscript } from '../services/youtube-transcript';

const YOUTUBE_URL_RE = /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed\/)/i;

/**
 * Extract YouTube video ID from a URL string.
 * Handles youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID.
 */
function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    if (
      (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') &&
      url.pathname === '/watch'
    ) {
      return url.searchParams.get('v');
    }
    if (
      (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com') &&
      url.pathname.startsWith('/embed/')
    ) {
      return url.pathname.split('/embed/')[1]?.split('?')[0] || null;
    }
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('?')[0] || null;
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/**
 * Resolve a YouTube transcript for a source URL, with per-batch caching.
 *
 * Usage: create a single `Map<string, string | null>()` per grading batch,
 * then call this for each fact's source URL. Multiple facts referencing the
 * same video will only fetch the transcript once.
 *
 * @param sourceUrl - The fact's source URL (already extracted from fact.source / fact.aiNotes)
 * @param transcriptCache - Shared cache across the batch. Key = video ID, value = transcript or null.
 * @returns Transcript text, or null if not a YouTube URL or transcript unavailable.
 */
export async function resolveYouTubeTranscript(
  sourceUrl: string,
  transcriptCache: Map<string, string | null>,
): Promise<string | null> {
  if (!YOUTUBE_URL_RE.test(sourceUrl)) {
    return null;
  }

  const videoId = extractYouTubeVideoId(sourceUrl);
  if (!videoId) {
    return null;
  }

  if (transcriptCache.has(videoId)) {
    const cached = transcriptCache.get(videoId)!;
    console.log(`[Transcript Cache] HIT for ${videoId}: ${cached ? `${cached.length} chars` : 'null'}`);
    return cached;
  }

  console.log(`[Transcript Cache] MISS for ${videoId}, fetching...`);
  const transcript = await fetchYouTubeTranscript(videoId);
  transcriptCache.set(videoId, transcript);
  return transcript;
}
