/**
 * DOK4 Storage Layer
 *
 * Handles persistence of DOK4 SPOVs (Spiky Points of View) and their DOK3 links.
 */

import {
  db, eq, and, sql, inArray,
  dok4Spovs, dok4Dok3Links,
  dok3Insights, dok3InsightLinks,
  dok2Summaries, dok2Points, dok2FactRelations, facts,
  brainlifts, brainliftSources,
} from './base';
import type { DOK4SpovStatus } from '@shared/schema';
import type { DOK4SpovWithLinks, DOK4GradeResult, DOK4RejectionCategory, DOK4EvaluationContext } from '@shared/dok4-types';
import { computeDOK4FoundationIntegrity } from '@shared/dok4-foundation';
import { withJob } from '../utils/withJob';


/**
 * Save DOK4 SPOVs extracted from hierarchy (bulk insert with pending_linking status).
 * Returns array of created IDs.
 */
export async function saveDOK4Spovs(
  brainliftId: number,
  spovs: Array<{ text: string; workflowyNodeId?: string }>,
): Promise<number[]> {
  if (spovs.length === 0) return [];

  console.log(`[DOK4 Storage] Saving ${spovs.length} DOK4 SPOVs for brainlift ${brainliftId}`);

  const rows = await db.insert(dok4Spovs).values(
    spovs.map(spov => ({
      brainliftId,
      text: spov.text,
      workflowyNodeId: spov.workflowyNodeId ?? null,
      status: 'pending_linking' as DOK4SpovStatus,
    }))
  ).returning({ id: dok4Spovs.id });

  return rows.map(r => r.id);
}


/**
 * Get all DOK4 SPOVs for a brainlift, including linked DOK3 IDs and primary designation.
 * Filters by brainliftId for IDOR safety.
 */
export async function getDOK4Spovs(brainliftId: number): Promise<DOK4SpovWithLinks[]> {
  const spovs = await db.select().from(dok4Spovs)
    .where(eq(dok4Spovs.brainliftId, brainliftId))
    .orderBy(dok4Spovs.id);

  if (spovs.length === 0) return [];

  // Fetch all links for these SPOVs
  const spovIds = spovs.map(s => s.id);
  const links = await db.select().from(dok4Dok3Links)
    .where(sql`${dok4Dok3Links.spovId} IN (${sql.join(spovIds.map(id => sql`${id}`), sql`, `)})`);

  return spovs.map(spov => ({
    id: spov.id,
    brainliftId: spov.brainliftId,
    text: spov.text,
    workflowyNodeId: spov.workflowyNodeId,
    status: spov.status as DOK4SpovWithLinks['status'],
    rejectionReason: spov.rejectionReason,
    rejectionCategory: spov.rejectionCategory as DOK4SpovWithLinks['rejectionCategory'],
    foundationIntegrityIndex: spov.foundationIntegrityIndex,
    dok1FoundationScore: spov.dok1FoundationScore,
    dok2FoundationScore: spov.dok2FoundationScore,
    dok3FoundationScore: spov.dok3FoundationScore,
    foundationCeiling: spov.foundationCeiling,
    traceabilityFlagged: spov.traceabilityFlagged ?? false,
    traceabilityFlaggedSource: spov.traceabilityFlaggedSource,
    traceabilityOverlapSummary: spov.traceabilityOverlapSummary,
    divergenceQuestion: spov.divergenceQuestion,
    divergenceVanillaResponse: spov.divergenceVanillaResponse,
    qualityScoreRaw: spov.qualityScoreRaw,
    score: spov.score,
    positionSummary: spov.positionSummary,
    frameworkDependency: spov.frameworkDependency,
    keyEvidence: spov.keyEvidence as string[] | null,
    vulnerabilityPoints: spov.vulnerabilityPoints as string[] | null,
    criteriaBreakdown: spov.criteriaBreakdown as DOK4SpovWithLinks['criteriaBreakdown'],
    rationale: spov.rationale,
    feedback: spov.feedback,
    antimemeticAssessment: spov.antimemeticAssessment as DOK4SpovWithLinks['antimemeticAssessment'],
    evaluatorModel: spov.evaluatorModel,
    gradedAt: spov.gradedAt?.toISOString() ?? null,
    createdAt: spov.createdAt!.toISOString(),
    insightRankings: spov.insightRankings as Record<string, number> | null,
    linkedDok3InsightIds: links
      .filter(l => l.spovId === spov.id)
      .map(l => l.dok3InsightId),
    primaryDok3InsightId: links
      .find(l => l.spovId === spov.id && l.isPrimary)?.dok3InsightId ?? null,
  }));
}


