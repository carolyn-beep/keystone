import {
  db, eq, inArray, desc, and, sql, isNull,
  brainlifts, facts, contradictionClusters, readingListItems, readingListGrades,
  brainliftVersions, sourceFeedback, experts, factVerifications, factModelScores,
  llmFeedback, factRedundancyGroups, dok2Summaries, dok2Points, dok2FactRelations,
  type Brainlift, type BrainliftData, type InsertBrainlift,
  type BrainliftVersion, type AuthContext
} from './base';
import { getDOK2Summaries, deleteDOK2Summaries } from './dok2';
import { getSharedBrainlifts } from './shares';

export async function getBrainliftBySlug(slug: string): Promise<BrainliftData | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.slug, slug));

  if (!brainlift) return undefined;

  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
  const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
  const readingList = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainlift.id));
  const brainliftExperts = await db.select().from(experts).where(eq(experts.brainliftId, brainlift.id));
  const dok2SummariesData = await getDOK2Summaries(brainlift.id);

  return {
    ...brainlift,
    improperlyFormatted: brainlift.improperlyFormatted ?? false,
    facts: brainliftFacts,
    contradictionClusters: clusters,
    readingList: readingList,
    experts: brainliftExperts.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)),
    dok2Summaries: dok2SummariesData.length > 0 ? dok2SummariesData : undefined,
  };
}

export async function getBrainliftById(id: number): Promise<Brainlift | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));
  return brainlift;
}

export async function getBrainliftDataById(id: number): Promise<BrainliftData | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));

  if (!brainlift) return undefined;

  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
  const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
  const readingList = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainlift.id));
  const brainliftExperts = await db.select().from(experts).where(eq(experts.brainliftId, brainlift.id));
  const dok2SummariesData = await getDOK2Summaries(brainlift.id);

  return {
    ...brainlift,
    improperlyFormatted: brainlift.improperlyFormatted ?? false,
    facts: brainliftFacts,
    contradictionClusters: clusters,
    readingList: readingList,
    experts: brainliftExperts.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0)),
    dok2Summaries: dok2SummariesData.length > 0 ? dok2SummariesData : undefined,
  };
}

/**
 * Get all brainlifts owned by a specific user
 */
export async function getBrainliftsByOwnerId(userId: string): Promise<Brainlift[]> {
  return await db.select().from(brainlifts).where(eq(brainlifts.createdByUserId, userId));
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

  // Delete DOK2 data before facts (dok2_fact_relations has FK to facts)
  await deleteDOK2Summaries(existing.id);

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

    // Delete DOK2 data before facts (dok2_fact_relations has FK to facts)
    const dok2SummariesList = await tx.select({ id: dok2Summaries.id }).from(dok2Summaries).where(eq(dok2Summaries.brainliftId, id));
    const dok2SummaryIds = dok2SummariesList.map(s => s.id);
    if (dok2SummaryIds.length > 0) {
      await tx.delete(dok2FactRelations).where(inArray(dok2FactRelations.summaryId, dok2SummaryIds));
      await tx.delete(dok2Points).where(inArray(dok2Points.summaryId, dok2SummaryIds));
    }
    await tx.delete(dok2Summaries).where(eq(dok2Summaries.brainliftId, id));

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
  summary?: {
    totalFacts: number;
    meanScore: string;
    score5Count: number;
    contradictionCount: number;
  };
}): Promise<void> {
  await db.update(brainlifts)
    .set(fields)
    .where(eq(brainlifts.id, id));
}

/**
 * Update the cover image URL for a brainlift.
 */
