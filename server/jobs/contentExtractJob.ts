import type { JobHelpers } from 'graphile-worker';
import { extractContent } from '../services/content-extractor';
import { storage } from '../storage';
import { isQuizzableContent } from '../utils/item-text-content';
import { withJob } from '../utils/withJob';

/**
 * Background job to extract viewable content from a learning stream item's URL.
 * Queued automatically when a new item is inserted.
 *
 * Non-throwing: errors are stored as fallback content so the item is still viewable.
 * After successful extraction of quizzable content, reactively queues quiz generation.
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

    // Reactively trigger quiz generation for quizzable content types
    if (isQuizzableContent(result)) {
      withJob('learning-stream:generate-quiz')
        .forPayload({ itemId, brainliftId })
        .withOptions({ jobKey: `generate-quiz-${itemId}` })
        .queue()
        .catch(err => helpers.logger.error('Failed to queue quiz generation', { itemId, err }));
    }

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
