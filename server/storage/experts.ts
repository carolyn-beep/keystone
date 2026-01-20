import {
  db, eq, desc, and,
  experts,
  type Expert, type InsertExpert
} from './base';

export async function getExpertsByBrainliftId(brainliftId: number): Promise<Expert[]> {
  return await db.select().from(experts)
    .where(eq(experts.brainliftId, brainliftId))
    .orderBy(desc(experts.rankScore));
}

export async function saveExperts(brainliftId: number, expertsData: InsertExpert[]): Promise<Expert[]> {
  // Use transaction to ensure atomicity - if insert fails, delete is rolled back
  return await db.transaction(async (tx) => {
    await tx.delete(experts).where(eq(experts.brainliftId, brainliftId));

    if (expertsData.length === 0) return [];

    const inserted = await tx.insert(experts).values(expertsData).returning();
    return inserted.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  });
}

export async function getFollowedExperts(brainliftId: number): Promise<Expert[]> {
  return await db.select().from(experts)
    .where(and(
      eq(experts.brainliftId, brainliftId),
      eq(experts.isFollowing, true)
    ))
    .orderBy(desc(experts.rankScore));
}

/**
 * Update expert following status with brainlift ownership verification.
 * Returns null if expert doesn't exist or doesn't belong to the brainlift.
 */
export async function updateExpertFollowingForBrainlift(
  expertId: number,
  brainliftId: number,
  isFollowing: boolean
): Promise<Expert | null> {
  const [updated] = await db.update(experts)
    .set({ isFollowing })
    .where(and(eq(experts.id, expertId), eq(experts.brainliftId, brainliftId)))
    .returning();
  return updated || null;
}

/**
 * Delete expert with brainlift ownership verification.
 * Returns false if expert doesn't exist or doesn't belong to the brainlift.
 */
export async function deleteExpertForBrainlift(
  expertId: number,
  brainliftId: number
): Promise<boolean> {
  const result = await db.delete(experts)
    .where(and(eq(experts.id, expertId), eq(experts.brainliftId, brainliftId)));
  return (result.rowCount ?? 0) > 0;
}
