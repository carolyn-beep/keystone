import {
  db, eq, inArray, desc, asc, and, sql, isNull,
  brainlifts, facts, contradictionClusters,
  brainliftVersions, experts, factVerifications, factModelScores,
  llmFeedback, factRedundancyGroups, dok2Summaries, dok2Points, dok2FactRelations,
  nativeBrainliftDetails, builderExperts, dok4Spovs, user,
  type Brainlift, type BrainliftData, type InsertBrainlift,
  type BrainliftVersion, type AuthContext, type ImportStatus, type Expert, type Fact
} from './base';
import type { BrainliftPhase } from '@shared/schema';
import { getDOK2Summaries, deleteDOK2Summaries } from './dok2';
import { getDOK3Insights, type DOK3InsightWithLinks } from './dok3';
import { getDOK4Spovs } from './dok4';
import type { DOK4SpovWithLinks } from '@shared/dok4-types';
import { getSharedBrainlifts } from './shares';
import { NotFoundError } from '../middleware/error-handler';

function expertOrderBy() {
  return [sql`${experts.rankScore} DESC NULLS LAST`, desc(experts.id)] as const;
}

export async function getBrainliftRecordBySlug(slug: string): Promise<Brainlift | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.slug, slug));
  return brainlift;
}

export async function getContradictionClustersByBrainliftId(brainliftId: number) {
  return await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainliftId));
}

// TODO: This legacy API is a partial aggregate, not a simple row lookup. Row-only
// callers should use getBrainliftRecordBySlug; full current-state callers should
// use explicit detail/per-DOK storage functions instead of extending this shape.
export async function getBrainliftBySlug(slug: string): Promise<BrainliftData | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.slug, slug));

  if (!brainlift) return undefined;

  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
  const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
  const brainliftExperts = await db.select().from(experts)
    .where(eq(experts.brainliftId, brainlift.id))
    .orderBy(...expertOrderBy());
  const dok2SummariesData = await getDOK2Summaries(brainlift.id);

  return {
    ...brainlift,
    improperlyFormatted: brainlift.improperlyFormatted ?? false,
    facts: brainliftFacts,
    contradictionClusters: clusters,
    experts: brainliftExperts,
    dok2Summaries: dok2SummariesData.length > 0 ? dok2SummariesData : undefined,
  };
}

export async function getBrainliftById(id: number): Promise<Brainlift | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));
  return brainlift;
}

export interface BrainliftDetailRecord {
  id: number;
  slug: string;
  title: string;
  description: string;
  displayPurpose: string | null;
  author: string | null;
  createdAt: Date;
}

export interface BrainliftDetailAggregate {
  brainlift: BrainliftDetailRecord;
  experts: Expert[];
  dok1: Fact[];
  dok2: Array<{
    id: number;
    category: string | null;
    sourceName: string;
    sourceUrl: string | null;
    displayTitle: string | null;
    workflowyNodeId: string | null;
    sourceWorkflowyNodeId: string | null;
    points: Array<{ id: number; text: string; sortOrder: number }>;
    relatedFactIds: number[];
    grade: number | null;
    diagnosis: string | null;
    feedback: string | null;
    failReason: unknown | null;
    sourceVerified: boolean | null;
    gradingStatus: 'graded' | 'regrading' | 'grading' | 'error' | null;
  }>;
  dok3: DOK3InsightWithLinks[];
  dok4: DOK4SpovWithLinks[];
}

