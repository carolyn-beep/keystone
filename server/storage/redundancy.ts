import {
  db, eq,
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
    .values(groups.map(g => ({ ...g, brainliftId })))
    .returning();

  return inserted;
}

export async function updateRedundancyGroupStatus(groupId: number, status: RedundancyStatus): Promise<FactRedundancyGroup> {
  const [updated] = await db.update(factRedundancyGroups)
    .set({ status })
    .where(eq(factRedundancyGroups.id, groupId))
    .returning();
  return updated;
}

export async function deleteRedundancyGroups(brainliftId: number): Promise<void> {
  await db.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, brainliftId));
}
