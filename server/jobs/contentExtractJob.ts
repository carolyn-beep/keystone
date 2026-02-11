import type { JobHelpers } from 'graphile-worker';
import { extractContent } from '../services/content-extractor';
import { storage } from '../storage';

/**
 * Background job to extract viewable content from a learning stream item's URL.
 * Queued automatically when a new item is inserted.
 *
 * Non-throwing: errors are stored as fallback content so the item is still viewable.
 */
export async function contentExtractJob(
  payload: { itemId: number; brainliftId: number; url: string },
  helpers: JobHelpers
) {
  const { itemId, brainliftId, url } = payload;

  helpers.logger.info('Starting content extraction', { itemId, url });

  try {
    const result = await extractContent(url);

    await storage.cacheExtractedContent(itemId, brainliftId, result);

    helpers.logger.info('Content extraction completed', {
      itemId,
      contentType: result.contentType,
    });

    return { success: true, contentType: result.contentType };
  } catch (error: any) {
    helpers.logger.error('Content extraction failed', {
      itemId,
      error: error.message,
    });

    // Store fallback so the item doesn't stay in "pending" state forever
    const fallback = { contentType: 'fallback' as const, reason: error.message || 'Extraction job failed' };
    await storage.cacheExtractedContent(itemId, brainliftId, fallback).catch(() => {});

    return { success: false, error: error.message };
  }
}