export async function getBrainliftDetailById(id: number): Promise<BrainliftDetailAggregate | undefined> {
  const [brainlift] = await db.select({
    id: brainlifts.id,
    slug: brainlifts.slug,
    title: brainlifts.title,
    description: brainlifts.description,
    displayPurpose: brainlifts.displayPurpose,
    author: brainlifts.author,
    createdAt: brainlifts.createdAt,
  }).from(brainlifts).where(eq(brainlifts.id, id));
  if (!brainlift) return undefined;

  const [
    brainliftExperts,
    brainliftFacts,
    dok2SummariesData,
    dok3InsightsData,
    dok4SpovsData,
  ] = await Promise.all([
    db.select().from(experts)
      .where(eq(experts.brainliftId, id))
      .orderBy(...expertOrderBy()),
    db.select().from(facts)
      .where(eq(facts.brainliftId, id))
      .orderBy(asc(facts.id)),
    getDOK2Summaries(id),
    getDOK3Insights(id, []),
    getDOK4Spovs(id),
  ]);

  const dok2Ids = dok2SummariesData.map((summary) => summary.id);
  const dok2Statuses = dok2Ids.length > 0
    ? await db.select({
        id: dok2Summaries.id,
        gradingStatus: dok2Summaries.gradingStatus,
      }).from(dok2Summaries).where(inArray(dok2Summaries.id, dok2Ids))
    : [];
  const dok2StatusById = new Map(dok2Statuses.map((row) => [row.id, row.gradingStatus]));

  return {
    brainlift,
    experts: brainliftExperts,
    dok1: brainliftFacts,
    dok2: dok2SummariesData.map((summary) => ({
      ...summary,
      gradingStatus: dok2StatusById.get(summary.id) ?? null,
    })),
    dok3: dok3InsightsData,
    dok4: dok4SpovsData,
  };
}

export async function getBrainliftDataById(id: number): Promise<BrainliftData | undefined> {
  const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, id));

  if (!brainlift) return undefined;

  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
  const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
  const brainliftExperts = await db.select().from(experts)
    .where(eq(experts.brainliftId, brainlift.id))
    .orderBy(...expertOrderBy());
  const dok2SummariesData = await getDOK2Summaries(brainlift.id);

  return {
    ...brainlift,
    improperlyFormatted: brainlift.improperlyFormatted ?? false,
    facts: brainliftFacts,
    contradictionClusters: clusters,
    experts: brainliftExperts,
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

  return getBrainliftBySlug(brainlift.slug) as Promise<BrainliftData>;
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug || 'research-project';
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '23505' || maybeError.cause?.code === '23505';
}

function blankBrainliftSlug(baseSlug: string, attempt: number): string {
  return attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
}

export async function createBlankBrainlift(args: {
  userId: string;
  title: string;
  description?: string;
}): Promise<Brainlift> {
  const baseSlug = slugifyTitle(args.title);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const [brainlift] = await db
        .insert(brainlifts)
        .values({
          slug: blankBrainliftSlug(baseSlug, attempt),
          title: args.title,
          description: args.description ?? '',
          createdByUserId: args.userId,
          phase: 'research',
          summary: {
            totalFacts: 0,
            meanScore: '0',
            score5Count: 0,
            contradictionCount: 0,
          },
        })
        .returning();

      return brainlift;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to create a unique brainlift slug');
}

/**
 * Create a brainlift from the onboarding wizard (features/ux-redesign).
 * Like createBlankBrainlift (research phase, zeroed summary, slug retry loop)
 * but additionally seeds onboardingStep = 1 so the wizard state machine has a
 * server-backed high-water mark from step 1 on.
 */
export async function createOnboardingBrainlift(args: {
  userId: string;
  topic: string;
}): Promise<Brainlift> {
  const baseSlug = slugifyTitle(args.topic);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const [brainlift] = await db
        .insert(brainlifts)
        .values({
          slug: blankBrainliftSlug(baseSlug, attempt),
          title: args.topic,
          description: '',
          createdByUserId: args.userId,
          phase: 'research',
          onboardingStep: 1,
          summary: {
            totalFacts: 0,
            meanScore: '0',
            score5Count: 0,
            contradictionCount: 0,
          },
        })
        .returning();

      return brainlift;
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to create a unique brainlift slug');
}

export async function setBrainliftPhase(
  brainliftId: number,
  phase: BrainliftPhase,
): Promise<Brainlift> {
  const [brainlift] = await db
    .update(brainlifts)
    .set({ phase })
    .where(eq(brainlifts.id, brainliftId))
    .returning();

  if (!brainlift) {
    throw new NotFoundError('Brainlift not found');
  }

  return brainlift;
}

