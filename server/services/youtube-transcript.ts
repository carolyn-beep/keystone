import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Fetch the auto-generated transcript for a YouTube video.
 *
 * Returns cleaned plain text (no timestamps), or null on any failure.
 * Never throws — all errors are caught and logged.
 *
 * @param videoId - YouTube video ID (e.g., "dQw4w9WgXcQ")
 * @returns Plain text transcript or null
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  try {
    const segments = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transcript fetch timed out (10s)')), 10_000)
      ),
    ]);

    if (!segments || segments.length === 0) {
      return null;
    }

    // Join segments into plain text, stripping timestamps
    const text = segments.map((s) => s.text).join(' ');

    return text || null;
  } catch (error: any) {
    console.log(`[YouTube Transcript] Failed for video ${videoId}: ${error.message}`);
    return null;
  }
}
