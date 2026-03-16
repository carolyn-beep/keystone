import { createYouTubeTranscriptApi } from '@playzone/youtube-transcript/dist/api/index.js';

const api = createYouTubeTranscriptApi();

/**
 * Fetch the transcript for a YouTube video.
 *
 * Uses @playzone/youtube-transcript which handles auto-generated captions
 * and falls back to Invidious when YouTube blocks server IPs.
 *
 * Returns cleaned plain text (no timestamps), or null on any failure.
 * Never throws — all errors are caught and logged.
 *
 * @param videoId - YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns Plain text transcript or null
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const result = await Promise.race([
      api.fetch(videoId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transcript fetch timed out (10s)')), 10_000)
      ),
    ]);

    if (!result?.snippets || result.snippets.length === 0) {
      return null;
    }

    const text = result.snippets.map((s: { text: string }) => s.text).join(' ');

    return text || null;
  } catch (error: any) {
    console.log(`[YouTube Transcript] Failed for video ${videoId}: ${error.message}`);
    return null;
  }
}
