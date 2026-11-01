/**
 * Knowledge Check quiz API endpoints.
 *
 * POST /api/brainlifts/:slug/learning-stream/:itemId/quiz - Generate or get
 * PATCH /api/brainlifts/:slug/learning-stream/:itemId/quiz - Submit answers
 */

import { Router } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { isQuizzableContent, ensureItemTextContent } from '../utils/item-text-content';
import { generateQuiz } from '../services/quiz-generator';
import type { QuizAnswer } from '@shared/schema';

export const knowledgeCheckRouter = Router();

/** Exponential backoff delays for long poll (total ~15.5s) */
const POLL_DELAYS = [500, 1000, 2000, 3000, 4000, 5000];

/** Sleep utility for backoff delays */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * POST /api/brainlifts/:slug/learning-stream/:itemId/quiz
 * Generate a new quiz or return existing one.
 *
 * Flow:
 * 1. Existing quiz -> return immediately (instant, 99% case)
 * 2. Non-quizzable content -> return unavailable
 * 3. Null content -> return { status: 'generating' }
 * 4. Quizzable, pending job -> long poll with exponential backoff, then inline fallback
 * 5. Quizzable, no job -> inline generation immediately (backward compat)
 */
knowledgeCheckRouter.post(
  '/api/brainlifts/:slug/learning-stream/:itemId/quiz',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    // 1. Check for existing quiz first (instant return)
    const existingQuiz = await storage.getQuizByItemId(itemId, brainlift.id);
    if (existingQuiz) {
      return res.json({ quiz: existingQuiz });
    }

    // 2. Fetch item and verify it belongs to this brainlift
    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item || item.brainliftId !== brainlift.id) {
      throw new NotFoundError('Item not found');
    }

    // 3. Check content type
    const ec = item.extractedContent;
    if (!ec) {
      // Content not yet extracted (defensive; frontend guard should prevent this)
      return res.json({ status: 'generating' });
    }

    if (!isQuizzableContent(ec)) {
      return res.json({
        unavailable: true,
        reason: 'Quiz not available for this content type',
      });
    }

    // 4. Check for pending background quiz generation job
    const jobPending = await storage.hasQuizJobPending(itemId);

    if (jobPending) {
      // Long poll with exponential backoff
      for (const delay of POLL_DELAYS) {
        await sleep(delay);
        const quiz = await storage.getQuizByItemId(itemId, brainlift.id);
        if (quiz) {
          return res.json({ quiz });
        }
      }
      // Poll exhausted — fall through to inline generation
    }

    // 5. Inline generation fallback (backward compat for old items or poll timeout)
    const textContent = await ensureItemTextContent(item);
    if (!textContent) {
      return res.json({ status: 'generating' });
    }

    try {
      const generated = await generateQuiz({
        textContent,
        itemTopic: item.topic,
        itemType: item.type,
      });

      const quiz = await storage.createQuiz(itemId, brainlift.id, generated.questions);
      return res.json({ quiz });
    } catch (err: any) {
      // Handle race condition: another request created the quiz between our check and insert
      if (err?.cause?.code === '23505') {
        const quiz = await storage.getQuizByItemId(itemId, brainlift.id);
        if (quiz) {
          return res.json({ quiz });
        }
      }
      throw err;
    }
  })
);

/**
 * PATCH /api/brainlifts/:slug/learning-stream/:itemId/quiz
 * Submit answers for an existing quiz.
 */
knowledgeCheckRouter.patch(
  '/api/brainlifts/:slug/learning-stream/:itemId/quiz',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    // Fetch quiz
    const quiz = await storage.getQuizByItemId(itemId, brainlift.id);
    if (!quiz) {
      throw new NotFoundError('Quiz not found');
    }

    // Check if already completed
    if (quiz.completedAt) {
      throw new BadRequestError('Quiz already completed');
    }

    // Validate body
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      throw new BadRequestError('answers must be an array');
    }

    // Validate answer count
    if (answers.length !== quiz.questions.length) {
      throw new BadRequestError(
        `Expected ${quiz.questions.length} answers, got ${answers.length}`
      );
    }

    // Validate each answer
    for (const answer of answers) {
      const { questionIndex, selectedIndex } = answer;
      if (typeof questionIndex !== 'number' || questionIndex < 0 || questionIndex >= quiz.questions.length) {
        throw new BadRequestError('Invalid questionIndex');
      }
      if (typeof selectedIndex !== 'number' || selectedIndex < 0 || selectedIndex > 3) {
        throw new BadRequestError('Invalid selectedIndex');
      }
    }

    // Compute correctness and score
    const gradedAnswers: QuizAnswer[] = answers.map((a: { questionIndex: number; selectedIndex: number }) => ({
      questionIndex: a.questionIndex,
      selectedIndex: a.selectedIndex,
      correct: a.selectedIndex === quiz.questions[a.questionIndex].correctIndex,
    }));
    const score = gradedAnswers.filter((a) => a.correct).length;

    // Store results
    const updatedQuiz = await storage.submitQuizAnswers(quiz.id, brainlift.id, gradedAnswers, score);
    res.json({ quiz: updatedQuiz });
  })
);
