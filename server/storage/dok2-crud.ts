/**
 * DOK2 CRUD Storage
 *
 * Create, edit, delete, and impact preview functions for DOK2 summaries.
 * All functions are IDOR-safe: require brainliftId match.
 */

import {
  db, eq, and, inArray, desc,
  dok2Summaries, dok2Points, dok2FactRelations,
  dok3InsightLinks, dok3Insights, dok4Dok3Links, dok4Spovs,
} from './base';
import type { DeleteImpact, DeleteResult } from './dok1-crud';

/**
 * Create a new DOK2 summary with points and optional fact relations.
 * Returns the new summary's ID. Grade starts as null (pending grading).
 */
export async function createDok2Summary(params: {
  brainliftId: number;
  sourceName: string;
  sourceUrl?: string;
  points: string[];
  relatedFactIds: number[];
}): Promise<{ id: number }> {
  const [inserted] = await db.insert(dok2Summaries).values({
    brainliftId: params.brainliftId,
    sourceName: params.sourceName,
    sourceUrl: params.sourceUrl ?? null,
    displayTitle: null,
    workflowyNodeId: null,
    sourceWorkflowyNodeId: null,
  }).returning({ id: dok2Summaries.id });

  // Insert points
  if (params.points.length > 0) {
    await db.insert(dok2Points).values(
      params.points.map((text, index) => ({
        summaryId: inserted.id,
        text,
        sortOrder: index,
      }))
    );
  }

  // Insert fact relations
  if (params.relatedFactIds.length > 0) {
    await db.insert(dok2FactRelations).values(
      params.relatedFactIds.map(factId => ({
        summaryId: inserted.id,
        factId,
      }))
    );
  }

  return { id: inserted.id };
}

export interface EditDok2Result {
  previousPoints: string[];
  previousScore: number | null;
  previousFeedback: string | null;
}

/**
 * Edit a DOK2 summary's points. Returns previous state for versioning.
 * Returns null if summary not found or wrong brainliftId (IDOR).
 */
export async function editDok2Summary(
  summaryId: number,
  brainliftId: number,
  newPoints: string[],
): Promise<EditDok2Result | null> {
  // Fetch current summary with IDOR check
  const [current] = await db.select().from(dok2Summaries)
    .where(and(eq(dok2Summaries.id, summaryId), eq(dok2Summaries.brainliftId, brainliftId)));

  if (!current) return null;

  // Fetch current points
  const currentPoints = await db.select().from(dok2Points)
    .where(eq(dok2Points.summaryId, summaryId))
    .orderBy(dok2Points.sortOrder);

  const result: EditDok2Result = {
    previousPoints: currentPoints.map(p => p.text),
    previousScore: current.grade,
    previousFeedback: current.feedback,
  };

  // Delete old points and insert new ones
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, summaryId));
  if (newPoints.length > 0) {
    await db.insert(dok2Points).values(
      newPoints.map((text, i) => ({ summaryId, text, sortOrder: i }))
    );
  }

  // Update timestamp
  await db.update(dok2Summaries)
    .set({ updatedAt: new Date() })
    .where(eq(dok2Summaries.id, summaryId));

  return result;
}

/**
 * Compute the impact of deleting a DOK2 summary.
 * Returns null if summary not found or wrong brainliftId.
 */
export async function getDok2DeleteImpact(
  summaryId: number,
  brainliftId: number,
): Promise<DeleteImpact | null> {
  const [summary] = await db.select().from(dok2Summaries)
    .where(and(eq(dok2Summaries.id, summaryId), eq(dok2Summaries.brainliftId, brainliftId)));

  if (!summary) return null;

  // Find linked DOK3s
  const dok3Rels = await db.select({ insightId: dok3InsightLinks.insightId })
    .from(dok3InsightLinks)
    .where(eq(dok3InsightLinks.dok2SummaryId, summaryId));
  const dok3Ids = dok3Rels.map(r => r.insightId);

  let unlinkedItems: Array<{ id: number; dokLevel: number; text: string }> = [];
  if (dok3Ids.length > 0) {
    const dok3Details = await db.select({ id: dok3Insights.id, text: dok3Insights.text })
      .from(dok3Insights)
      .where(inArray(dok3Insights.id, dok3Ids));
    unlinkedItems = dok3Details.map(d => ({ id: d.id, dokLevel: 3, text: d.text }));
  }

  // Find transitive DOK4 IDs
  let staleDok4Ids: number[] = [];
  if (dok3Ids.length > 0) {
    const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
      .from(dok4Dok3Links)
      .where(inArray(dok4Dok3Links.dok3InsightId, dok3Ids));
    staleDok4Ids = Array.from(new Set(dok4Rels.map(r => r.spovId)));
  }

  // Fetch points for text
  const points = await db.select().from(dok2Points)
    .where(eq(dok2Points.summaryId, summaryId))
    .orderBy(dok2Points.sortOrder);
  const text = points.map(p => p.text).join('\n');

  return {
    item: { id: summary.id, text, score: summary.grade },
    unlinkedItems,
    staleDok2Ids: [],
    staleDok3Ids: dok3Ids,
    staleDok4Ids,
  };
}

/**
 * Delete a DOK2 summary. Removes points, fact relations, insight links, marks DOK3s stale.
 * Returns null if summary not found or wrong brainliftId.
 */
export async function deleteDok2Summary(
  summaryId: number,
  brainliftId: number,
): Promise<DeleteResult | null> {
  const [summary] = await db.select().from(dok2Summaries)
    .where(and(eq(dok2Summaries.id, summaryId), eq(dok2Summaries.brainliftId, brainliftId)));

  if (!summary) return null;

  // Find linked DOK3s before removing links
  const dok3Rels = await db.select({ insightId: dok3InsightLinks.insightId })
    .from(dok3InsightLinks)
    .where(eq(dok3InsightLinks.dok2SummaryId, summaryId));
  const dok3Ids = Array.from(new Set(dok3Rels.map(r => r.insightId)));

  // Remove insight links
  await db.delete(dok3InsightLinks).where(eq(dok3InsightLinks.dok2SummaryId, summaryId));

  // Mark affected DOK3s stale
  let markedStale = 0;
  if (dok3Ids.length > 0) {
    const staled = await db.update(dok3Insights)
      .set({ isStale: true, staleReason: `DOK2 summary ${summaryId} deleted` })
      .where(and(
        inArray(dok3Insights.id, dok3Ids),
        eq(dok3Insights.brainliftId, brainliftId),
      ))
      .returning({ id: dok3Insights.id });
    markedStale += staled.length;

    // Propagate stale to DOK4s
    const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
      .from(dok4Dok3Links)
      .where(inArray(dok4Dok3Links.dok3InsightId, dok3Ids));
    const dok4Ids = Array.from(new Set(dok4Rels.map(r => r.spovId)));

    if (dok4Ids.length > 0) {
      const dok4Staled = await db.update(dok4Spovs)
        .set({ isStale: true, staleReason: `DOK2 summary ${summaryId} deleted (transitive)` })
        .where(and(
          inArray(dok4Spovs.id, dok4Ids),
          eq(dok4Spovs.brainliftId, brainliftId),
        ))
        .returning({ id: dok4Spovs.id });
      markedStale += dok4Staled.length;
    }
  }

  // Delete fact relations
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.summaryId, summaryId));

  // Delete points
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, summaryId));

  // Delete the summary
  await db.delete(dok2Summaries).where(eq(dok2Summaries.id, summaryId));

  return { deleted: true, impactSummary: { unlinked: dok3Ids.length, markedStale } };
}