export async function updateBrainliftCoverImage(id: number, coverImageUrl: string): Promise<void> {
  await db.update(brainlifts)
    .set({ coverImageUrl })
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
  limit: number,
  filter: 'all' | 'owned' | 'shared' = 'all'
): Promise<{ brainlifts: Brainlift[]; total: number }> {
  const { getUserSharePermission } = await import('./shares');

  if (filter === 'shared') {
    // Get brainlifts shared with user via shares table
    const { getSharedBrainlifts } = await import('./shares');
    const sharedBrainlifts = await getSharedBrainlifts(authContext.userId, offset, limit);

    // Get total count for pagination
    const [countResult] = await db.select({ count: sql<number>`count(*)` })
      .from(brainlifts)
      .innerJoin(
        sql`(SELECT DISTINCT brainlift_id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user')`,
        sql`brainlifts.id = brainlift_id`
      );

    return { brainlifts: sharedBrainlifts, total: Number(countResult.count) };
  }

  if (filter === 'owned') {
    // Only brainlifts owned by user
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

  // filter === 'all': Both owned and shared
  const ownedBrainlifts = await db.select().from(brainlifts)
    .where(eq(brainlifts.createdByUserId, authContext.userId))
    .orderBy(desc(brainlifts.id))
    .limit(limit)
    .offset(offset);

  const sharedBrainlifts = await getSharedBrainlifts(authContext.userId, offset, limit);

  // Combine and deduplicate (shouldn't happen but just in case)
  const allBrainlifts = [...ownedBrainlifts, ...sharedBrainlifts];
  const uniqueBrainlifts = Array.from(
    new Map(allBrainlifts.map(b => [b.id, b])).values()
  ).sort((a, b) => b.id - a.id);

  // Get total count
  const [ownedCount] = await db.select({ count: sql<number>`count(*)` })
    .from(brainlifts)
    .where(eq(brainlifts.createdByUserId, authContext.userId));

  const [sharedCount] = await db.select({ count: sql<number>`count(*)` })
    .from(brainlifts)
    .innerJoin(
      sql`(SELECT DISTINCT brainlift_id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user')`,
      sql`brainlifts.id = brainlift_id`
    );

  return {
    brainlifts: uniqueBrainlifts.slice(0, limit),
    total: Number(ownedCount.count) + Number(sharedCount.count)
  };
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

/**
 * Check if user can access a brainlift (read operations)
 * Now async to check shares table
 */
export async function canAccessBrainlift(brainlift: Brainlift, authContext: AuthContext): Promise<boolean> {
  // Admins can access everything
  if (authContext.isAdmin) return true;

  // Legacy brainlifts (no owner) are admin-only
  if (brainlift.createdByUserId === null) return false;

  // Owner can access
  if (brainlift.createdByUserId === authContext.userId) return true;

  // Check if user has any share (viewer or editor)
  const { getUserSharePermission } = await import('./shares');
  const permission = await getUserSharePermission(brainlift.id, authContext.userId);
  return permission !== null;
}

/**
 * Check if user can modify a brainlift (write operations)
 * Now async to check shares table for editor permission
 */
export async function canModifyBrainlift(brainlift: Brainlift, authContext: AuthContext): Promise<boolean> {
  // Admins can modify everything
  if (authContext.isAdmin) return true;

  // Owner can modify
  if (brainlift.createdByUserId === authContext.userId) return true;

  // Check if user has editor permission
  const { getUserSharePermission } = await import('./shares');
  const permission = await getUserSharePermission(brainlift.id, authContext.userId);
  return permission === 'editor';
}

/**
 * Check if user is the owner of a brainlift (for delete and share management)
 * Admins are NOT considered owners for transparency
 */
export function isOwner(brainlift: Brainlift, authContext: AuthContext): boolean {
  return brainlift.createdByUserId === authContext.userId;
}

// ============================================================================
// Context Queries - Optimized for specific AI operations
// ============================================================================

export interface ImageGenerationContext {
  id: number;
  title: string;
  purpose: string;  // The real purpose (stored in description field)
  topFactSummaries: string[];
}

/**
 * Get context for cover image generation.
 * Returns title, purpose (from description), and top 5 fact summaries (score >= 3).
 * All filtering/limiting done in SQL.
 */
export async function getImageGenerationContext(brainliftId: number): Promise<ImageGenerationContext | null> {
  // Get brainlift core info
  const [brainlift] = await db
    .select({
      id: brainlifts.id,
      title: brainlifts.title,
      description: brainlifts.description,  // This is the real purpose
    })
    .from(brainlifts)
    .where(eq(brainlifts.id, brainliftId));

  if (!brainlift) return null;

  // Get top 5 fact summaries (score >= 3, has summary)
  const topFacts = await db
    .select({ summary: facts.summary })
    .from(facts)
    .where(
      and(
        eq(facts.brainliftId, brainliftId),
        sql`${facts.score} >= 3`,
        sql`${facts.summary} IS NOT NULL`
      )
    )
    .orderBy(desc(facts.score))
    .limit(5);

  return {
    id: brainlift.id,
    title: brainlift.title,
    purpose: brainlift.description,
    topFactSummaries: topFacts.map(f => f.summary!),
  };
}

export interface LearningStreamContext {
  id: number;
  title: string;
  description: string;
  displayPurpose: string | null;
  facts: Array<{
    id: number;
    fact: string;
    category: string;
    score: number;
  }>;
  experts: Array<{
    id: number;
    name: string;
    twitterHandle: string | null;
    rankScore: number | null;
  }>;
  existingTopics: string[];
}

/**
 * Get context for learning stream research swarm.
 * Returns title, purpose, top 15 facts (score >= 3), followed experts, existing topics.
 * All filtering/limiting done in SQL.
 */
export async function getLearningStreamContext(brainliftId: number): Promise<LearningStreamContext | null> {
  // Get brainlift core info
  const [brainlift] = await db
    .select({
      id: brainlifts.id,
      title: brainlifts.title,
      description: brainlifts.description,
      displayPurpose: brainlifts.displayPurpose,
    })
    .from(brainlifts)
    .where(eq(brainlifts.id, brainliftId));

  if (!brainlift) return null;

  // Get top 15 facts (score >= 3)
  const topFacts = await db
    .select({
      id: facts.id,
      fact: facts.fact,
      category: facts.category,
      score: facts.score,
    })
    .from(facts)
    .where(
      and(
        eq(facts.brainliftId, brainliftId),
        sql`${facts.score} >= 3`
      )
    )
    .orderBy(desc(facts.score))
    .limit(15);

  // Get followed experts (top 10 by rank)
  const followedExperts = await db
    .select({
      id: experts.id,
      name: experts.name,
      twitterHandle: experts.twitterHandle,
      rankScore: experts.rankScore,
    })
    .from(experts)
    .where(
      and(
        eq(experts.brainliftId, brainliftId),
        eq(experts.isFollowing, true)
      )
    )
    .orderBy(desc(experts.rankScore))
    .limit(10);

  // Get existing learning stream topics
  const { learningStreamItems } = await import('./base');
  const existingItems = await db
    .select({ topic: learningStreamItems.topic })
    .from(learningStreamItems)
    .where(eq(learningStreamItems.brainliftId, brainliftId));

  return {
    id: brainlift.id,
    title: brainlift.title,
    description: brainlift.description,
    displayPurpose: brainlift.displayPurpose,
    facts: topFacts,
    experts: followedExperts,
    existingTopics: existingItems.map(i => i.topic),
  };
}
