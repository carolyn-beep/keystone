import {
  db, eq, inArray, desc, and, sql, isNull,
  brainlifts, facts, contradictionClusters, readingListItems, readingListGrades,
  brainliftVersions, sourceFeedback, experts, factVerifications, factModelScores,
  llmFeedback, factRedundancyGroups,
  type Brainlift, type BrainliftData, type InsertBrainlift,
  type BrainliftVersion, type AuthContext
} from './base';

export async function getBrainliftBySlug(slug: string): Promise<BrainliftData | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.slug, slug));

  if (!brainlift) return undefined;

  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
  const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
  const readingList = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainlift.id));
  const brainliftExperts = await db.select().from(experts).where(eq(experts.brainliftId, brainlift.id));

  return {
    ...brainlift,
    improperlyFormatted: brainlift.improperlyFormatted ?? false,
    facts: brainliftFacts,
    contradictionClusters: clusters,
    readingList: readingList,
    experts: brainliftExperts.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0))
  };
}

export async function getBrainliftById(id: number): Promise<Brainlift | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));
  return brainlift;
}

export async function createBrainlift(
  brainliftData: InsertBrainlift,
  factsData: any[],
  clustersData: any[],
  readingData: any[],
  userId?: string
): Promise<BrainliftData> {
  const dataWithUser = userId ? { ...brainliftData, createdByUserId: userId } : brainliftData;
  const [brainlift] = await db.insert(brainlifts).values(dataWithUser as any).returning();

  if (factsData.length > 0) {
    await db.insert(facts).values(factsData.map(f => ({
      brainliftId: brainlift.id,
      originalId: f.originalId,
      category: f.category,
      source: f.source,
      fact: f.fact,
      summary: f.summary,
      score: f.score,
      contradicts: f.contradicts,
      note: f.note,
      flags: f.flags || [],
      isGradeable: f.score > 0
    })));
  }

  if (clustersData.length > 0) {
    await db.insert(contradictionClusters).values(clustersData.map(c => ({ ...c, brainliftId: brainlift.id })));
  }

  if (readingData.length > 0) {
    await db.insert(readingListItems).values(readingData.map(r => ({ ...r, brainliftId: brainlift.id })));
  }

  return getBrainliftBySlug(brainlift.slug) as Promise<BrainliftData>;
}

export async function updateBrainlift(
  slug: string,
  brainliftData: InsertBrainlift,
  factsData: any[],
  clustersData: any[],
  readingData: any[]
): Promise<BrainliftData> {
  const existing = await getBrainliftBySlug(slug);
  if (!existing) {
    throw new Error(`Brainlift with slug "${slug}" not found`);
  }

  // Import reading-list functions lazily to avoid circular deps
  const { getGradesByBrainliftId } = await import('./reading-list');
  const grades = await getGradesByBrainliftId(existing.id);

  const versions = await db.select().from(brainliftVersions)
    .where(eq(brainliftVersions.brainliftId, existing.id))
    .orderBy(desc(brainliftVersions.versionNumber));
  const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;

  const gradesWithTopics = existing.readingList.map(item => {
    const grade = grades.find(g => g.readingListItemId === item.id);
    return {
      readingListTopic: item.topic,
      aligns: grade?.aligns || null,
      contradicts: grade?.contradicts || null,
      newInfo: grade?.newInfo || null,
      quality: grade?.quality || null,
    };
  });

  const snapshot = {
    title: existing.title,
    description: existing.description,
    author: existing.author,
    summary: existing.summary,
    facts: existing.facts.map(f => ({
      originalId: f.originalId,
      category: f.category,
      source: f.source,
      fact: f.fact,
      summary: f.summary,
      score: f.score,
      contradicts: f.contradicts,
      note: f.note,
    })),
    contradictionClusters: existing.contradictionClusters.map(c => ({
      name: c.name,
      tension: c.tension,
      status: c.status,
      factIds: c.factIds as string[],
      claims: c.claims as string[],
    })),
    readingList: existing.readingList.map(r => ({
      type: r.type,
      author: r.author,
      topic: r.topic,
      time: r.time,
      facts: r.facts,
      url: r.url,
    })),
    grades: gradesWithTopics,
  };

  await db.insert(brainliftVersions).values({
    brainliftId: existing.id,
    versionNumber: nextVersionNumber,
    sourceType: brainliftData.sourceType || 'unknown',
    snapshot,
  });

  const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, existing.id));
  const itemIds = items.map(i => i.id);
  if (itemIds.length > 0) {
    await db.delete(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
  }
  await db.delete(readingListItems).where(eq(readingListItems.brainliftId, existing.id));
  await db.delete(contradictionClusters).where(eq(contradictionClusters.brainliftId, existing.id));
  await db.delete(facts).where(eq(facts.brainliftId, existing.id));

  await db.update(brainlifts)
    .set({
      title: brainliftData.title,
      description: brainliftData.description,
      author: brainliftData.author,
      summary: brainliftData.summary,
      classification: brainliftData.classification as any,
      rejectionReason: brainliftData.rejectionReason,
      rejectionSubtype: brainliftData.rejectionSubtype,
      rejectionRecommendation: brainliftData.rejectionRecommendation,
      originalContent: brainliftData.originalContent,
      sourceType: brainliftData.sourceType,
    })
    .where(eq(brainlifts.id, existing.id));

  console.log(`Inserting ${factsData.length} facts, ${clustersData.length} clusters, ${readingData.length} reading items`);

  if (factsData.length > 0) {
    try {
      const factsToInsert = factsData.map(f => ({ ...f, brainliftId: existing.id }));
      console.log('First fact to insert:', JSON.stringify(factsToInsert[0]));
      await db.insert(facts).values(factsToInsert);
      console.log('Facts inserted successfully');
    } catch (err) {
      console.error('Error inserting facts:', err);
      throw err;
    }
  }
  if (clustersData.length > 0) {
    try {
      await db.insert(contradictionClusters).values(clustersData.map(c => ({ ...c, brainliftId: existing.id })));
      console.log('Clusters inserted successfully');
    } catch (err) {
      console.error('Error inserting clusters:', err);
      throw err;
    }
  }
  if (readingData.length > 0) {
    try {
      await db.insert(readingListItems).values(readingData.map(r => ({ ...r, brainliftId: existing.id })));
      console.log('Reading items inserted successfully');
    } catch (err) {
      console.error('Error inserting reading items:', err);
      throw err;
    }
  }

  return getBrainliftBySlug(slug) as Promise<BrainliftData>;
}

