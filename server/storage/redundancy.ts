import {
  db, eq, and,
  factRedundancyGroups,
  type FactRedundancyGroup, type InsertFactRedundancyGroup, type RedundancyStatus
} from './base';

export async function getRedundancyGroups(brainliftId: number): Promise<FactRedundancyGroup[]> {
  return await db.select().from(factRedundancyGroups)
    .where(eq(factRedundancyGroups.brainliftId, brainliftId));
}

export async function saveRedundancyGroups(
  brainliftId: number,
  groups: Omit<InsertFactRedundancyGroup, 'brainliftId'>[]
): Promise<FactRedundancyGroup[]> {
  if (groups.length === 0) return [];

  await db.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, brainliftId));

  const inserted = await db.insert(factRedundancyGroups)
    .values(groups.map(g => ({ ...g, brainliftId })) as any)
    .returning();

  return inserted;
}

/**
 * Get redundancy group by ID with brainlift ownership verification.
 * Returns null if group doesn't exist or doesn't belong to the brainlift.
 */
export async function getRedundancyGroupForBrainlift(
  groupId: number,
  brainliftId: number
): Promise<FactRedundancyGroup | null> {
  const [group] = await db.select().from(factRedundancyGroups)
    .where(and(
      eq(factRedundancyGroups.id, groupId),
      eq(factRedundancyGroups.brainliftId, brainliftId)
    ));
  return group || null;
}

/**
 * Update redundancy group status with brainlift ownership verification.
 * Returns null if group doesn't exist or doesn't belong to the brainlift.
 */
export async function updateRedundancyGroupStatusForBrainlift(
  groupId: number,
  brainliftId: number,
  status: RedundancyStatus
): Promise<FactRedundancyGroup | null> {
  const [updated] = await db.update(factRedundancyGroups)
    .set({ status })
    .where(and(
      eq(factRedundancyGroups.id, groupId),
      eq(factRedundancyGroups.brainliftId, brainliftId)
    ))
    .returning();
  return updated || null;
}
