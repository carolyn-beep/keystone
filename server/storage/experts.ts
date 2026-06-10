import {
  db, eq, desc, and, sql,
  experts,
  type Expert, type InsertExpert
} from './base';
import { deriveTwitterHandle } from './brainlifts';

function expertOrderBy() {
  return [sql`${experts.rankScore} DESC NULLS LAST`, desc(experts.id)] as const;
}

function normalizeTwitterHandle(whereValue?: string | null): string | null {
  if (!whereValue) return null;
  const handle = deriveTwitterHandle(whereValue);
  return handle ? `@${handle}` : null;
}

export async function getExpertsByBrainliftId(brainliftId: number): Promise<Expert[]> {
  return await db.select().from(experts)
    .where(eq(experts.brainliftId, brainliftId))
    .orderBy(...expertOrderBy());
}

export async function saveExperts(brainliftId: number, expertsData: InsertExpert[]): Promise<Expert[]> {
  // Use transaction to ensure atomicity - if insert fails, delete is rolled back
  return await db.transaction(async (tx) => {
    await tx.delete(experts).where(eq(experts.brainliftId, brainliftId));

    if (expertsData.length === 0) return [];

    const inserted = await tx.insert(experts).values(expertsData).returning();
    return inserted.sort((a, b) => {
      if (a.rankScore === null && b.rankScore === null) return b.id - a.id;
      if (a.rankScore === null) return 1;
      if (b.rankScore === null) return -1;
      return b.rankScore - a.rankScore || b.id - a.id;
    });
  });
}

export async function createExpertsForBrainlift(
  brainliftId: number,
  expertsData: Array<{
    name: string;
    who?: string | null;
    why?: string | null;
    focus?: string | null;
    where?: string | null;
    source?: 'listed' | 'onboarding';
    twitterHandle?: string | null;
  }>,
): Promise<Expert[]> {
  if (expertsData.length === 0) return [];

  return db.insert(experts).values(
    expertsData.map((expert) => ({
      brainliftId,
      name: expert.name,
      who: expert.who ?? null,
      why: expert.why ?? null,
      focus: expert.focus ?? null,
      where: expert.where ?? null,
      rankScore: null,
      rationale: null,
      source: expert.source ?? 'listed',
      twitterHandle: expert.twitterHandle ?? normalizeTwitterHandle(expert.where),
    })),
  ).returning();
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

export async function updateExpertRankings(
  brainliftId: number,
  rankings: Array<{ expertId: number; rankScore: number | null; rationale: string | null }>,
): Promise<void> {
  if (rankings.length === 0) return;

  await db.transaction(async (tx) => {
    for (const ranking of rankings) {
      await tx.update(experts)
        .set({
          rankScore: ranking.rankScore,
          rationale: ranking.rationale,
        })
        .where(and(
          eq(experts.id, ranking.expertId),
          eq(experts.brainliftId, brainliftId),
        ));
    }
  });
}