/**
 * Normalize a scope phrase list: trim entries, drop empties, dedupe
 * (first occurrence wins, order otherwise preserved).
 */
function normalizeScopeList(entries: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/**
 * Persist In/Out scope phrase arrays (onboarding wizard, ux-redesign).
 * Omitted keys leave the corresponding column untouched.
 */
export async function updateBrainliftScope(
  brainliftId: number,
  patch: { inScope?: string[]; outOfScope?: string[] },
): Promise<Brainlift> {
  const set: { inScope?: string[]; outOfScope?: string[] } = {};
  if (patch.inScope !== undefined) set.inScope = normalizeScopeList(patch.inScope);
  if (patch.outOfScope !== undefined) set.outOfScope = normalizeScopeList(patch.outOfScope);

  if (Object.keys(set).length === 0) {
    const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.id, brainliftId));
    if (!brainlift) {
      throw new NotFoundError('Brainlift not found');
    }
    return brainlift;
  }

  const [brainlift] = await db
    .update(brainlifts)
    .set(set)
    .where(eq(brainlifts.id, brainliftId))
    .returning();

  if (!brainlift) {
    throw new NotFoundError('Brainlift not found');
  }

  return brainlift;
}

/**
 * Advance or clear onboarding-wizard progress. NULL = not onboarding
 * (legacy, imported, or finished).
 */
export async function updateOnboardingStep(
  brainliftId: number,
  step: number | null,
): Promise<Brainlift> {
  const [brainlift] = await db
    .update(brainlifts)
    .set({ onboardingStep: step })
    .where(eq(brainlifts.id, brainliftId))
    .returning();

  if (!brainlift) {
    throw new NotFoundError('Brainlift not found');
  }

  return brainlift;
}

export async function updateBrainlift(
  slug: string,
  brainliftData: InsertBrainlift,
  factsData: any[],
  clustersData: any[]
): Promise<BrainliftData> {
  const existing = await getBrainliftBySlug(slug);
  if (!existing) {
    throw new Error(`Brainlift with slug "${slug}" not found`);
  }

  const versions = await db.select().from(brainliftVersions)
    .where(eq(brainliftVersions.brainliftId, existing.id))
    .orderBy(desc(brainliftVersions.versionNumber));
  const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;

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
  };

  await db.insert(brainliftVersions).values({
    brainliftId: existing.id,
    versionNumber: nextVersionNumber,
    sourceType: brainliftData.sourceType || 'unknown',
    snapshot,
  });

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

  console.log(`Inserting ${factsData.length} facts, ${clustersData.length} clusters`);

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

  return getBrainliftBySlug(slug) as Promise<BrainliftData>;
}

export async function deleteBrainlift(id: number): Promise<void> {
  // Use transaction to ensure all deletes succeed or none do
  await db.transaction(async (tx) => {
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

    await tx.delete(contradictionClusters).where(eq(contradictionClusters.brainliftId, id));
    await tx.delete(brainliftVersions).where(eq(brainliftVersions.brainliftId, id));
    await tx.delete(experts).where(eq(experts.brainliftId, id));
    await tx.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, id));
    await tx.delete(facts).where(eq(facts.brainliftId, id));

    // Delete native builder tables (no-op for imported brainlifts)
    await tx.delete(builderExperts).where(eq(builderExperts.brainliftId, id));
    await tx.delete(nativeBrainliftDetails).where(eq(nativeBrainliftDetails.brainliftId, id));

    await tx.delete(brainlifts).where(eq(brainlifts.id, id));
  });
}

