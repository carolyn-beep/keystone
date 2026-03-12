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
import { getItemTextContent } from '../utils/item-text-content';
import { generateQuiz } from '../services/quiz-generator';
import type { QuizAnswer } from '@shared/schema';

export const knowledgeCheckRouter = Router();

/**
 * POST /api/brainlifts/:slug/learning-stream/:itemId/quiz
 * Generate a new quiz or return existing one.
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

    // Fetch item and verify it belongs to this brainlift
    const item = await storage.getLearningStreamItemById(itemId);
    if (!item || item.brainliftId !== brainlift.id) {
      throw new NotFoundError('Item not found');
    }

    // Check for existing quiz
    const existingQuiz = await storage.getQuizByItemId(itemId, brainlift.id);
    if (existingQuiz) {
      return res.json({ quiz: existingQuiz });
    }

    // Check text content availability
    const textContent = getItemTextContent(item);
    if (!textContent) {
      return res.json({
        unavailable: true,
        reason: 'Quiz not available for this content type',
      });
    }

    // Generate quiz
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
