import {
  db, eq, and, builderExperts,
  type BuilderExpert, type InsertBuilderExpert,
} from './base';
import { sql } from 'drizzle-orm';

/** Input shape for batch-inserting suggested experts. */
export interface SuggestExpertInput {
  name: string;
  who: string;
  focus?: string | null;
  why?: string | null;
  where: string;
}

/**
 * Return all builder experts for a brainlift, ordered by createdAt ascending.
 */
export async function getBuilderExpertsByBrainliftId(brainliftId: number): Promise<BuilderExpert[]> {
  return db
    .select()
    .from(builderExperts)
    .where(eq(builderExperts.brainliftId, brainliftId))
    .orderBy(builderExperts.createdAt);
}

/**
 * Insert a single builder expert. Caller sets origin and status.
 */
export async function createBuilderExpert(data: InsertBuilderExpert): Promise<BuilderExpert> {
  const [row] = await db
    .insert(builderExperts)
    .values(data as typeof builderExperts.$inferInsert)
    .returning();
  return row;
}

/**
 * Batch-insert suggested experts with origin='suggested', status='pending'.
 */
export async function insertSuggestedExperts(
  brainliftId: number,
  experts: SuggestExpertInput[],
): Promise<BuilderExpert[]> {
  if (experts.length === 0) return [];

  const values: (typeof builderExperts.$inferInsert)[] = experts.map((e) => ({
    brainliftId,
    name: e.name,
    who: e.who,
    focus: e.focus ?? null,
    why: e.why ?? null,
    where: e.where,
    origin: 'suggested' as const,
    status: 'pending' as const,
  }));

  return db.insert(builderExperts).values(values).returning();
}

/**
 * IDOR-safe update: includes brainliftId in WHERE clause.
 * Returns updated row or null if not found/unauthorized.
 */
export async function updateBuilderExpertForBrainlift(
  expertId: number,
  brainliftId: number,
  fields: Partial<{
    name: string;
    who: string;
    focus: string | null;
    why: string | null;
    where: string;
    status: 'pending' | 'saved' | 'dismissed';
  }>,
): Promise<BuilderExpert | null> {
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.who !== undefined) updates.who = fields.who;
  if (fields.focus !== undefined) updates.focus = fields.focus;
  if (fields.why !== undefined) updates.why = fields.why;
  if (fields.where !== undefined) updates.where = fields.where;
  if (fields.status !== undefined) updates.status = fields.status;

  if (Object.keys(updates).length === 0) return null;

  const rows = await db
    .update(builderExperts)
    .set(updates)
    .where(and(eq(builderExperts.id, expertId), eq(builderExperts.brainliftId, brainliftId)))
    .returning();

  return rows[0] ?? null;
}

/**
 * IDOR-safe dismiss: sets status='dismissed' for a pending suggested expert.
 */
export async function dismissBuilderExpertForBrainlift(
  expertId: number,
  brainliftId: number,
): Promise<boolean> {
  const rows = await db
    .update(builderExperts)
    .set({ status: 'dismissed' as const })
    .where(and(eq(builderExperts.id, expertId), eq(builderExperts.brainliftId, brainliftId)))
    .returning({ id: builderExperts.id });

  return rows.length > 0;
}

/**
 * IDOR-safe delete: deletes a builder expert.
 */
export async function deleteBuilderExpertForBrainlift(
  expertId: number,
  brainliftId: number,
): Promise<boolean> {
  const rows = await db
    .delete(builderExperts)
    .where(and(eq(builderExperts.id, expertId), eq(builderExperts.brainliftId, brainliftId)))
    .returning({ id: builderExperts.id });

  return rows.length > 0;
}

/**
 * Count experts with status='saved' using COUNT(*) in the database.
 */
export async function countSavedBuilderExperts(brainliftId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(builderExperts)
    .where(and(eq(builderExperts.brainliftId, brainliftId), eq(builderExperts.status, 'saved')));

  return row?.count ?? 0;
}

/**
 * Delete all experts with origin='suggested' AND status='pending'.
 * Returns count of deleted rows.
 */
export async function clearPendingSuggestions(brainliftId: number): Promise<number> {
  const rows = await db
    .delete(builderExperts)
    .where(
      and(
        eq(builderExperts.brainliftId, brainliftId),
        eq(builderExperts.origin, 'suggested'),
        eq(builderExperts.status, 'pending'),
      ),
    )
    .returning({ id: builderExperts.id });

  return rows.length;
}