export async function updateBrainliftFields(id: number, fields: {
  title?: string;
  originalContent?: string | null;
  sourceType?: string | null;
  author?: string | null;
  displayPurpose?: string | null;
  expertDiagnostics?: any | null;
  importHierarchy?: unknown | null;
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

export async function updateImportStatus(brainliftId: number, importStatus: ImportStatus) {
  await db.update(brainlifts)
    .set({ importStatus })
    .where(eq(brainlifts.id, brainliftId));
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

/**
 * Build a case-insensitive search predicate that matches `term` against the
 * brainlift title, the brainlift author (document header), and the platform
 * user's display name. Returns `undefined` when `term` is empty so callers can
 * pass it directly into `and(...)`.
 */
function buildBrainliftSearchPredicate(term: string | undefined) {
  if (!term) return undefined;
  const trimmed = term.trim();
  if (!trimmed) return undefined;
  const pattern = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  return sql`(${brainlifts.title} ILIKE ${pattern} OR ${brainlifts.author} ILIKE ${pattern} OR ${user.name} ILIKE ${pattern})`;
}

export interface BrainliftWithCreator extends Brainlift {
  creatorName: string | null;
}

export async function getBrainliftsForUserPaginated(
  authContext: AuthContext,
  offset: number,
  limit: number,
  filter: 'all' | 'owned' | 'shared' = 'all',
  options: { search?: string } = {}
): Promise<{ brainlifts: BrainliftWithCreator[]; total: number }> {
  const searchPredicate = buildBrainliftSearchPredicate(options.search);

  if (filter === 'shared') {
    // Brainlifts shared with user via shares table. We re-implement the
    // shared-lookup here (rather than going through `getSharedBrainlifts`)
    // so we can JOIN the user table for creatorName and apply search.
    const sharedJoin = sql`INNER JOIN (SELECT DISTINCT brainlift_id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user') sh ON sh.brainlift_id = ${brainlifts.id}`;

    const whereClause = searchPredicate ? and(searchPredicate) : undefined;

    const itemsQuery = db
      .select({ brainlift: brainlifts, creatorName: user.name })
      .from(brainlifts)
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .innerJoin(
        sql`(SELECT DISTINCT brainlift_id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user') sh`,
        sql`sh.brainlift_id = ${brainlifts.id}`
      );
    const items = whereClause
      ? await itemsQuery.where(whereClause).orderBy(desc(brainlifts.id)).limit(limit).offset(offset)
      : await itemsQuery.orderBy(desc(brainlifts.id)).limit(limit).offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(brainlifts)
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .innerJoin(
        sql`(SELECT DISTINCT brainlift_id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user') sh`,
        sql`sh.brainlift_id = ${brainlifts.id}`
      );
    const [countResult] = whereClause
      ? await countQuery.where(whereClause)
      : await countQuery;

    return {
      brainlifts: items.map((row) => ({ ...row.brainlift, creatorName: row.creatorName })),
      total: Number(countResult.count),
    };
  }

  if (filter === 'owned') {
    const ownedPredicate = eq(brainlifts.createdByUserId, authContext.userId);
    const whereClause = searchPredicate ? and(ownedPredicate, searchPredicate) : ownedPredicate;

    const items = await db
      .select({ brainlift: brainlifts, creatorName: user.name })
      .from(brainlifts)
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(whereClause)
      .orderBy(desc(brainlifts.id))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(brainlifts)
      .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
      .where(whereClause);

    return {
      brainlifts: items.map((row) => ({ ...row.brainlift, creatorName: row.creatorName })),
      total: Number(countResult.count),
    };
  }

  // filter === 'all': Both owned and shared. We do this as a single UNION
  // selecting brainlift ids the user can see, then join+search+paginate over
  // the union. Keeps the search predicate consistent across both buckets.
  const visibleIdsCte = sql`(
    SELECT id FROM ${brainlifts} WHERE created_by_user_id = ${authContext.userId}
    UNION
    SELECT brainlift_id AS id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user'
  )`;

  const allWhere = searchPredicate
    ? and(sql`${brainlifts.id} IN ${visibleIdsCte}`, searchPredicate)
    : sql`${brainlifts.id} IN ${visibleIdsCte}`;

  const items = await db
    .select({ brainlift: brainlifts, creatorName: user.name })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(allWhere)
    .orderBy(desc(brainlifts.id))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(allWhere);

  return {
    brainlifts: items.map((row) => ({ ...row.brainlift, creatorName: row.creatorName })),
    total: Number(countResult.count),
  };
}

/**
 * Returns the slim picker payload (id, slug, title, phase) for every brainlift
 * the user has access to (owned + shared). No pagination — the project picker
 * needs the full list client-side so users can scroll, and the slim shape keeps
 * the payload tiny even for power users with hundreds of brainlifts.
 */
export async function getBrainliftTitlesForUser(
  authContext: AuthContext,
): Promise<Array<Pick<Brainlift, 'id' | 'slug' | 'title' | 'phase'>>> {
  const visibleIdsCte = sql`(
    SELECT id FROM ${brainlifts} WHERE created_by_user_id = ${authContext.userId}
    UNION
    SELECT brainlift_id AS id FROM brainlift_shares WHERE user_id = ${authContext.userId} AND type = 'user'
  )`;

  return db
    .select({
      id: brainlifts.id,
      slug: brainlifts.slug,
      title: brainlifts.title,
      phase: brainlifts.phase,
    })
    .from(brainlifts)
    .where(sql`${brainlifts.id} IN ${visibleIdsCte}`)
    .orderBy(desc(brainlifts.id));
}

export async function getAllBrainliftsPaginated(
  offset: number,
  limit: number,
  options: { search?: string } = {}
): Promise<{ brainlifts: BrainliftWithCreator[]; total: number }> {
  const searchPredicate = buildBrainliftSearchPredicate(options.search);

  const itemsQuery = db
    .select({ brainlift: brainlifts, creatorName: user.name })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id));

  const items = searchPredicate
    ? await itemsQuery.where(searchPredicate).orderBy(desc(brainlifts.id)).limit(limit).offset(offset)
    : await itemsQuery.orderBy(desc(brainlifts.id)).limit(limit).offset(offset);

  const countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id));

  const [countResult] = searchPredicate
    ? await countQuery.where(searchPredicate)
    : await countQuery;

  return {
    brainlifts: items.map((row) => ({ ...row.brainlift, creatorName: row.creatorName })),
    total: Number(countResult.count),
  };
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