/**
 * Link a DOK4 SPOV to DOK3 insights with primary designation.
 * Sets SPOV status to 'linked'. Verifies SPOV belongs to brainlift (IDOR protection).
 */
export async function linkDOK4Spov(
  spovId: number,
  brainliftId: number,
  links: Array<{ dok3InsightId: number; isPrimary: boolean }>,
): Promise<void> {
  if (links.length === 0) return;

  // Insert link records
  await db.insert(dok4Dok3Links).values(
    links.map(link => ({
      spovId,
      dok3InsightId: link.dok3InsightId,
      isPrimary: link.isPrimary,
    }))
  );

  // Update status to linked (with brainliftId guard for IDOR safety)
  await db.update(dok4Spovs)
    .set({ status: 'linked' as DOK4SpovStatus })
    .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));
}


/**
 * Update SPOV status (IDOR-safe via brainliftId guard).
 */
export async function updateDOK4SpovStatus(
  spovId: number,
  brainliftId: number,
  status: DOK4SpovStatus,
): Promise<void> {
  await db.update(dok4Spovs)
    .set({ status })
    .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));
}


/**
 * Save POV Validation rejection result. Sets status to 'rejected'.
 */
export async function saveDOK4Rejection(
  spovId: number,
  result: { rejectionReason: string; rejectionCategory: DOK4RejectionCategory },
): Promise<void> {
  await db.update(dok4Spovs)
    .set({
      status: 'rejected' as DOK4SpovStatus,
      rejectionReason: result.rejectionReason,
      rejectionCategory: result.rejectionCategory,
    })
    .where(eq(dok4Spovs.id, spovId));
}


/**
 * Save full grading result. Sets status to 'graded' and graded_at timestamp.
 * Foundation scores stored as text (matching DOK3 pattern for decimal precision).
 */
export async function saveDOK4GradeResult(
  spovId: number,
  result: DOK4GradeResult,
): Promise<void> {
  await db.update(dok4Spovs)
    .set({
      status: 'graded' as DOK4SpovStatus,
      // Foundation
      foundationIntegrityIndex: String(result.foundationIntegrityIndex),
      dok1FoundationScore: String(result.dok1FoundationScore),
      dok2FoundationScore: String(result.dok2FoundationScore),
      dok3FoundationScore: String(result.dok3FoundationScore),
      foundationCeiling: result.foundationCeiling,
      // Traceability
      traceabilityFlagged: result.traceabilityFlagged,
      traceabilityFlaggedSource: result.traceabilityFlaggedSource,
      traceabilityOverlapSummary: result.traceabilityOverlapSummary,
      // Divergence
      divergenceQuestion: result.divergenceQuestion,
      divergenceVanillaResponse: result.divergenceVanillaResponse,
      // Quality
      qualityScoreRaw: result.qualityScoreRaw,
      score: result.score,
      positionSummary: result.positionSummary,
      frameworkDependency: result.frameworkDependency,
      keyEvidence: result.keyEvidence,
      vulnerabilityPoints: null,
      criteriaBreakdown: result.criteriaBreakdown,
      rationale: result.rationale,
      feedback: result.feedback,
      // Antimemetic
      antimemeticAssessment: result.antimemeticAssessment,
      // Metadata
      evaluatorModel: result.evaluatorModel,
      gradedAt: new Date(),
    })
    .where(eq(dok4Spovs.id, spovId));
}


/**
 * Get mean DOK4 score for a brainlift.
 * Only includes SPOVs with status='graded' and non-null score.
 * Returns null if no graded SPOVs exist.
 */
export async function getDOK4MeanScore(brainliftId: number): Promise<number | null> {
  const [result] = await db.select({
    mean: sql<string | null>`AVG(${dok4Spovs.score})`,
  }).from(dok4Spovs)
    .where(and(
      eq(dok4Spovs.brainliftId, brainliftId),
      eq(dok4Spovs.status, 'graded'),
      sql`${dok4Spovs.score} IS NOT NULL`
    ));

  return result?.mean ? parseFloat(result.mean) : null;
}


/**
 * Assemble the full DOK4 evaluation context for a SPOV.
 * Traverses DOK4 -> DOK3 -> DOK2 -> DOK1 chains to build the complete grading input.
 * Returns null if SPOV not found or has no DOK3 links.
 */
