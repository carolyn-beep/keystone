/**
 * DOK4 Storage Layer
 *
 * Handles persistence of DOK4 SPOVs (Spiky Points of View) and their DOK3 links.
 */

import {
  db, eq, and, sql,
  dok4Spovs, dok4Dok3Links,
} from './base';
import type { DOK4SpovStatus } from '@shared/schema';
import type { DOK4SpovWithLinks, DOK4GradeResult, DOK4RejectionCategory } from '@shared/dok4-types';


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
      vulnerabilityPoints: result.vulnerabilityPoints,
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
