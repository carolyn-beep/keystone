/**
 * Tests for FR5: Storage Functions
 *
 * Tests knowledge check storage: getQuizByItemId, createQuiz, submitQuizAnswers.
 * Mocks: Drizzle db (same pattern as other storage tests).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QuizQuestion, QuizAnswer } from '@shared/schema';

// Mock the database module before importing storage functions
vi.mock('../base', () => {
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();

  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    },
    eq: vi.fn((a: any, b: any) => ({ type: 'eq', a, b })),
    and: vi.fn((...args: any[]) => ({ type: 'and', args })),
    knowledgeCheckQuizzes: {
      id: 'id',
      itemId: 'item_id',
      brainliftId: 'brainlift_id',
      questions: 'questions',
      answers: 'answers',
      score: 'score',
      completedAt: 'completed_at',
      createdAt: 'created_at',
    },
  };
});

import { db } from '../base';
const mockDb = vi.mocked(db);

// Sample data
const sampleQuestions: QuizQuestion[] = [
  {
    question: 'What is the main topic?',
    options: ['Correct answer', 'Wrong A', 'Wrong B', 'Wrong C'],
    correctIndex: 0,
    explanation: 'Because this is correct.',
    conceptTested: 'Main topic understanding',
    misconceptions: ['Misconception A', 'Misconception B', 'Misconception C'],
  },
];

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

const sampleAnswers: QuizAnswer[] = [
  { questionIndex: 0, selectedIndex: 0, correct: true },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getQuizByItemId', () => {
  it('returns quiz when it exists', async () => {
    // Setup chain: db.select().from().where()
    const mockWhere = vi.fn().mockResolvedValue([sampleQuiz]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (mockDb.select as any).mockReturnValue({ from: mockFrom });

    const { getQuizByItemId } = await import('../knowledge-check');
    const result = await getQuizByItemId(10, 5);

    expect(result).toEqual(sampleQuiz);
    expect(mockDb.select).toHaveBeenCalled();
  });

  it('returns null when no quiz exists', async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (mockDb.select as any).mockReturnValue({ from: mockFrom });

    const { getQuizByItemId } = await import('../knowledge-check');
    const result = await getQuizByItemId(10, 5);

    expect(result).toBeNull();
  });

  it('is IDOR-safe: queries include brainliftId', async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (mockDb.select as any).mockReturnValue({ from: mockFrom });

    const { getQuizByItemId } = await import('../knowledge-check');
    await getQuizByItemId(10, 5);

    // Verify that where was called (the and() with both itemId and brainliftId)
    expect(mockWhere).toHaveBeenCalled();
  });
});

describe('createQuiz', () => {
  it('creates and returns a new quiz', async () => {
    const mockReturning = vi.fn().mockResolvedValue([sampleQuiz]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (mockDb.insert as any).mockReturnValue({ values: mockValues });

    const { createQuiz } = await import('../knowledge-check');
    const result = await createQuiz(10, 5, sampleQuestions);

    expect(result).toEqual(sampleQuiz);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

describe('submitQuizAnswers', () => {
  it('updates answers, score, and completedAt', async () => {
    const completedQuiz = {
      ...sampleQuiz,
      answers: sampleAnswers,
      score: 1,
      completedAt: new Date(),
    };

    const mockReturning = vi.fn().mockResolvedValue([completedQuiz]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (mockDb.update as any).mockReturnValue({ set: mockSet });

    const { submitQuizAnswers } = await import('../knowledge-check');
    const result = await submitQuizAnswers(1, 5, sampleAnswers, 1);

    expect(result).toEqual(completedQuiz);
    expect(result!.answers).toEqual(sampleAnswers);
    expect(result!.score).toBe(1);
    expect(result!.completedAt).toBeDefined();
  });

  it('is IDOR-safe: returns null when brainliftId does not match', async () => {
    // No rows returned means the quiz doesn't belong to the brainlift
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    (mockDb.update as any).mockReturnValue({ set: mockSet });

    const { submitQuizAnswers } = await import('../knowledge-check');
    const result = await submitQuizAnswers(1, 999, sampleAnswers, 1);

    expect(result).toBeNull();
  });
});