export async function deleteBrainlift(id: number): Promise<void> {
  // Use transaction to ensure all deletes succeed or none do
  await db.transaction(async (tx) => {
    const items = await tx.select().from(readingListItems).where(eq(readingListItems.brainliftId, id));
    const itemIds = items.map(i => i.id);

    if (itemIds.length > 0) {
      await tx.delete(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
    }

    const factsList = await tx.select().from(facts).where(eq(facts.brainliftId, id));
    const factIds = factsList.map(f => f.id);

    if (factIds.length > 0) {
      const verifications = await tx.select().from(factVerifications).where(inArray(factVerifications.factId, factIds));
      const verificationIds = verifications.map(v => v.id);

      if (verificationIds.length > 0) {
        await tx.delete(factModelScores).where(inArray(factModelScores.verificationId, verificationIds));
      }

      await tx.delete(llmFeedback).where(inArray(llmFeedback.factId, factIds));
      await tx.delete(factVerifications).where(inArray(factVerifications.factId, factIds));
    }

    await tx.delete(readingListItems).where(eq(readingListItems.brainliftId, id));
    await tx.delete(contradictionClusters).where(eq(contradictionClusters.brainliftId, id));
    await tx.delete(sourceFeedback).where(eq(sourceFeedback.brainliftId, id));
    await tx.delete(brainliftVersions).where(eq(brainliftVersions.brainliftId, id));
    await tx.delete(experts).where(eq(experts.brainliftId, id));
    await tx.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, id));
    await tx.delete(facts).where(eq(facts.brainliftId, id));
    await tx.delete(brainlifts).where(eq(brainlifts.id, id));
  });
}

export async function updateBrainliftFields(id: number, fields: {
  originalContent?: string | null;
  sourceType?: string | null;
  author?: string | null;
  expertDiagnostics?: any | null;
}): Promise<void> {
  await db.update(brainlifts)
    .set(fields)
    .where(eq(brainlifts.id, id));
}

export async function getVersionsByBrainliftId(brainliftId: number): Promise<BrainliftVersion[]> {
  return await db.select().from(brainliftVersions)
    .where(eq(brainliftVersions.brainliftId, brainliftId))
    .orderBy(desc(brainliftVersions.versionNumber));
}

// Authorization methods
export async function getBrainliftsForUserPaginated(
  authContext: AuthContext,
  offset: number,
  limit: number
): Promise<{ brainlifts: Brainlift[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(brainlifts)
    .where(eq(brainlifts.createdByUserId, authContext.userId));

  const items = await db.select().from(brainlifts)
    .where(eq(brainlifts.createdByUserId, authContext.userId))
    .orderBy(desc(brainlifts.id))
    .limit(limit)
    .offset(offset);

  return { brainlifts: items, total: Number(countResult.count) };
}

export async function getAllBrainliftsPaginated(
  offset: number,
  limit: number
): Promise<{ brainlifts: Brainlift[]; total: number }> {
  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(brainlifts);

  const items = await db.select().from(brainlifts)
    .orderBy(desc(brainlifts.id))
    .limit(limit)
    .offset(offset);

  return { brainlifts: items, total: Number(countResult.count) };
}

export function canAccessBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean {
  if (authContext.isAdmin) return true;
  if (brainlift.createdByUserId === null) return false;
  return brainlift.createdByUserId === authContext.userId;
}

export function canModifyBrainlift(brainlift: Brainlift, authContext: AuthContext): boolean {
  if (authContext.isAdmin) return true;
  return brainlift.createdByUserId === authContext.userId;
}