export interface SprintGenerationContext {
  brainlift: {
    id: number;
    title: string;
    description: string;
    displayPurpose: string | null;
  };
  creator: {
    userId: string;
    email: string | null;
    name: string | null;
  };
  experts: Array<{
    name: string;
    rankScore: number | null;
    rationale: string | null;
  }>;
  spovs: Array<{
    id: number;
    text: string;
    score: number | null;
    status: string;
  }>;
  sources: Array<{
    displayTitle: string;
    sourceName: string;
    grade: number | null;
    points: string[];
  }>;
}

const SPRINT_CONTEXT_SOURCE_LIMIT = 5;
const SPRINT_CONTEXT_SPOV_LIMIT = 5;
const SPRINT_CONTEXT_EXPERT_LIMIT = 5;
const SPRINT_CONTEXT_POINTS_PER_SOURCE = 5;

export async function getSprintPlanContext(brainliftId: number): Promise<SprintGenerationContext | null> {
  const [brainlift] = await db
    .select({
      id: brainlifts.id,
      title: brainlifts.title,
      description: brainlifts.description,
      displayPurpose: brainlifts.displayPurpose,
      createdByUserId: brainlifts.createdByUserId,
      creatorEmail: user.email,
      creatorName: user.name,
    })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(eq(brainlifts.id, brainliftId))
    .limit(1);

  if (!brainlift) return null;

  const [expertRows, spovRows, sourceRows] = await Promise.all([
    db
      .select({
        name: experts.name,
        rankScore: experts.rankScore,
        rationale: experts.rationale,
      })
      .from(experts)
      .where(eq(experts.brainliftId, brainliftId))
      .orderBy(...expertOrderBy())
      .limit(SPRINT_CONTEXT_EXPERT_LIMIT),
    db
      .select({
        id: dok4Spovs.id,
        text: dok4Spovs.text,
        score: dok4Spovs.score,
        status: dok4Spovs.status,
      })
      .from(dok4Spovs)
      .where(and(eq(dok4Spovs.brainliftId, brainliftId), eq(dok4Spovs.status, 'graded')))
      .orderBy(desc(dok4Spovs.score), desc(dok4Spovs.id))
      .limit(SPRINT_CONTEXT_SPOV_LIMIT),
    db
      .select({
        id: dok2Summaries.id,
        displayTitle: dok2Summaries.displayTitle,
        sourceName: dok2Summaries.sourceName,
        grade: dok2Summaries.grade,
      })
      .from(dok2Summaries)
      .where(and(
        eq(dok2Summaries.brainliftId, brainliftId),
        eq(dok2Summaries.isStale, false),
        eq(dok2Summaries.gradingStatus, 'graded'),
      ))
      .orderBy(sql`${dok2Summaries.grade} DESC NULLS LAST`, desc(dok2Summaries.id))
      .limit(SPRINT_CONTEXT_SOURCE_LIMIT),
  ]);

  const summaryIds = sourceRows.map((row) => row.id);
  const pointRows = summaryIds.length === 0
    ? []
    : await db
        .select({
          summaryId: dok2Points.summaryId,
          text: dok2Points.text,
          sortOrder: dok2Points.sortOrder,
          id: dok2Points.id,
        })
        .from(dok2Points)
        .where(inArray(dok2Points.summaryId, summaryIds))
        .orderBy(asc(dok2Points.summaryId), asc(dok2Points.sortOrder), asc(dok2Points.id));

  const pointsBySummaryId = new Map<number, string[]>();
  for (const point of pointRows) {
    const bucket = pointsBySummaryId.get(point.summaryId) ?? [];
    if (bucket.length < SPRINT_CONTEXT_POINTS_PER_SOURCE) {
      bucket.push(point.text);
      pointsBySummaryId.set(point.summaryId, bucket);
    }
  }

  const sources = sourceRows.map((row) => ({
    displayTitle: row.displayTitle ?? row.sourceName,
    sourceName: row.sourceName,
    grade: row.grade == null ? null : Number(row.grade),
    points: pointsBySummaryId.get(row.id) ?? [],
  }));

  return {
    brainlift: {
      id: brainlift.id,
      title: brainlift.title,
      description: brainlift.description,
      displayPurpose: brainlift.displayPurpose,
    },
    creator: {
      userId: brainlift.createdByUserId ?? '',
      email: brainlift.creatorEmail ?? null,
      name: brainlift.creatorName ?? null,
    },
    experts: expertRows,
    spovs: spovRows.map((row) => ({
      ...row,
      score: row.score == null ? null : Number(row.score),
    })),
    sources,
  };
}

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
 * Derive a Twitter handle from a builder expert's `where` field.
 * Supports: @handle, twitter.com/handle, x.com/handle
 */
