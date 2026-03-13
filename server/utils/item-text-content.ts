/**
 * Uniform text content accessor for learning stream items.
 *
 * Returns the text content of a learning stream item, or null
 * if text extraction is not available for that content type.
 *
 * Consumers: quiz generator, discussion agent, evidence fetcher.
 */

import type { LearningStreamItem, ExtractedContent } from '@shared/schema';
import { fetchYouTubeTranscript } from '../services/youtube-transcript';

/**
 * Get the text content from a learning stream item (synchronous).
 *
 * Content type mapping:
 * - Article -> extractedContent.markdown
 * - YouTube embed with transcript -> extractedContent.transcript (from spec 01)
 * - YouTube embed without transcript -> null
 * - PDF, Podcast, Tweet, Fallback -> null
 * - No extractedContent -> null
 */
export function getItemTextContent(item: LearningStreamItem): string | null {
  const content = item.extractedContent;
  if (!content) {
    return null;
  }

  if (content.contentType === 'article') {
    return content.markdown;
  }

  if (content.contentType === 'embed' && content.embedType === 'youtube') {
    // transcript field is optional — available when YouTube transcript extraction succeeds
    return content.transcript ?? null;
  }

  // PDF, Spotify, Apple Podcast, Tweet, Fallback — no text available
  return null;
}

/**
 * Get the text content from a learning stream item (async).
 * For YouTube items without a cached transcript, fetches it on demand.
 *
 * Used by quizGenerateJob where we can afford the async fetch.
 */
export async function ensureItemTextContent(item: LearningStreamItem): Promise<string | null> {
  const content = item.extractedContent;
  if (!content) {
    return null;
  }

  if (content.contentType === 'article') {
    return content.markdown;
  }

  if (content.contentType === 'embed' && content.embedType === 'youtube') {
    // Use cached transcript if available
    if (content.transcript) {
      return content.transcript;
    }
    // Otherwise fetch on demand
    return fetchYouTubeTranscript(content.embedId);
  }

  return null;
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
