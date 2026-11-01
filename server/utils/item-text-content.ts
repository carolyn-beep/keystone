/**
 * Uniform text content accessor for learning stream items.
 *
 * Consumers: quiz generator, discussion agent, evidence fetcher.
 */

import type { LearningStreamItem, ExtractedContent } from '@shared/schema';
import { resolveYouTubeTranscript } from './resolve-youtube-transcript';

/**
 * Get stored text content from a learning stream item (synchronous).
 *
 * Only returns content already in the DB (article markdown).
 * For YouTube transcripts, use ensureItemTextContent() which fetches on demand.
 */
export function getItemTextContent(item: LearningStreamItem): string | null {
  const content = item.extractedContent;
  if (!content) {
    return null;
  }

  if (content.contentType === 'article') {
    return content.markdown;
  }

  return null;
}

/**
 * Get text content from a learning stream item, fetching the YouTube
 * transcript on-the-fly if needed.
 *
 * Transcripts are NOT persisted — they're fetched on demand and cached
 * per-batch via the transcriptCache map to avoid duplicate fetches within
 * a single operation.
 *
 * @param item - The learning stream item
 * @param transcriptCache - Optional shared cache for batched operations
 */
export async function ensureItemTextContent(
  item: LearningStreamItem,
  transcriptCache?: Map<string, string | null>,
): Promise<string | null> {
  const existing = getItemTextContent(item);
  if (existing) {
    return existing;
  }

  const content = item.extractedContent;
  if (!content || content.contentType !== 'embed' || content.embedType !== 'youtube') {
    return null;
  }

  const cache = transcriptCache ?? new Map<string, string | null>();
  return resolveYouTubeTranscript(
    `https://www.youtube.com/watch?v=${content.embedId}`,
    cache,
  );
}

/**
 * Check if an extracted content type is quizzable (article or YouTube).
 *
 * Used by contentExtractJob to decide whether to queue quiz generation,
 * and by POST /quiz to determine content availability.
 */
export function isQuizzableContent(ec: ExtractedContent): boolean {
  if (ec.contentType === 'article') return true;
  if (ec.contentType === 'embed' && ec.embedType === 'youtube') return true;
  return false;
}
