/**
 * Uniform text content accessor for learning stream items.
 *
 * Returns the text content of a learning stream item, or null
 * if text extraction is not available for that content type.
 *
 * Consumers: quiz generator, discussion agent, evidence fetcher.
 */

import type { LearningStreamItem } from '@shared/schema';

/**
 * Get the text content from a learning stream item.
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
    // transcript field is added by spec 01 (youtube-transcripts)
    // Until then, YouTube items without transcript return null
    const transcript = (content as any).transcript;
    return typeof transcript === 'string' ? transcript : null;
  }

  // PDF, Spotify, Apple Podcast, Tweet, Fallback — no text available
  return null;
}
