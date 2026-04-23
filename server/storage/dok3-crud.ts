/**
 * DOK3 CRUD Storage
 *
 * Create, edit, delete, and impact preview functions for DOK3 insights.
 * All functions are IDOR-safe: require brainliftId match.
 */

import {
  db, eq, and, inArray,
  dok3Insights, dok3InsightLinks, dok4Dok3Links, dok4Spovs,
} from './base';
import type { DOK3InsightStatus } from '@shared/schema';
import type { DeleteImpact, DeleteResult } from './dok1-crud';

/**
 * Create a new DOK3 insight with DOK2 links. Sets status to 'linked'.
 * Caller must validate multi-source requirement before calling.
 * Returns the new insight's ID.
 */
export async function createDok3Insight(params: {
  brainliftId: number;
  text: string;
  linkedDok2Ids: number[];
}): Promise<{ id: number }> {
  const [inserted] = await db.insert(dok3Insights).values({
    brainliftId: params.brainliftId,
    text: params.text,
    status: 'linked' as DOK3InsightStatus,
  }).returning({ id: dok3Insights.id });

  // Insert DOK2 links
  if (params.linkedDok2Ids.length > 0) {
    await db.insert(dok3InsightLinks).values(
      params.linkedDok2Ids.map(dok2SummaryId => ({
        insightId: inserted.id,
        dok2SummaryId,
      }))
    );
  }

  return { id: inserted.id };
}

export interface EditDok3Result {
  previousText: string;
  previousScore: number | null;
  previousFeedback: string | null;
  previousRationale: string | null;
  previousCriteriaBreakdown: Record<string, { assessment: string; evidence: string }> | null;
}

/**
 * Edit a DOK3 insight's text. Returns previous state for versioning.
 * Returns null if insight not found or wrong brainliftId (IDOR).
 */
export async function editDok3Insight(
  insightId: number,
  brainliftId: number,
  newText: string,
): Promise<EditDok3Result | null> {
  const [current] = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));

  if (!current) return null;

  const result: EditDok3Result = {
    previousText: current.text,
    previousScore: current.score,
    previousFeedback: current.feedback,
    previousRationale: current.rationale,
    previousCriteriaBreakdown: current.criteriaBreakdown as Record<string, { assessment: string; evidence: string }> | null,
  };

  await db.update(dok3Insights)
    .set({ text: newText, updatedAt: new Date() })
    .where(eq(dok3Insights.id, insightId));

  return result;
}

/**
 * Compute the impact of deleting a DOK3 insight.
 * Returns null if insight not found or wrong brainliftId.
 */
export async function getDok3DeleteImpact(
  insightId: number,
  brainliftId: number,
): Promise<DeleteImpact | null> {
  const [insight] = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));

  if (!insight) return null;

  // Find linked DOK4s
  const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
    .from(dok4Dok3Links)
    .where(eq(dok4Dok3Links.dok3InsightId, insightId));
  const dok4Ids = dok4Rels.map(r => r.spovId);

  let unlinkedItems: Array<{ id: number; dokLevel: number; text: string }> = [];
  if (dok4Ids.length > 0) {
    const dok4Details = await db.select({ id: dok4Spovs.id, text: dok4Spovs.text })
      .from(dok4Spovs)
      .where(inArray(dok4Spovs.id, dok4Ids));
    unlinkedItems = dok4Details.map(d => ({ id: d.id, dokLevel: 4, text: d.text }));
  }

  return {
    item: { id: insight.id, text: insight.text, score: insight.score },
    unlinkedItems,
    staleDok2Ids: [],
    staleDok3Ids: [],
    staleDok4Ids: dok4Ids,
  };
}

/**
 * Delete a DOK3 insight. Removes insight links, marks DOK4s stale.
 * Returns null if insight not found or wrong brainliftId.
 */
export async function deleteDok3Insight(
  insightId: number,
  brainliftId: number,
): Promise<DeleteResult | null> {
  const [insight] = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.id, insightId), eq(dok3Insights.brainliftId, brainliftId)));

  if (!insight) return null;

  // Find linked DOK4s before removing links
  const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
    .from(dok4Dok3Links)
    .where(eq(dok4Dok3Links.dok3InsightId, insightId));
  const dok4Ids = Array.from(new Set(dok4Rels.map(r => r.spovId)));

  // Remove DOK3 -> DOK4 links for this insight
  await db.delete(dok4Dok3Links).where(eq(dok4Dok3Links.dok3InsightId, insightId));

  // Mark affected DOK4s stale
  let markedStale = 0;
  if (dok4Ids.length > 0) {
    const staled = await db.update(dok4Spovs)
      .set({ isStale: true, staleReason: `DOK3 insight ${insightId} deleted` })
      .where(and(
        inArray(dok4Spovs.id, dok4Ids),
        eq(dok4Spovs.brainliftId, brainliftId),
      ))
      .returning({ id: dok4Spovs.id });
    markedStale += staled.length;
  }

  // Remove insight links (DOK2 -> DOK3)
  await db.delete(dok3InsightLinks).where(eq(dok3InsightLinks.insightId, insightId));

  // Delete the insight
  await db.delete(dok3Insights).where(eq(dok3Insights.id, insightId));

  return { deleted: true, impactSummary: { unlinked: dok4Ids.length, markedStale } };
}

export interface AddLinksResult {
  addedCount: number;
  existingItem: { id: number; text: string; score: number | null; status: string };
}

/**
 * Add DOK2 summary links to an existing DOK3 insight.
 * Skips already-linked DOK2s via onConflictDoNothing.
 * Returns null if insight not found or wrong brainliftId (IDOR).
 */
export async function addLinksToDok3Insight(params: {
  insightId: number;
  brainliftId: number;
  dok2Ids: number[];
}): Promise<AddLinksResult | null> {
  const [insight] = await db.select().from(dok3Insights)
    .where(and(eq(dok3Insights.id, params.insightId), eq(dok3Insights.brainliftId, params.brainliftId)));

  if (!insight) return null;

  let addedCount = 0;
  if (params.dok2Ids.length > 0) {
    const inserted = await db.insert(dok3InsightLinks)
      .values(params.dok2Ids.map(dok2SummaryId => ({
        insightId: params.insightId,
        dok2SummaryId,
      })))
      .onConflictDoNothing()
      .returning({ id: dok3InsightLinks.id });
    addedCount = inserted.length;
  }

  return {
    addedCount,
    existingItem: {
      id: insight.id,
      text: insight.text,
      score: insight.score,
      status: insight.status,
    },
  };
}
