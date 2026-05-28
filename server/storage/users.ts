/**
 * Users storage module — per-user preferences.
 *
 * Currently exposes `seen_explainers` (JSONB array of explainer keys) read/write
 * for the DOK Rubric Explainer Modal. `markExplainerSeen` uses a single-SQL
 * idempotent append (no read-modify-write) to remain safe under concurrent
 * tabs / requests.
 *
 * See `features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md`.
 */

import { db, user, eq, sql } from './base';
import { NotFoundError } from '../middleware/error-handler';

export interface UserPreferences {
  seenExplainers: string[];
}

/**
 * Read the per-user preferences (currently only `seenExplainers`).
 * Throws NotFoundError if the user does not exist.
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({ seenExplainers: user.seenExplainers })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new NotFoundError('User not found');
  }

  // Drizzle types this as string[] via the schema's $type<string[]>(); guard
  // against any malformed legacy value by coercing to [].
  const seenExplainers = Array.isArray(row.seenExplainers) ? row.seenExplainers : [];
  return { seenExplainers };
}

/**
 * Idempotent append-if-absent of `key` to `user.seen_explainers`.
 *
 * Implemented as a single SQL statement (no read-modify-write) so that
 * concurrent calls from multiple tabs do not race. Returns the full updated
 * array. Throws NotFoundError if the user does not exist.
 */
export async function markExplainerSeen(
  userId: string,
  key: string,
): Promise<string[]> {
  const result = await db.execute<{ seen_explainers: string[] }>(sql`
    UPDATE "user"
    SET seen_explainers =
      CASE
        WHEN seen_explainers @> to_jsonb(${key}::text) THEN seen_explainers
        ELSE seen_explainers || to_jsonb(${key}::text)
      END
    WHERE id = ${userId}
    RETURNING seen_explainers
  `);

  // Match the project convention (see server/storage/chat.ts): drizzle's
  // execute() returns a result with `.rows`, but some drivers return an array
  // directly — guard both shapes.
  const row =
    result.rows?.[0] ??
    (result as unknown as Array<{ seen_explainers: string[] }>)[0];

  if (!row) {
    throw new NotFoundError('User not found');
  }

  const seenExplainers = Array.isArray(row.seen_explainers)
    ? row.seen_explainers
    : [];
  return seenExplainers;
}