export async function getSpovEvaluationContext(
  spovId: number,
): Promise<DOK4EvaluationContext | null> {
  // 1. Get the SPOV
  const [spov] = await db.select({
    id: dok4Spovs.id,
    text: dok4Spovs.text,
    brainliftId: dok4Spovs.brainliftId,
  }).from(dok4Spovs)
    .where(eq(dok4Spovs.id, spovId));

  if (!spov) return null;

  // 2. Get brainlift purpose
  const [bl] = await db.select({
    description: brainlifts.description,
  }).from(brainlifts)
    .where(eq(brainlifts.id, spov.brainliftId));

  const brainliftPurpose = bl?.description ?? '';

  // 3. Get DOK4->DOK3 links
  const dok4Links = await db.select({
    dok3InsightId: dok4Dok3Links.dok3InsightId,
    isPrimary: dok4Dok3Links.isPrimary,
  }).from(dok4Dok3Links)
    .where(eq(dok4Dok3Links.spovId, spovId));

  if (dok4Links.length === 0) return null;

  const dok3Ids = dok4Links.map(l => l.dok3InsightId);
  const primaryLink = dok4Links.find(l => l.isPrimary);

  // 4. Get DOK3 insights
  const dok3s = await db.select({
    id: dok3Insights.id,
    text: dok3Insights.text,
    score: dok3Insights.score,
    frameworkName: dok3Insights.frameworkName,
    frameworkDescription: dok3Insights.frameworkDescription,
  }).from(dok3Insights)
    .where(inArray(dok3Insights.id, dok3Ids));

  const primaryDok3Row = primaryLink
    ? dok3s.find(d => d.id === primaryLink.dok3InsightId)
    : dok3s[0]; // fallback to first if no primary designated

  if (!primaryDok3Row) return null;

  const primaryDok3 = {
    id: primaryDok3Row.id,
    text: primaryDok3Row.text,
    score: primaryDok3Row.score ?? 0,
    frameworkName: primaryDok3Row.frameworkName,
    frameworkDescription: primaryDok3Row.frameworkDescription,
  };

  const additionalDok3s = dok3s
    .filter(d => d.id !== primaryDok3.id)
    .map(d => ({
      id: d.id,
      text: d.text,
      score: d.score,
    }));

  // 5. Get DOK3->DOK2 links for all linked DOK3s
  const dok3Dok2Links = await db.select({
    insightId: dok3InsightLinks.insightId,
    dok2SummaryId: dok3InsightLinks.dok2SummaryId,
  }).from(dok3InsightLinks)
    .where(inArray(dok3InsightLinks.insightId, dok3Ids));

  const dok2Ids = Array.from(new Set(dok3Dok2Links.map(l => l.dok2SummaryId)));

  if (dok2Ids.length === 0) {
    // No DOK2 links -- compute foundation with empty arrays
    const foundation = computeDOK4FoundationIntegrity([], [], primaryDok3.score);
    return {
      brainliftPurpose,
      spovText: spov.text,
      primaryDok3,
      additionalDok3s,
      linkedDok2s: [],
      sourceEvidence: [],
      foundationIndex: foundation.index,
      foundationCeiling: foundation.ceiling,
      dok1FoundationScore: foundation.dok1Score,
      dok2FoundationScore: foundation.dok2Score,
      dok3FoundationScore: foundation.dok3Score,
      traceabilityResult: null,
      divergenceResult: null,
    };
  }

  // 6. Get DOK2 summaries
  const summaries = await db.select({
    id: dok2Summaries.id,
    sourceName: dok2Summaries.sourceName,
    sourceUrl: dok2Summaries.sourceUrl,
    grade: dok2Summaries.grade,
  }).from(dok2Summaries)
    .where(inArray(dok2Summaries.id, dok2Ids));

  // 7. Get DOK2 points
  const pointsRows = await db.select({
    summaryId: dok2Points.summaryId,
    text: dok2Points.text,
  }).from(dok2Points)
    .where(inArray(dok2Points.summaryId, dok2Ids));

  const pointsByDok2 = new Map<number, string[]>();
  for (const p of pointsRows) {
    const existing = pointsByDok2.get(p.summaryId) || [];
    existing.push(p.text);
    pointsByDok2.set(p.summaryId, existing);
  }

  // 8. Get DOK1 facts linked to DOK2s
  const factRelations = await db.select({
    summaryId: dok2FactRelations.summaryId,
    factId: dok2FactRelations.factId,
  }).from(dok2FactRelations)
    .where(inArray(dok2FactRelations.summaryId, dok2Ids));

  const allFactIds = Array.from(new Set(factRelations.map(r => r.factId)));

  let factsData: Array<{ id: number; fact: string; score: number; source: string | null }> = [];
  if (allFactIds.length > 0) {
    factsData = await db.select({
      id: facts.id,
      fact: facts.fact,
      score: facts.score,
      source: facts.source,
    }).from(facts)
      .where(inArray(facts.id, allFactIds));
  }

  const factsMap = new Map(factsData.map(f => [f.id, f]));
  const factRelsByDok2 = new Map<number, number[]>();
  for (const r of factRelations) {
    const existing = factRelsByDok2.get(r.summaryId) || [];
    existing.push(r.factId);
    factRelsByDok2.set(r.summaryId, existing);
  }

  // 9. Assemble linkedDok2s
  const linkedDok2s = summaries.map(s => {
    const dok2FactIds = factRelsByDok2.get(s.id) || [];
    const dok1Facts = dok2FactIds
      .map(fId => {
        const f = factsMap.get(fId);
        if (!f) return null;
        return { id: f.id, fact: f.fact, score: f.score, source: f.source };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return {
      id: s.id,
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      grade: s.grade,
      points: pointsByDok2.get(s.id) || [],
      dok1Facts,
    };
  });

  // 10. Get source evidence from brainlift_sources
  const sources = await db.select({
    name: brainliftSources.name,
    url: brainliftSources.url,
    surroundingContext: brainliftSources.surroundingContext,
  }).from(brainliftSources)
    .where(eq(brainliftSources.brainliftId, spov.brainliftId));

  const sourceEvidence = sources.map(s => ({
    sourceName: s.name ?? '',
    sourceUrl: s.url,
    content: s.surroundingContext,
  }));

  // 11. Compute foundation integrity
  const dok1Scores = factsData.map(f => f.score);
  const dok2Grades = summaries.filter(s => s.grade !== null).map(s => s.grade!);
  const foundation = computeDOK4FoundationIntegrity(dok1Scores, dok2Grades, primaryDok3.score);

  return {
    brainliftPurpose,
    spovText: spov.text,
    primaryDok3,
    additionalDok3s,
    linkedDok2s,
    sourceEvidence,
    foundationIndex: foundation.index,
    foundationCeiling: foundation.ceiling,
    dok1FoundationScore: foundation.dok1Score,
    dok2FoundationScore: foundation.dok2Score,
    dok3FoundationScore: foundation.dok3Score,
    traceabilityResult: null,
    divergenceResult: null,
  };
}


/**
 * Check if dependent DOK4 SPOVs can be graded after a DOK3 insight completes grading.
 * For each DOK4 SPOV linked to the given DOK3 insight:
 *   - Check if ALL linked DOK3 insights now have status='graded'
 *   - If yes and SPOV status is 'linked': queue dok4:grade job
 * Returns count of queued jobs.
 */
export async function triggerDependentDOK4Grading(
  dok3InsightId: number,
  brainliftId: number,
): Promise<number> {
  // 1. Find all DOK4 SPOVs linked to this DOK3 insight
  const linkedSpovs = await db.select({
    spovId: dok4Dok3Links.spovId,
  }).from(dok4Dok3Links)
    .where(eq(dok4Dok3Links.dok3InsightId, dok3InsightId));

  if (linkedSpovs.length === 0) return 0;

  const spovIds = Array.from(new Set(linkedSpovs.map(l => l.spovId)));

  let queued = 0;

  for (const spovId of spovIds) {
    // 2. Check SPOV status -- only queue if 'linked'
    const [spov] = await db.select({
      id: dok4Spovs.id,
      status: dok4Spovs.status,
    }).from(dok4Spovs)
      .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));

    if (!spov || spov.status !== 'linked') continue;

    // 3. Get ALL DOK3 insight IDs linked to this SPOV
    const allLinks = await db.select({
      dok3InsightId: dok4Dok3Links.dok3InsightId,
    }).from(dok4Dok3Links)
      .where(eq(dok4Dok3Links.spovId, spovId));

    const allDok3Ids = allLinks.map(l => l.dok3InsightId);

    // 4. Check if ALL linked DOK3 insights are graded
    const dok3Statuses = await db.select({
      id: dok3Insights.id,
      status: dok3Insights.status,
    }).from(dok3Insights)
      .where(inArray(dok3Insights.id, allDok3Ids));

    const allGraded = dok3Statuses.every(d => d.status === 'graded');

    if (allGraded) {
      // 5. Queue dok4:grade job
      try {
        await withJob('dok4:grade')
          .forPayload({ spovId, brainliftId })
          .queue();
        queued++;
        console.log(`[DOK4 Trigger] Queued grading for SPOV ${spovId} (all ${allDok3Ids.length} DOK3s graded)`);
      } catch (err) {
        console.error(`[DOK4 Trigger] Failed to queue grading for SPOV ${spovId}:`, err);
      }
    }
  }

  return queued;
}

/**
 * Set insight relevance rankings for a DOK4 SPOV (pre-computed by dok4InsightRanker).
 */
export async function setDOK4InsightRankings(
  spovId: number,
  rankings: Record<string, number>,
): Promise<void> {
  await db.update(dok4Spovs)
    .set({ insightRankings: rankings })
    .where(eq(dok4Spovs.id, spovId));
}
