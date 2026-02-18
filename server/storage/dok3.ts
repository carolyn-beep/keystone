/**
 * DOK3 Storage Layer
 *
 * Handles persistence of DOK3 insights (cross-source insights linking multiple DOK2 summaries).
 */

import {
  db, eq, and, inArray, sql, isNull,
  dok3Insights, dok3InsightLinks,
  dok2Summaries, dok2Points, dok2FactRelations, facts,
  brainlifts, factVerifications,
} from './base';
import { not } from 'drizzle-orm';
import type { DOK3InsightStatus } from '@shared/schema';

export interface DOK3InsightWithLinks {
  id: number;
  brainliftId: number;
  text: string;
  workflowyNodeId: string | null;
  status: string;
  score: number | null;
  frameworkName: string | null;
  frameworkDescription: string | null;
  criteriaBreakdown: Record<string, { assessment: string; evidence: string }> | null;
  rationale: string | null;
  feedback: string | null;
  foundationIntegrityIndex: string | null;
  dok1FoundationScore: string | null;
  dok2SynthesisScore: string | null;
  traceabilityFlagged: boolean;
  traceabilityFlaggedSource: string | null;
  evaluatorModel: string | null;
  sourceRankings: Record<string, number> | null;
  gradedAt: Date | null;
  createdAt: Date;
  linkedDok2SummaryIds: number[];
}


/**
 * Save DOK3 insights extracted from hierarchy (bulk insert with pending_linking status)
 */
export async function saveDOK3Insights(
  brainliftId: number,
  insights: Array<{ text: string; workflowyNodeId: string | null }>
): Promise<void> {
  if (insights.length === 0) return;

  console.log(`[DOK3 Storage] Saving ${insights.length} DOK3 insights for brainlift ${brainliftId}`);

  await db.insert(dok3Insights).values(
    insights.map(insight => ({
      brainliftId,
      text: insight.text,
      workflowyNodeId: insight.workflowyNodeId,
      status: 'pending_linking' as DOK3InsightStatus,
    }))
  );
}

/**
 * Get DOK3 insights with linked DOK2 summary IDs for a brainlift.
 * By default excludes 'scratchpadded' insights. Pass excludeStatuses=[] to get all.
 */
export async function getDOK3Insights(
  brainliftId: number,
  excludeStatuses: DOK3InsightStatus[] = ['scratchpadded']
): Promise<DOK3InsightWithLinks[]> {
  const conditions = [eq(dok3Insights.brainliftId, brainliftId)];
  for (const status of excludeStatuses) {
    conditions.push(not(eq(dok3Insights.status, status)));
  }

  const insights = await db.select().from(dok3Insights)
    .where(and(...conditions));

  if (insights.length === 0) return [];

  const insightIds = insights.map(i => i.id);

  // Get all links for these insights
  const links = await db.select().from(dok3InsightLinks)
    .where(inArray(dok3InsightLinks.insightId, insightIds));

  return insights.map(insight => ({
    id: insight.id,
    brainliftId: insight.brainliftId,
    text: insight.text,
    workflowyNodeId: insight.workflowyNodeId,
    status: insight.status,
    score: insight.score,
    frameworkName: insight.frameworkName,
    frameworkDescription: insight.frameworkDescription,
    criteriaBreakdown: insight.criteriaBreakdown as Record<string, { assessment: string; evidence: string }> | null,
    rationale: insight.rationale,
    feedback: insight.feedback,
    foundationIntegrityIndex: insight.foundationIntegrityIndex,
    dok1FoundationScore: insight.dok1FoundationScore,
    dok2SynthesisScore: insight.dok2SynthesisScore,
    traceabilityFlagged: insight.traceabilityFlagged ?? false,
    traceabilityFlaggedSource: insight.traceabilityFlaggedSource,
    evaluatorModel: insight.evaluatorModel,
    sourceRankings: insight.sourceRankings as Record<string, number> | null,
    gradedAt: insight.gradedAt,
    createdAt: insight.createdAt!,
    linkedDok2SummaryIds: links
      .filter(l => l.insightId === insight.id)
      .map(l => l.dok2SummaryId),
  }));
}

/**
 * Get ONLY scratchpadded DOK3 insights for a brainlift
 */
