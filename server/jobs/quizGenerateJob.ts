import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { ensureItemTextContent } from '../utils/item-text-content';
import { generateQuiz } from '../services/quiz-generator';

/**
 * Background job to generate and store a Knowledge Check quiz for a learning stream item.
 * Queued reactively after contentExtractJob completes for quizzable content types.
 *
 * Non-throwing: errors are logged but do not cause retry. The inline fallback
 * in POST /quiz handles the case where this job fails or hasn't completed yet.
 */
export async function quizGenerateJob(
  payload: { itemId: number; brainliftId: number },
  helpers: JobHelpers
): Promise<{ success: boolean; questionCount?: number; skipped?: string; error?: string }> {
  const { itemId, brainliftId } = payload;

  helpers.logger.info('Starting quiz generation', { itemId, brainliftId });

  // 1. Fetch item (with brainlift scope check)
  const item = await storage.getLearningStreamItemById(itemId, brainliftId);
  if (!item) {
    helpers.logger.warn('Item not found, may have been deleted', { itemId, brainliftId });
    return { success: false };
  }

  // 2. Check if quiz already exists
  const existingQuiz = await storage.getQuizByItemId(itemId, brainliftId);
  if (existingQuiz) {
    helpers.logger.info('Quiz already exists, skipping', { itemId });
    return { success: true, skipped: 'already-exists' };
  }

  // 3. Get text content (for articles: markdown, for YouTube: fetches transcript on demand)
  const textContent = await ensureItemTextContent(item);
  if (!textContent) {
    helpers.logger.info('No text content available, skipping', { itemId });
    return { success: true, skipped: 'no-text-content' };
  }

  // 4. Generate quiz
  try {
    const generated = await generateQuiz({
      textContent,
      itemTopic: item.topic,
      itemType: item.type,
    });

    // 5. Store quiz
    try {
      await storage.createQuiz(itemId, brainliftId, generated.questions);
    } catch (err: any) {
      // Handle unique constraint race condition (another process created it first)
      if (err?.cause?.code === '23505') {
        helpers.logger.info('Quiz created by another process (race condition), skipping', { itemId });
        return { success: true, skipped: 'already-exists' };
      }
      throw err;
    }

    helpers.logger.info('Quiz generation completed', {
      itemId,
      questionCount: generated.questions.length,
    });

    return { success: true, questionCount: generated.questions.length };
  } catch (error: any) {
    helpers.logger.error('Quiz generation failed', {
      itemId,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}