export function deriveTwitterHandle(where: string): string | null {
  // @handle
  const atMatch = where.match(/^@(\w+)$/);
  if (atMatch) return atMatch[1];
  // twitter.com/handle or x.com/handle (with or without protocol/www)
  const urlMatch = where.match(/(?:twitter\.com|x\.com)\/(\w+)/);
  if (urlMatch) return urlMatch[1];
  return null;
}

/**
 * Get context for learning stream research swarm.
 * Returns title, purpose, top 15 facts (score >= 3), followed experts, existing topics.
 * For native brainlifts with no facts/ranked experts, falls back to builder experts.
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
      sourceType: brainlifts.sourceType,
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
    .orderBy(...expertOrderBy())
    .limit(10);

  // Native fallback: use builder experts when no ranked experts exist
  let expertsList: Array<{ id: number; name: string; twitterHandle: string | null; rankScore: number | null }> = followedExperts;

  if (brainlift.sourceType === 'native' && followedExperts.length === 0) {
    const savedBuilderExperts = await db
      .select({
        id: builderExperts.id,
        name: builderExperts.name,
        where: builderExperts.where,
      })
      .from(builderExperts)
      .where(
        and(
          eq(builderExperts.brainliftId, brainliftId),
          eq(builderExperts.status, 'saved')
        )
      )
      .limit(10);

    expertsList = savedBuilderExperts.map(e => ({
      id: e.id,
      name: e.name,
      twitterHandle: deriveTwitterHandle(e.where),
      rankScore: null,
    }));
  }

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
    experts: expertsList,
    existingTopics: existingItems.map(i => i.topic),
  };
}
