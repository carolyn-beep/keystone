import type { JobHelpers } from 'graphile-worker';
import { extractContent } from '../services/content-extractor';
import { deriveManualItemMetadata } from '../services/manual-item-metadata';
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

    // Pasted manual items are inserted with placeholders (raw URL as topic,
    // hostname as author, type 'News'); backfill real title/author/type now
    // that extraction has told us what the link is. Best-effort: a failure
    // here never fails the extraction itself.
    try {
      const item = await storage.getLearningStreamItemById(itemId, brainliftId);
      if (item?.source === 'manual') {
        const metadata = await deriveManualItemMetadata(url, result);
        await storage.updateLearningStreamItemMetadata(itemId, brainliftId, metadata);
      }
    } catch (error: any) {
      helpers.logger.error('Manual item metadata backfill failed', {
        itemId,
        error: error.message,
      });
    }

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
