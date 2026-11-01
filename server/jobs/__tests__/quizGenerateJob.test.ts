/**
 * Tests for FR1: Background Quiz Generation Job
 *
 * Validates quizGenerateJob generates and stores quizzes,
 * skips gracefully for various conditions, and handles errors.
 *
 * Mocks: storage, ensureItemTextContent, generateQuiz
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../storage', () => ({
  storage: {
    getLearningStreamItemById: vi.fn(),
    getQuizByItemId: vi.fn(),
    createQuiz: vi.fn(),
  },
}));

vi.mock('../../utils/item-text-content', () => ({
  ensureItemTextContent: vi.fn(),
}));

vi.mock('../../services/quiz-generator', () => ({
  generateQuiz: vi.fn(),
}));

import { storage } from '../../storage';
import { ensureItemTextContent } from '../../utils/item-text-content';
import { generateQuiz } from '../../services/quiz-generator';
import { quizGenerateJob } from '../quizGenerateJob';
import type { JobHelpers } from 'graphile-worker';

const mockGetItem = vi.mocked(storage.getLearningStreamItemById);
const mockGetQuiz = vi.mocked(storage.getQuizByItemId);
const mockCreateQuiz = vi.mocked(storage.createQuiz);
const mockEnsureText = vi.mocked(ensureItemTextContent);
const mockGenerateQuiz = vi.mocked(generateQuiz);

const mockHelpers = {
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  job: { id: 'test-job-id', attempts: 1, max_attempts: 1 },
} as unknown as JobHelpers;

const PAYLOAD = { itemId: 42, brainliftId: 7 };

const ITEM_FIXTURE = {
  id: 42,
  brainliftId: 7,
  type: 'Substack',
  topic: 'Test Topic',
  author: 'Author',
  time: '5 min',
  facts: 'Facts',
  url: 'https://example.com/article',
  status: 'pending' as const,
  source: 'swarm-research' as const,
  quality: null,
  alignment: null,
  relevanceScore: null,
  aiRationale: null,
  extractedContent: { contentType: 'article' as const, markdown: '# Article content here' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const QUIZ_QUESTIONS = [
  {
    question: 'What is X?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'A is correct.',
    conceptTested: 'X',
    misconceptions: ['wrong B', 'wrong C', 'wrong D'],
  },
];

const QUIZ_FIXTURE = {
  id: 1,
  itemId: 42,
  brainliftId: 7,
  questions: QUIZ_QUESTIONS,
  answers: null,
  score: null,
  completedAt: null,
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('quizGenerateJob', () => {
  describe('happy path', () => {
    it('generates and stores quiz for article item', async () => {
      mockGetItem.mockResolvedValue(ITEM_FIXTURE);
      mockGetQuiz.mockResolvedValue(null);
      mockEnsureText.mockResolvedValue('# Article content here');
      mockGenerateQuiz.mockResolvedValue({ questions: QUIZ_QUESTIONS });
      mockCreateQuiz.mockResolvedValue(QUIZ_FIXTURE);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(true);
      expect(result.questionCount).toBe(1);
      expect(mockGenerateQuiz).toHaveBeenCalledWith({
        textContent: '# Article content here',
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });
      expect(mockCreateQuiz).toHaveBeenCalledWith(42, 7, QUIZ_QUESTIONS);
    });

    it('generates quiz for YouTube item via ensureItemTextContent', async () => {
      const youtubeItem = {
        ...ITEM_FIXTURE,
        type: 'Video',
        extractedContent: { contentType: 'embed' as const, embedType: 'youtube' as const, embedId: 'abc123' },
      };
      mockGetItem.mockResolvedValue(youtubeItem);
      mockGetQuiz.mockResolvedValue(null);
      mockEnsureText.mockResolvedValue('This is a transcript...');
      mockGenerateQuiz.mockResolvedValue({ questions: QUIZ_QUESTIONS });
      mockCreateQuiz.mockResolvedValue(QUIZ_FIXTURE);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(true);
      expect(mockEnsureText).toHaveBeenCalledWith(youtubeItem);
      expect(mockGenerateQuiz).toHaveBeenCalled();
    });
  });

  describe('skip cases', () => {
    it('skips when quiz already exists', async () => {
      mockGetItem.mockResolvedValue(ITEM_FIXTURE);
      mockGetQuiz.mockResolvedValue(QUIZ_FIXTURE);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe('already-exists');
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });

    it('returns failure when item not found', async () => {
      mockGetItem.mockResolvedValue(null);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(false);
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });

    it('skips when ensureItemTextContent returns null', async () => {
      mockGetItem.mockResolvedValue(ITEM_FIXTURE);
      mockGetQuiz.mockResolvedValue(null);
      mockEnsureText.mockResolvedValue(null);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe('no-text-content');
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });
  });

  describe('error cases', () => {
    it('logs AI error and returns failure without throwing', async () => {
      mockGetItem.mockResolvedValue(ITEM_FIXTURE);
      mockGetQuiz.mockResolvedValue(null);
      mockEnsureText.mockResolvedValue('Some text');
      mockGenerateQuiz.mockRejectedValue(new Error('AI timeout'));

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI timeout');
      expect(mockHelpers.logger.error).toHaveBeenCalled();
    });

    it('catches unique constraint race (23505) and returns success', async () => {
      mockGetItem.mockResolvedValue(ITEM_FIXTURE);
      mockGetQuiz.mockResolvedValue(null);
      mockEnsureText.mockResolvedValue('Some text');
      mockGenerateQuiz.mockResolvedValue({ questions: QUIZ_QUESTIONS });

      const drizzleError = new Error('unique violation');
      (drizzleError as any).cause = { code: '23505' };
      mockCreateQuiz.mockRejectedValue(drizzleError);

      const result = await quizGenerateJob(PAYLOAD, mockHelpers);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe('already-exists');
    });
  });
});