export async function getDOK3ScratchpadItems(brainliftId: number): Promise<DOK3InsightWithLinks[]> {
  const insights = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.brainliftId, brainliftId), eq(dok3Insights.status, 'scratchpadded')));

  if (insights.length === 0) return [];

  return insights.map(insight => ({
    id: insight.id,
    brainliftId: insight.brainliftId,
    text: insight.text,
    workflowyNodeId: insight.workflowyNodeId,
    status: insight.status,
    score: insight.score,
    frameworkName: insight.frameworkName,
    frameworkDescription: insight.frameworkDescription,
    criteriaBreakdown: insight.criteriaBreakdown as Record<string, { assessment: string; evidence: string }> | null,
    rationale: insight.rationale,
    feedback: insight.feedback,
    foundationIntegrityIndex: insight.foundationIntegrityIndex,
    dok1FoundationScore: insight.dok1FoundationScore,
    dok2SynthesisScore: insight.dok2SynthesisScore,
    traceabilityFlagged: insight.traceabilityFlagged ?? false,
    traceabilityFlaggedSource: insight.traceabilityFlaggedSource,
    evaluatorModel: insight.evaluatorModel,
    sourceRankings: insight.sourceRankings as Record<string, number> | null,
    gradedAt: insight.gradedAt,
    createdAt: insight.createdAt!,
    linkedDok2SummaryIds: [],
  }));
}

/**
 * Seed a single DOK3 insight (for testing without a full import)
 */
export async function seedDOK3Insight(
  brainliftId: number,
  text: string
): Promise<{ id: number }> {
  const [inserted] = await db.insert(dok3Insights).values({
    brainliftId,
    text,
    status: 'pending_linking',
  }).returning({ id: dok3Insights.id });

  return inserted;
}

/**
 * Get a single DOK3 insight, verified to belong to the given brainlift (IDOR-safe).
 * Returns null if insight doesn't exist or doesn't belong to the brainlift.
 */
export async function getDOK3InsightForBrainlift(
  insightId: number,
  brainliftId: number
): Promise<typeof dok3Insights.$inferSelect | null> {
  const [insight] = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));
  return insight || null;
}

/**
 * Validate that the given DOK2 summary IDs come from at least 2 different sources.
 * Normalizes sourceUrl (lowercase, strip trailing slashes) for comparison.
 */
export async function validateMultiSourceLinks(
  dok2SummaryIds: number[]
): Promise<{ valid: boolean; error?: string }> {
  if (dok2SummaryIds.length < 2) {
    return { valid: false, error: 'At least 2 DOK2 summaries are required' };
  }

  const summaries = await db.select({
    id: dok2Summaries.id,
    sourceUrl: dok2Summaries.sourceUrl,
    sourceName: dok2Summaries.sourceName,
  }).from(dok2Summaries)
    .where(inArray(dok2Summaries.id, dok2SummaryIds));

  if (summaries.length !== dok2SummaryIds.length) {
    return { valid: false, error: 'One or more DOK2 summary IDs not found' };
  }

  // Normalize source identity: prefer sourceUrl, fall back to sourceName
  const uniqueSources = new Set(
    summaries.map(s => {
      if (s.sourceUrl) {
        return s.sourceUrl.toLowerCase().replace(/\/+$/, '');
      }
      return s.sourceName.toLowerCase().trim();
    })
  );

  if (uniqueSources.size < 2) {
    return { valid: false, error: 'DOK2 summaries must come from at least 2 different sources' };
  }

  return { valid: true };
}

/**
 * Link a DOK3 insight to DOK2 summaries. Inserts link records and sets status to 'linked'.
 * Returns the updated insight with linked IDs.
 */
export async function linkDOK3Insight(
  insightId: number,
  brainliftId: number,
  dok2SummaryIds: number[]
): Promise<DOK3InsightWithLinks> {
  // Insert link records
  await db.insert(dok3InsightLinks).values(
    dok2SummaryIds.map(dok2SummaryId => ({
      insightId,
      dok2SummaryId,
    }))
  );

  // Update status to linked
  await db.update(dok3Insights)
    .set({ status: 'linked' as DOK3InsightStatus })
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));

  // Re-fetch the full insight
  const insights = await getDOK3Insights(brainliftId);
  return insights.find(i => i.id === insightId)!;
}

/**
 * Soft-delete: set insight status to 'scratchpadded' (IDOR-safe via brainliftId).
 */
export async function scratchpadDOK3Insight(
  insightId: number,
  brainliftId: number
): Promise<void> {
  await db.update(dok3Insights)
    .set({ status: 'scratchpadded' as DOK3InsightStatus })
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));
}

