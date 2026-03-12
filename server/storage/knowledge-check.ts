/**
 * Knowledge Check quiz storage functions.
 *
 * CRUD operations for knowledge_check_quizzes table.
 * All queries include brainliftId for IDOR safety.
 */

import {
  db, eq, and,
  knowledgeCheckQuizzes,
  type KnowledgeCheckQuiz, type QuizQuestion, type QuizAnswer,
} from './base';

/**
 * Get a quiz by learning stream item ID and brainlift ID.
 * Returns null if no quiz exists or brainliftId doesn't match (IDOR-safe).
 */
export async function getQuizByItemId(
  itemId: number,
  brainliftId: number
): Promise<KnowledgeCheckQuiz | null> {
  const rows = await db
    .select()
    .from(knowledgeCheckQuizzes)
    .where(
      and(
        eq(knowledgeCheckQuizzes.itemId, itemId),
        eq(knowledgeCheckQuizzes.brainliftId, brainliftId)
      )
    );
  return rows[0] ?? null;
}

/**
 * Create a new quiz for a learning stream item.
 * Throws on unique constraint violation (duplicate quiz for same item).
 */
export async function createQuiz(
  itemId: number,
  brainliftId: number,
  questions: QuizQuestion[]
): Promise<KnowledgeCheckQuiz> {
  const [quiz] = await db
    .insert(knowledgeCheckQuizzes)
    .values({
      itemId,
      brainliftId,
      questions,
    })
    .returning();
  return quiz;
}

/**
 * Submit quiz answers, setting score and completedAt.
 * Returns null if quizId + brainliftId don't match (IDOR-safe).
 */
export async function submitQuizAnswers(
  quizId: number,
  brainliftId: number,
  answers: QuizAnswer[],
  score: number
): Promise<KnowledgeCheckQuiz | null> {
  const rows = await db
    .update(knowledgeCheckQuizzes)
    .set({
      answers,
      score,
      completedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeCheckQuizzes.id, quizId),
        eq(knowledgeCheckQuizzes.brainliftId, brainliftId)
      )
    )
    .returning();
  return rows[0] ?? null;
}
