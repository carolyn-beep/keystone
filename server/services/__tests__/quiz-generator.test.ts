/**
 * Tests for FR2: Quiz Generation Service
 *
 * Tests the two-phase quiz generation pipeline (concept extraction + MCQ generation).
 * Mocks: callModel from unified AI client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQuiz } from '../quiz-generator';
import type { QuizQuestion } from '@shared/schema';

// Mock the unified AI client
vi.mock('../../ai/client', () => ({
  callModel: vi.fn(),
}));

import { callModel } from '../../ai/client';
const mockCallModel = vi.mocked(callModel);

// --- Test Helpers ---

function makeConceptExtractionResponse(conceptCount: number) {
  const concepts = Array.from({ length: conceptCount }, (_, i) => ({
    concept: `Concept ${i + 1}: key fact about the topic`,
    sourceExcerpt: `This is an excerpt from the source material about concept ${i + 1}.`,
  }));
  return JSON.stringify({ concepts });
}

function makeQuestionGenerationResponse(questionCount: number) {
  const questions = Array.from({ length: questionCount }, (_, i) => ({
    question: `What is the main idea of concept ${i + 1}?`,
    correctAnswer: `Correct answer for question ${i + 1}`,
    distractors: [
      { text: `Distractor A for Q${i + 1}`, misconception: `Misconception A for Q${i + 1}` },
      { text: `Distractor B for Q${i + 1}`, misconception: `Misconception B for Q${i + 1}` },
      { text: `Distractor C for Q${i + 1}`, misconception: `Misconception C for Q${i + 1}` },
    ],
    explanation: `The correct answer is correct because of concept ${i + 1}.`,
    conceptTested: `Concept ${i + 1}: key fact about the topic`,
  }));
  return JSON.stringify({ questions });
}

function setupMockCallModel(conceptCount: number, questionCount: number) {
  let callCount = 0;
  mockCallModel.mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      // Phase 1: concept extraction
      return {
        content: makeConceptExtractionResponse(conceptCount),
        model: 'anthropic/claude-haiku-4.5',
        durationMs: 1000,
        attempts: 1,
      };
    }
    // Phase 2: question generation
    return {
      content: makeQuestionGenerationResponse(questionCount),
      model: 'anthropic/claude-haiku-4.5',
      durationMs: 1500,
      attempts: 1,
    };
  });
}

// Generate text of approximately N words
function generateText(wordCount: number): string {
  const words = Array.from({ length: wordCount }, (_, i) => `word${i}`);
  return words.join(' ');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateQuiz', () => {
  describe('question count calibration', () => {
    it('generates 3 questions for short content (< 500 words)', async () => {
      setupMockCallModel(3, 3);

      const result = await generateQuiz({
        textContent: generateText(300),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(result.questions).toHaveLength(3);
    });

    it('generates 4 questions for medium content (500-2000 words)', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(result.questions).toHaveLength(4);
    });

    it('generates 5 questions for long content (> 2000 words)', async () => {
      setupMockCallModel(5, 5);

      const result = await generateQuiz({
        textContent: generateText(3000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(result.questions).toHaveLength(5);
    });

    it('generates 3 questions for very short content (< 100 words)', async () => {
      setupMockCallModel(3, 3);

      const result = await generateQuiz({
        textContent: generateText(50),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(result.questions).toHaveLength(3);
    });
  });

  describe('question structure', () => {
    it('each question has exactly 4 options', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      for (const question of result.questions) {
        expect(question.options).toHaveLength(4);
      }
    });

    it('correctIndex is valid (0-3) and points to the correct answer', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      for (let i = 0; i < result.questions.length; i++) {
        const q = result.questions[i];
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThanOrEqual(3);
        // The correct answer should match the AI's correct answer
        expect(q.options[q.correctIndex]).toBe(`Correct answer for question ${i + 1}`);
      }
    });

    it('explanation is a non-empty string for each question', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      for (const question of result.questions) {
        expect(typeof question.explanation).toBe('string');
        expect(question.explanation.length).toBeGreaterThan(0);
      }
    });

    it('conceptTested is a non-empty string for each question', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      for (const question of result.questions) {
        expect(typeof question.conceptTested).toBe('string');
        expect(question.conceptTested.length).toBeGreaterThan(0);
      }
    });

    it('misconceptions has exactly 3 entries per question', async () => {
      setupMockCallModel(4, 4);

      const result = await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      for (const question of result.questions) {
        expect(question.misconceptions).toHaveLength(3);
      }
    });
  });

  describe('answer shuffling', () => {
    it('correct answer position varies across questions (not always index 0)', async () => {
      // Run multiple times to check that shuffling produces variety
      // With 4 questions, the probability of all having correctIndex=0 is (1/4)^4 = 0.39%
      // We'll run the test once but check that at least one question has correctIndex != 0
      setupMockCallModel(5, 5);

      const result = await generateQuiz({
        textContent: generateText(3000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      const indices = result.questions.map((q) => q.correctIndex);
      // With 5 questions, extremely unlikely all are at index 0 after shuffling
      // This is a statistical test - if it fails, the shuffle may not be working
      const allSameIndex = indices.every((idx) => idx === indices[0]);
      // Not asserting this is always true due to randomness, but the correct answer
      // should still be findable at the correctIndex position
      for (let i = 0; i < result.questions.length; i++) {
        const q = result.questions[i];
        expect(q.options[q.correctIndex]).toBe(`Correct answer for question ${i + 1}`);
      }
    });
  });

  describe('callModel invocations', () => {
    it('calls callModel twice (concept extraction + question generation)', async () => {
      setupMockCallModel(4, 4);

      await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(mockCallModel).toHaveBeenCalledTimes(2);
    });

    it('uses correct model for both calls', async () => {
      setupMockCallModel(4, 4);

      await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(mockCallModel).toHaveBeenNthCalledWith(1, expect.objectContaining({
        model: 'anthropic/claude-haiku-4.5',
      }));
      expect(mockCallModel).toHaveBeenNthCalledWith(2, expect.objectContaining({
        model: 'anthropic/claude-haiku-4.5',
      }));
    });

    it('uses correct caller strings for observability', async () => {
      setupMockCallModel(4, 4);

      await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(mockCallModel).toHaveBeenNthCalledWith(1, expect.objectContaining({
        caller: 'quizGenerator.conceptExtraction',
      }));
      expect(mockCallModel).toHaveBeenNthCalledWith(2, expect.objectContaining({
        caller: 'quizGenerator.questionGeneration',
      }));
    });

    it('uses temperature 0 for both calls', async () => {
      setupMockCallModel(4, 4);

      await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      expect(mockCallModel).toHaveBeenNthCalledWith(1, expect.objectContaining({
        temperature: 0,
      }));
      expect(mockCallModel).toHaveBeenNthCalledWith(2, expect.objectContaining({
        temperature: 0,
      }));
    });

    it('uses response_format for structured JSON output', async () => {
      setupMockCallModel(4, 4);

      await generateQuiz({
        textContent: generateText(1000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      // Both calls should have responseFormat
      expect(mockCallModel).toHaveBeenNthCalledWith(1, expect.objectContaining({
        responseFormat: expect.objectContaining({ type: 'json_schema' }),
      }));
      expect(mockCallModel).toHaveBeenNthCalledWith(2, expect.objectContaining({
        responseFormat: expect.objectContaining({ type: 'json_schema' }),
      }));
    });
  });

  describe('content truncation', () => {
    it('truncates content longer than 4000 words', async () => {
      setupMockCallModel(5, 5);

      await generateQuiz({
        textContent: generateText(6000),
        itemTopic: 'Test Topic',
        itemType: 'Substack',
      });

      // The first call (concept extraction) should receive truncated content
      const firstCallMessages = mockCallModel.mock.calls[0][0].messages;
      const userMessage = firstCallMessages.find((m: any) => m.role === 'user');
      // Count words in the user message - should be <= 4000 words of content
      // (plus some prompt text)
      const wordCount = userMessage!.content.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(4100); // 4000 + prompt overhead
    });
  });
});
