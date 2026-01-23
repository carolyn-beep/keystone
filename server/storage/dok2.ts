/**
 * DOK2 Storage Layer
 *
 * Handles persistence of DOK2 summaries (owner's interpretation/synthesis of sources).
 * Each summary group corresponds to one source and contains multiple summary points.
 */

import {
  db, eq, inArray,
  dok2Summaries, dok2Points, dok2FactRelations,
} from './base';
import type { DOK2SummaryGroup } from '@shared/hierarchy-types';
import type { DOK2FailReason } from '@shared/schema';

/**
 * Shape of DOK2 summary with points and related facts, for API responses
 */
export interface DOK2SummaryWithPoints {
  id: number;
  category: string;
  sourceName: string;
  sourceUrl: string | null;
  workflowyNodeId: string | null;
  sourceWorkflowyNodeId: string | null;
  points: Array<{
    id: number;
    text: string;
    sortOrder: number;
  }>;
  relatedFactIds: number[];
  // DOK2 Grading fields
  grade: number | null;
  diagnosis: string | null;
  feedback: string | null;
  failReason: DOK2FailReason | null;
  sourceVerified: boolean | null;
}

/**
 * Extended DOK2SummaryGroup with grading fields for saving
 */
export interface DOK2SummaryGroupWithGrading extends DOK2SummaryGroup {
  grade?: number;
  diagnosis?: string;
  feedback?: string;
  failReason?: DOK2FailReason | null;
  sourceVerified?: boolean;
}

/**
 * Save DOK2 summaries with fact ID mapping
 *
 * @param brainliftId - The brainlift to save summaries for
 * @param summaries - Array of DOK2 summary groups from extraction (with optional grading)
 * @param factIdMap - Map from original fact ID (string) to database fact ID (number)
 */
export async function saveDOK2Summaries(
  brainliftId: number,
  summaries: DOK2SummaryGroupWithGrading[],
  factIdMap: Map<string, number>
): Promise<void> {
  if (summaries.length === 0) return;

  console.log(`[DOK2 Storage] Saving ${summaries.length} DOK2 summaries for brainlift ${brainliftId}`);

  for (const summary of summaries) {
    // Insert the summary group with grading fields
    const [insertedSummary] = await db.insert(dok2Summaries).values({
      brainliftId,
      category: summary.category,
      sourceName: summary.sourceName,
      sourceUrl: summary.sourceUrl,
      workflowyNodeId: summary.workflowyNodeId,
      sourceWorkflowyNodeId: summary.sourceWorkflowyNodeId,
      // Grading fields (optional, will be null if not graded)
      grade: summary.grade ?? null,
      diagnosis: summary.diagnosis ?? null,
      feedback: summary.feedback ?? null,
      gradedAt: summary.grade !== undefined ? new Date() : null,
      failReason: summary.failReason ?? null,
      sourceVerified: summary.sourceVerified ?? null,
    }).returning();

    // Insert summary points
    if (summary.points.length > 0) {
      await db.insert(dok2Points).values(
        summary.points.map((point, index) => ({
          summaryId: insertedSummary.id,
          text: point.text,
          sortOrder: index,
        }))
      );
    }

    // Insert fact relations (link DOK2 to related DOK1 facts)
    const relatedDbFactIds = summary.relatedDOK1Ids
      .map(originalId => factIdMap.get(originalId))
      .filter((id): id is number => id !== undefined);

    if (relatedDbFactIds.length > 0) {
      await db.insert(dok2FactRelations).values(
        relatedDbFactIds.map(factId => ({
          summaryId: insertedSummary.id,
          factId,
        }))
      );
    }

    console.log(`[DOK2 Storage] Saved summary "${summary.sourceName}" with ${summary.points.length} points, ${relatedDbFactIds.length} related facts`);
  }
}

/**
 * Get DOK2 summaries with points and related fact IDs for a brainlift
 */
export async function getDOK2Summaries(brainliftId: number): Promise<DOK2SummaryWithPoints[]> {
  // Get all summaries for the brainlift
  const summaries = await db.select().from(dok2Summaries)
    .where(eq(dok2Summaries.brainliftId, brainliftId));

  if (summaries.length === 0) return [];

  const summaryIds = summaries.map(s => s.id);

  // Get all points for these summaries
  const points = await db.select().from(dok2Points)
    .where(inArray(dok2Points.summaryId, summaryIds));

  // Get all fact relations for these summaries
  const factRelations = await db.select().from(dok2FactRelations)
    .where(inArray(dok2FactRelations.summaryId, summaryIds));

  // Build the result with nested points, related fact IDs, and grading fields
  return summaries.map(summary => ({
    id: summary.id,
    category: summary.category,
    sourceName: summary.sourceName,
    sourceUrl: summary.sourceUrl,
    workflowyNodeId: summary.workflowyNodeId,
    sourceWorkflowyNodeId: summary.sourceWorkflowyNodeId,
    points: points
      .filter(p => p.summaryId === summary.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(p => ({
        id: p.id,
        text: p.text,
        sortOrder: p.sortOrder ?? 0,
      })),
    relatedFactIds: factRelations
      .filter(r => r.summaryId === summary.id)
      .map(r => r.factId),
    // DOK2 Grading fields
    grade: summary.grade,
    diagnosis: summary.diagnosis,
    feedback: summary.feedback,
    failReason: summary.failReason as DOK2FailReason | null,
    sourceVerified: summary.sourceVerified,
  }));
}

/**
 * Delete all DOK2 data for a brainlift (used during re-imports)
 */
export async function deleteDOK2Summaries(brainliftId: number): Promise<void> {
  // Get all summary IDs first
  const summaries = await db.select({ id: dok2Summaries.id })
    .from(dok2Summaries)
    .where(eq(dok2Summaries.brainliftId, brainliftId));

  if (summaries.length === 0) return;

  const summaryIds = summaries.map(s => s.id);

  // Delete in order: fact relations → points → summaries
  await db.delete(dok2FactRelations).where(inArray(dok2FactRelations.summaryId, summaryIds));
  await db.delete(dok2Points).where(inArray(dok2Points.summaryId, summaryIds));
  await db.delete(dok2Summaries).where(eq(dok2Summaries.brainliftId, brainliftId));

  console.log(`[DOK2 Storage] Deleted ${summaries.length} DOK2 summaries for brainlift ${brainliftId}`);
}