/**
 * Undo scratchpad: restore insight to 'pending_linking' status (IDOR-safe).
 */
export async function unscratchpadDOK3Insight(
  insightId: number,
  brainliftId: number
): Promise<void> {
  await db.update(dok3Insights)
    .set({ status: 'pending_linking' as DOK3InsightStatus })
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));
}

/**
 * Check if a DOK3 insight's foundation (linked DOK2s and their DOK1 facts) is fully graded.
 * - All linked DOK2 summaries must have a grade
 * - All gradeable DOK1 facts related to those DOK2s must have a score
 */
export async function checkFoundationGraded(insightId: number): Promise<{
  ready: boolean;
  pendingDok2Count: number;
  pendingDok1Count: number;
}> {
  // Get linked DOK2 summary IDs
  const links = await db.select({ dok2SummaryId: dok3InsightLinks.dok2SummaryId })
    .from(dok3InsightLinks)
    .where(eq(dok3InsightLinks.insightId, insightId));

  if (links.length === 0) {
    return { ready: false, pendingDok2Count: 0, pendingDok1Count: 0 };
  }

  const dok2Ids = links.map(l => l.dok2SummaryId);

  // Check ungraded DOK2 summaries
  const ungradedDok2 = await db.select({ id: dok2Summaries.id })
    .from(dok2Summaries)
    .where(and(
      inArray(dok2Summaries.id, dok2Ids),
      isNull(dok2Summaries.grade)
    ));

  // Check ungraded DOK1 facts linked to these DOK2s
  // Walk: dok2_fact_relations → facts where is_gradeable=true and score IS NULL
  const ungradedFacts = await db.selectDistinct({ factId: facts.id })
    .from(dok2FactRelations)
    .innerJoin(facts, eq(dok2FactRelations.factId, facts.id))
    .where(and(
      inArray(dok2FactRelations.summaryId, dok2Ids),
      eq(facts.isGradeable, true),
      isNull(facts.score)
    ));

  const pendingDok2Count = ungradedDok2.length;
  const pendingDok1Count = ungradedFacts.length;

  return {
    ready: pendingDok2Count === 0 && pendingDok1Count === 0,
    pendingDok2Count,
    pendingDok1Count,
  };
}

/**
 * Delete all DOK3 data for a brainlift (used during re-imports)
 */
export async function deleteDOK3Data(brainliftId: number): Promise<void> {
  // Get insight IDs first for link cleanup
  const insights = await db.select({ id: dok3Insights.id })
    .from(dok3Insights)
    .where(eq(dok3Insights.brainliftId, brainliftId));

  if (insights.length > 0) {
    const insightIds = insights.map(i => i.id);
    await db.delete(dok3InsightLinks).where(inArray(dok3InsightLinks.insightId, insightIds));
  }

  await db.delete(dok3Insights).where(eq(dok3Insights.brainliftId, brainliftId));

  console.log(`[DOK3 Storage] Deleted DOK3 data for brainlift ${brainliftId}`);
}

// ─── Phase 3: Evaluation Pipeline Storage ─────────────────────────────────────

export interface DOK3EvaluationContext {
  insight: { id: number; text: string; brainliftId: number };
  brainliftPurpose: string;
  linkedDok2s: Array<{
    id: number;
    sourceName: string;
    sourceUrl: string | null;
    displayTitle: string | null;
    grade: number | null;
    points: string[];
    dok1Facts: Array<{
      id: number;
      fact: string;
      score: number;
      isGradeable: boolean;
    }>;
  }>;
  sourceEvidence: Map<string, string>;
}

/**
 * Normalize a URL for deduplication: lowercase, strip trailing slashes.
 */
function normalizeUrl(url: string): string {
  return url.toLowerCase().replace(/\/+$/, '');
}

/**
 * Get everything the DOK3 grader needs for a single insight.
 * Walks: insight → brainlift → linked DOK2s → points + DOK1 facts → verifications.
 */
