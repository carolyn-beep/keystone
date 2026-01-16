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
  await db.delete(experts).where(eq(experts.brainliftId, brainliftId));

  if (expertsData.length === 0) return [];

  const inserted = await db.insert(experts).values(expertsData).returning();
  return inserted.sort((a, b) => b.rankScore - a.rankScore);
}

export async function updateExpertFollowing(expertId: number, isFollowing: boolean): Promise<Expert> {
  const [updated] = await db.update(experts)
    .set({ isFollowing })
    .where(eq(experts.id, expertId))
    .returning();
  return updated;
}

export async function getFollowedExperts(brainliftId: number): Promise<Expert[]> {
  return await db.select().from(experts)
    .where(and(
      eq(experts.brainliftId, brainliftId),
      eq(experts.isFollowing, true)
    ))
    .orderBy(desc(experts.rankScore));
}

export async function deleteExpert(expertId: number): Promise<void> {
  await db.delete(experts).where(eq(experts.id, expertId));
}
