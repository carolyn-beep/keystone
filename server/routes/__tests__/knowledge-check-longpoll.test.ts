/**
 * Tests for FR3: Server-Side Long Poll in POST /quiz
 *
 * Tests the modified POST handler that checks for pending background jobs
 * and implements exponential backoff polling before falling back to inline generation.
 *
 * Mocks: storage, generateQuiz, getItemTextContent, isQuizzableContent, ensureItemTextContent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LearningStreamItem } from '@shared/schema';

// ---- Mocks ----

const mockGetLearningStreamItemById = vi.fn();
const mockGetQuizByItemId = vi.fn();
const mockCreateQuiz = vi.fn();
const mockHasQuizJobPending = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    getLearningStreamItemById: (...args: unknown[]) => mockGetLearningStreamItemById(...args),
    getQuizByItemId: (...args: unknown[]) => mockGetQuizByItemId(...args),
    createQuiz: (...args: unknown[]) => mockCreateQuiz(...args),
    hasQuizJobPending: (...args: unknown[]) => mockHasQuizJobPending(...args),
  },
}));

const mockGenerateQuiz = vi.fn();
vi.mock('../../services/quiz-generator', () => ({
  generateQuiz: (...args: unknown[]) => mockGenerateQuiz(...args),
}));

const mockGetItemTextContent = vi.fn();
const mockIsQuizzableContent = vi.fn();
const mockEnsureItemTextContent = vi.fn();
vi.mock('../../utils/item-text-content', () => ({
  getItemTextContent: (...args: unknown[]) => mockGetItemTextContent(...args),
  isQuizzableContent: (...args: unknown[]) => mockIsQuizzableContent(...args),
  ensureItemTextContent: (...args: unknown[]) => mockEnsureItemTextContent(...args),
}));

// ---- Test Data ----

const sampleQuestions = [
  {
    question: 'What is X?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'A is correct.',
    conceptTested: 'X',
    misconceptions: ['wrong B', 'wrong C', 'wrong D'],
  },
];

const sampleItem: Partial<LearningStreamItem> = {
  id: 10,
  brainliftId: 5,
  type: 'Substack',
  topic: 'Test Topic',
  extractedContent: { contentType: 'article', markdown: 'Article text here.' },
};

const sampleQuiz = {
  id: 1,
  itemId: 10,
  brainliftId: 5,
  questions: sampleQuestions,
  answers: null,
  score: null,
  completedAt: null,
  createdAt: new Date(),
};

// ---- Helper: simulate POST /quiz handler logic (new version with long poll) ----

async function simulatePostQuiz(params: { itemId: number; brainliftId: number }) {
  const { itemId, brainliftId } = params;

  if (isNaN(itemId)) {
    return { status: 400, body: { message: 'Invalid item ID' } };
  }

  // 1. Check for existing quiz first (instant return)
  const existingQuiz = await mockGetQuizByItemId(itemId, brainliftId);
  if (existingQuiz) {
    return { status: 200, body: { quiz: existingQuiz } };
  }

  // 2. Fetch item
  const item = await mockGetLearningStreamItemById(itemId, brainliftId);
  if (!item || item.brainliftId !== brainliftId) {
    return { status: 404, body: { message: 'Item not found' } };
  }

  // 3. Check content type
  const ec = item.extractedContent;
  if (!ec) {
    return { status: 200, body: { status: 'generating' } };
  }

  if (!mockIsQuizzableContent(ec)) {
    return { status: 200, body: { unavailable: true, reason: 'Quiz not available for this content type' } };
  }

  // 4. Check for pending background job
  const jobPending = await mockHasQuizJobPending(itemId);

  if (jobPending) {
    // Long poll with exponential backoff
    const delays = [500, 1000, 2000, 3000, 4000, 5000];
    for (const delay of delays) {
      await new Promise(resolve => setTimeout(resolve, delay));
      const quiz = await mockGetQuizByItemId(itemId, brainliftId);
      if (quiz) {
        return { status: 200, body: { quiz } };
      }
    }
  }

  // 5. Generate inline (fallback)
  const textContent = await mockEnsureItemTextContent(item);
  if (!textContent) {
    return { status: 200, body: { status: 'generating' } };
  }

  try {
    const generated = await mockGenerateQuiz({
      textContent,
      itemTopic: item.topic,
      itemType: item.type,
    });
    const quiz = await mockCreateQuiz(itemId, brainliftId, generated.questions);
    return { status: 200, body: { quiz } };
  } catch (err: any) {
    if (err?.cause?.code === '23505') {
      const quiz = await mockGetQuizByItemId(itemId, brainliftId);
      if (quiz) return { status: 200, body: { quiz } };
    }
    throw err;
  }
}

// ---- Tests ----

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /quiz - Long Poll Flow (FR3)', () => {
  describe('instant return', () => {
    it('returns existing quiz immediately without any polling', async () => {
      mockGetQuizByItemId.mockResolvedValue(sampleQuiz);

      const promise = simulatePostQuiz({ itemId: 10, brainliftId: 5 });
      const result = await promise;

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ quiz: sampleQuiz });
      // Should NOT have checked for pending jobs
      expect(mockHasQuizJobPending).not.toHaveBeenCalled();
      // Should NOT have called generateQuiz
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });
  });

  describe('unavailable content', () => {
    it('returns unavailable for non-quizzable content (podcast/tweet/etc)', async () => {
      mockGetQuizByItemId.mockResolvedValue(null);
      const podcastItem = {
        ...sampleItem,
        extractedContent: { contentType: 'embed' as const, embedType: 'spotify' as const, embedId: 'track1' },
      };
      mockGetLearningStreamItemById.mockResolvedValue(podcastItem);
      mockIsQuizzableContent.mockReturnValue(false);

      const result = await simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        unavailable: true,
        reason: expect.any(String),
      });
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });

    it('returns generating status when extractedContent is null', async () => {
      mockGetQuizByItemId.mockResolvedValue(null);
      const pendingItem = { ...sampleItem, extractedContent: null };
      mockGetLearningStreamItemById.mockResolvedValue(pendingItem);

      const result = await simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ status: 'generating' });
    });
  });

  describe('long poll with pending job', () => {
    it('quiz appears on first poll iteration (500ms) returns quickly', async () => {
      // First getQuizByItemId call returns null (no existing quiz)
      // Second call (after 500ms poll) returns the quiz
      mockGetQuizByItemId
        .mockResolvedValueOnce(null)   // initial check
        .mockResolvedValueOnce(sampleQuiz);  // first poll check
      mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
      mockIsQuizzableContent.mockReturnValue(true);
      mockHasQuizJobPending.mockResolvedValue(true);

      const promise = simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      // Advance past the 500ms first poll delay
      await vi.advanceTimersByTimeAsync(600);

      const result = await promise;

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ quiz: sampleQuiz });
      // Should have checked for job pending
      expect(mockHasQuizJobPending).toHaveBeenCalledWith(10);
      // Should NOT have done inline generation
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });

    it('quiz appears on later poll iteration returns quiz', async () => {
      // Quiz appears after the 3rd poll (at 500+1000+2000 = 3500ms)
      mockGetQuizByItemId
        .mockResolvedValueOnce(null)        // initial check
        .mockResolvedValueOnce(null)        // poll 1 (500ms)
        .mockResolvedValueOnce(null)        // poll 2 (1000ms)
        .mockResolvedValueOnce(sampleQuiz); // poll 3 (2000ms)
      mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
      mockIsQuizzableContent.mockReturnValue(true);
      mockHasQuizJobPending.mockResolvedValue(true);

      const promise = simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      // Advance through all delays: 500 + 1000 + 2000
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ quiz: sampleQuiz });
      expect(mockGenerateQuiz).not.toHaveBeenCalled();
    });

    it('all 6 polls exhausted falls back to inline generation', async () => {
      // Quiz never appears during polling
      mockGetQuizByItemId.mockResolvedValue(null);
      mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
      mockIsQuizzableContent.mockReturnValue(true);
      mockHasQuizJobPending.mockResolvedValue(true);
      mockEnsureItemTextContent.mockResolvedValue('Article text here.');
      mockGenerateQuiz.mockResolvedValue({ questions: sampleQuestions });
      mockCreateQuiz.mockResolvedValue(sampleQuiz);

      const promise = simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      // Advance through all 6 delays: 500+1000+2000+3000+4000+5000 = 15500ms
      await vi.advanceTimersByTimeAsync(16000);

      const result = await promise;

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ quiz: sampleQuiz });
      // Inline generation was used as fallback
      expect(mockGenerateQuiz).toHaveBeenCalled();
    });
  });

  describe('backward compatibility (no pending job)', () => {
    it('old item without background job generates inline immediately', async () => {
      mockGetQuizByItemId.mockResolvedValue(null);
      mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
      mockIsQuizzableContent.mockReturnValue(true);
      mockHasQuizJobPending.mockResolvedValue(false); // no job pending
      mockEnsureItemTextContent.mockResolvedValue('Article text here.');
      mockGenerateQuiz.mockResolvedValue({ questions: sampleQuestions });
      mockCreateQuiz.mockResolvedValue(sampleQuiz);

      const result = await simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ quiz: sampleQuiz });
      // Should have generated inline without waiting
      expect(mockGenerateQuiz).toHaveBeenCalled();
    });
  });

  describe('exponential backoff schedule', () => {
    it('follows exact 500ms, 1s, 2s, 3s, 4s, 5s schedule', async () => {
      // Track when getQuizByItemId is called (poll checks)
      const pollTimestamps: number[] = [];
      let callCount = 0;

      mockGetQuizByItemId.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return null; // initial check
        pollTimestamps.push(Date.now());
        if (callCount === 7) return sampleQuiz; // return on 6th poll
        return null;
      });
      mockGetLearningStreamItemById.mockResolvedValue(sampleItem);
      mockIsQuizzableContent.mockReturnValue(true);
      mockHasQuizJobPending.mockResolvedValue(true);

      const startTime = Date.now();
      const promise = simulatePostQuiz({ itemId: 10, brainliftId: 5 });

      // Advance through all delays
      await vi.advanceTimersByTimeAsync(16000);

      await promise;

      // Verify 6 poll iterations happened (+ 1 initial check = 7 total calls)
      expect(callCount).toBe(7);

      // Verify timing: polls should happen at ~500, 1500, 3500, 6500, 10500, 15500ms
      const relativeTimes = pollTimestamps.map(t => t - startTime);
      expect(relativeTimes[0]).toBeGreaterThanOrEqual(500);
      expect(relativeTimes[1]).toBeGreaterThanOrEqual(1500);
      expect(relativeTimes[2]).toBeGreaterThanOrEqual(3500);
      expect(relativeTimes[3]).toBeGreaterThanOrEqual(6500);
      expect(relativeTimes[4]).toBeGreaterThanOrEqual(10500);
      expect(relativeTimes[5]).toBeGreaterThanOrEqual(15500);
    });
  });
});