export async function getInsightEvaluationContext(
  insightId: number
): Promise<DOK3EvaluationContext | null> {
  // 1. Get the insight
  const [insight] = await db.select({
    id: dok3Insights.id,
    text: dok3Insights.text,
    brainliftId: dok3Insights.brainliftId,
  }).from(dok3Insights)
    .where(eq(dok3Insights.id, insightId));

  if (!insight) return null;

  // 2. Get brainlift purpose
  const [bl] = await db.select({
    description: brainlifts.description,
  }).from(brainlifts)
    .where(eq(brainlifts.id, insight.brainliftId));

  const brainliftPurpose = bl?.description ?? '';

  // 3. Get linked DOK2 summary IDs
  const links = await db.select({ dok2SummaryId: dok3InsightLinks.dok2SummaryId })
    .from(dok3InsightLinks)
    .where(eq(dok3InsightLinks.insightId, insightId));

  if (links.length === 0) {
    return {
      insight,
      brainliftPurpose,
      linkedDok2s: [],
      sourceEvidence: new Map(),
    };
  }

  const dok2Ids = links.map(l => l.dok2SummaryId);
  console.log(`[DOK3 Context] Insight ${insightId}: ${links.length} linked DOK2 IDs: [${dok2Ids.join(', ')}]`);

  // 4. Get DOK2 summaries
  const summaries = await db.select({
    id: dok2Summaries.id,
    sourceName: dok2Summaries.sourceName,
    sourceUrl: dok2Summaries.sourceUrl,
    displayTitle: dok2Summaries.displayTitle,
    grade: dok2Summaries.grade,
  }).from(dok2Summaries)
    .where(inArray(dok2Summaries.id, dok2Ids));

  // 5. Get DOK2 points for all summaries
  const points = await db.select({
    summaryId: dok2Points.summaryId,
    text: dok2Points.text,
    sortOrder: dok2Points.sortOrder,
  }).from(dok2Points)
    .where(inArray(dok2Points.summaryId, dok2Ids));

  console.log(`[DOK3 Context] DOK2 summaries found: ${summaries.length}, grades: [${summaries.map(s => `${s.id}:${s.grade ?? 'null'}`).join(', ')}]`);
  console.log(`[DOK3 Context] DOK2 points found: ${points.length} across ${new Set(points.map(p => p.summaryId)).size} summaries`);

  // 6. Get DOK1 facts linked to these DOK2s via dok2_fact_relations
  const factRelations = await db.select({
    summaryId: dok2FactRelations.summaryId,
    factId: dok2FactRelations.factId,
  }).from(dok2FactRelations)
    .where(inArray(dok2FactRelations.summaryId, dok2Ids));

  const allFactIds = Array.from(new Set(factRelations.map(r => r.factId)));
  console.log(`[DOK3 Context] dok2_fact_relations: ${factRelations.length} rows, ${allFactIds.length} unique fact IDs`);
  if (factRelations.length > 0) {
    console.log(`[DOK3 Context] Fact relations by DOK2: ${dok2Ids.map(id => `DOK2#${id}→${factRelations.filter(r => r.summaryId === id).length} facts`).join(', ')}`);
  }

  let factsData: Array<{ id: number; fact: string; score: number; isGradeable: boolean }> = [];
  let verificationsData: Array<{
    factId: number;
    evidenceContent: string | null;
    evidenceUrl: string | null;
  }> = [];

  if (allFactIds.length > 0) {
    factsData = await db.select({
      id: facts.id,
      fact: facts.fact,
      score: facts.score,
      isGradeable: facts.isGradeable,
    }).from(facts)
      .where(inArray(facts.id, allFactIds));

    console.log(`[DOK3 Context] Facts loaded: ${factsData.length}, extraction scores: [${factsData.map(f => `${f.id}:${f.score}`).join(', ')}]`);

    verificationsData = await db.select({
      factId: factVerifications.factId,
      evidenceContent: factVerifications.evidenceContent,
      evidenceUrl: factVerifications.evidenceUrl,
    }).from(factVerifications)
      .where(inArray(factVerifications.factId, allFactIds));

    console.log(`[DOK3 Context] Verifications loaded: ${verificationsData.length} for ${allFactIds.length} facts`);

    // Log facts WITHOUT verifications
    const verifiedFactIds = new Set(verificationsData.map(v => v.factId));
    const unverifiedFacts = allFactIds.filter(id => !verifiedFactIds.has(id));
    if (unverifiedFacts.length > 0) {
      console.log(`[DOK3 Context] ⚠️  ${unverifiedFacts.length} facts have NO verification record: [${unverifiedFacts.join(', ')}]`);
    }
  } else {
    console.log(`[DOK3 Context] ⚠️  No DOK1 facts found via dok2_fact_relations for these DOK2s!`);
  }

  // Build lookup maps
  const factsMap = new Map(factsData.map(f => [f.id, f]));
  const verificationsMap = new Map(verificationsData.map(v => [v.factId, v]));
  const pointsByDok2 = new Map<number, string[]>();
  for (const p of points) {
    const existing = pointsByDok2.get(p.summaryId) || [];
    existing.push(p.text);
    pointsByDok2.set(p.summaryId, existing);
  }
  const factRelsByDok2 = new Map<number, number[]>();
  for (const r of factRelations) {
    const existing = factRelsByDok2.get(r.summaryId) || [];
    existing.push(r.factId);
    factRelsByDok2.set(r.summaryId, existing);
  }

  // 7. Assemble linked DOK2s with their facts
  const linkedDok2s = summaries.map(s => {
    const dok2FactIds = factRelsByDok2.get(s.id) || [];
    const dok1Facts = dok2FactIds
      .map(fId => {
        const f = factsMap.get(fId);
        if (!f) return null;
        return {
          id: f.id,
          fact: f.fact,
          score: f.score,
          isGradeable: f.isGradeable,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return {
      id: s.id,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      displayTitle: s.displayTitle,
      grade: s.grade,
      points: pointsByDok2.get(s.id) || [],
      dok1Facts,
    };
  });

  // 8. Deduplicate evidence content by normalized sourceUrl
  const sourceEvidence = new Map<string, string>();
  for (const v of verificationsData) {
    if (v.evidenceContent && v.evidenceUrl) {
      const key = normalizeUrl(v.evidenceUrl);
      if (!sourceEvidence.has(key) || v.evidenceContent.length > (sourceEvidence.get(key)?.length ?? 0)) {
        sourceEvidence.set(key, v.evidenceContent);
      }
    }
  }

  return {
    insight,
    brainliftPurpose,
    linkedDok2s,
    sourceEvidence,
  };
}

/**
 * Save the full DOK3 grading result to the insight row.
 */
export async function saveDOK3GradeResult(
  insightId: number,
  result: {
    score: number;
    frameworkName: string;
    frameworkDescription: string;
    criteriaBreakdown: Record<string, { assessment: string; evidence: string }>;
    rationale: string;
    feedback: string;
    foundationIntegrityIndex: number;
    dok1FoundationScore: number;
    dok2SynthesisScore: number;
    traceabilityFlagged: boolean;
    traceabilityFlaggedSource: string | null;
    evaluatorModel: string;
  }
): Promise<void> {
  await db.update(dok3Insights)
    .set({
      score: result.score,
      frameworkName: result.frameworkName,
      frameworkDescription: result.frameworkDescription,
      criteriaBreakdown: result.criteriaBreakdown,
      rationale: result.rationale,
      feedback: result.feedback,
      foundationIntegrityIndex: result.foundationIntegrityIndex.toFixed(2),
      dok1FoundationScore: result.dok1FoundationScore.toFixed(2),
      dok2SynthesisScore: result.dok2SynthesisScore.toFixed(2),
      traceabilityFlagged: result.traceabilityFlagged,
      traceabilityFlaggedSource: result.traceabilityFlaggedSource,
      evaluatorModel: result.evaluatorModel,
      gradedAt: new Date(),
      status: 'graded' as DOK3InsightStatus,
    })
    .where(eq(dok3Insights.id, insightId));
}

/**
 * Update DOK3 insight status (for grading → graded / error transitions).
 */
export async function updateDOK3InsightStatus(
  insightId: number,
  brainliftId: number,
  status: DOK3InsightStatus
): Promise<void> {
  await db.update(dok3Insights)
    .set({ status })
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));
}

/**
 * Update source relevance rankings for a DOK3 insight.
 */
export async function updateDOK3SourceRankings(
  insightId: number,
  rankings: Record<string, number>
): Promise<void> {
  await db.update(dok3Insights)
    .set({ sourceRankings: rankings })
    .where(eq(dok3Insights.id, insightId));
}

/**
 * Get the mean DOK3 score for a brainlift (only graded insights with non-null scores).
 * Returns null if no graded DOK3 insights exist.
 */
export async function getDOK3MeanScore(brainliftId: number): Promise<number | null> {
  const [result] = await db.select({
    mean: sql<string | null>`AVG(${dok3Insights.score})`,
  }).from(dok3Insights)
    .where(and(
      eq(dok3Insights.brainliftId, brainliftId),
      eq(dok3Insights.status, 'graded'),
      sql`${dok3Insights.score} IS NOT NULL`
    ));

  return result?.mean ? parseFloat(result.mean) : null;
}
