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
import { pool } from '../db';

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

/**
 * Check if there's a pending or running quiz generation job for this item.
 * Queries graphile_worker's jobs table directly (follows hasResearchJobPending pattern).
 */
export async function hasQuizJobPending(itemId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM graphile_worker._private_jobs j
     JOIN graphile_worker._private_tasks t ON j.task_id = t.id
     WHERE t.identifier = 'learning-stream:generate-quiz'
       AND j.payload->>'itemId' = $1::text
     LIMIT 1`,
    [itemId.toString()]
  );

  return result.rows.length > 0;
}
