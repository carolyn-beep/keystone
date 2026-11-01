/**
 * DOK Item Stale Flag Management
 *
 * Handles transitive stale flag propagation through the DOK link graph,
 * dismissal, and querying of stale items.
 *
 * Link graph: facts -> dok2_fact_relations -> dok2_summaries
 *             dok2_summaries -> dok3_insight_links -> dok3_insights
 *             dok3_insights -> dok4_dok3_links -> dok4_spovs
 */

import { db } from '../db';
import {
  facts, dok2Summaries, dok3Insights, dok4Spovs,
  dok2FactRelations, dok3InsightLinks, dok4Dok3Links,
} from '@shared/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';

interface PropagateParams {
  dokLevel: 1 | 2 | 3 | 4;
  itemId: number;
  brainliftId: number;
  reason: string;
}

interface PropagateResult {
  dok2Count: number;
  dok3Count: number;
  dok4Count: number;
}

/**
 * Propagate stale flags transitively from an edited item through the DOK link graph.
 * Returns the count of items marked stale at each downstream level.
 */
export async function propagateStaleFlags(params: PropagateParams): Promise<PropagateResult> {
  const { dokLevel, itemId, brainliftId, reason } = params;

  let dok2Count = 0;
  let dok3Count = 0;
  let dok4Count = 0;

  // DOK4 is leaf level -- no propagation
  if (dokLevel === 4) {
    return { dok2Count: 0, dok3Count: 0, dok4Count: 0 };
  }

  // Step 1: Find affected DOK2 IDs (only if starting from DOK1)
  let staleDok2Ids: number[] = [];
  if (dokLevel === 1) {
    const dok2Rows = await db
      .select({ summaryId: dok2FactRelations.summaryId })
      .from(dok2FactRelations)
      .where(eq(dok2FactRelations.factId, itemId));

    staleDok2Ids = dok2Rows.map(r => r.summaryId);

    if (staleDok2Ids.length > 0) {
      // Mark DOK2s stale (scoped to brainlift)
      const updated = await db
        .update(dok2Summaries)
        .set({ isStale: true, staleReason: reason })
        .where(and(
          inArray(dok2Summaries.id, staleDok2Ids),
          eq(dok2Summaries.brainliftId, brainliftId),
        ))
        .returning({ id: dok2Summaries.id });
      dok2Count = updated.length;
    }
  }

  // Step 2: Find affected DOK3 IDs
  let staleDok3Ids: number[] = [];
  if (dokLevel <= 2) {
    // Source DOK2 IDs: either from step 1 or from the edited item itself
    const sourceDok2Ids = dokLevel === 1 ? staleDok2Ids : [itemId];

    if (sourceDok2Ids.length > 0) {
      const dok3Rows = await db
        .select({ insightId: dok3InsightLinks.insightId })
        .from(dok3InsightLinks)
        .where(inArray(dok3InsightLinks.dok2SummaryId, sourceDok2Ids));

      staleDok3Ids = dok3Rows.map(r => r.insightId);

      if (staleDok3Ids.length > 0) {
        const updated = await db
          .update(dok3Insights)
          .set({ isStale: true, staleReason: reason })
          .where(and(
            inArray(dok3Insights.id, staleDok3Ids),
            eq(dok3Insights.brainliftId, brainliftId),
          ))
          .returning({ id: dok3Insights.id });
        dok3Count = updated.length;
      }
    }
  }

  // Step 3: Find affected DOK4 IDs
  if (dokLevel <= 3) {
    // Source DOK3 IDs: either from step 2 or from the edited item itself
    const sourceDok3Ids = dokLevel === 3 ? [itemId] : staleDok3Ids;

    if (sourceDok3Ids.length > 0) {
      const dok4Rows = await db
        .select({ spovId: dok4Dok3Links.spovId })
        .from(dok4Dok3Links)
        .where(inArray(dok4Dok3Links.dok3InsightId, sourceDok3Ids));

      const staleDok4Ids = dok4Rows.map(r => r.spovId);

      if (staleDok4Ids.length > 0) {
        const updated = await db
          .update(dok4Spovs)
          .set({ isStale: true, staleReason: reason })
          .where(and(
            inArray(dok4Spovs.id, staleDok4Ids),
            eq(dok4Spovs.brainliftId, brainliftId),
          ))
          .returning({ id: dok4Spovs.id });
        dok4Count = updated.length;
      }
    }
  }

  return { dok2Count, dok3Count, dok4Count };
}

/**
 * Dismiss the stale flag on a specific item.
 * Requires brainliftId match for IDOR safety.
 */
export async function dismissStaleFlag(
  dokLevel: 1 | 2 | 3 | 4,
  itemId: number,
  brainliftId: number,
): Promise<void> {
  const table = getDokTable(dokLevel);
  await db
    .update(table)
    .set({ isStale: false, staleReason: null })
    .where(and(
      eq(table.id, itemId),
      eq(table.brainliftId, brainliftId),
    ));
}

/**
 * Get all stale item IDs for a brainlift, grouped by DOK level.
 */
interface StaleItem {
  id: number;
  text: string | null;
  staleReason: string | null;
}

export async function getStaleItems(brainliftId: number): Promise<{
  dok1: StaleItem[];
  dok2: StaleItem[];
  dok3: StaleItem[];
  dok4: StaleItem[];
}> {
  const [dok1Rows, dok2Rows, dok3Rows, dok4Rows] = await Promise.all([
    db.select({ id: facts.id, text: facts.fact, staleReason: facts.staleReason }).from(facts)
      .where(and(eq(facts.brainliftId, brainliftId), eq(facts.isStale, true))),
    db.select({ id: dok2Summaries.id, text: dok2Summaries.displayTitle, staleReason: dok2Summaries.staleReason }).from(dok2Summaries)
      .where(and(eq(dok2Summaries.brainliftId, brainliftId), eq(dok2Summaries.isStale, true))),
    db.select({ id: dok3Insights.id, text: dok3Insights.text, staleReason: dok3Insights.staleReason }).from(dok3Insights)
      .where(and(eq(dok3Insights.brainliftId, brainliftId), eq(dok3Insights.isStale, true))),
    db.select({ id: dok4Spovs.id, text: dok4Spovs.text, staleReason: dok4Spovs.staleReason }).from(dok4Spovs)
      .where(and(eq(dok4Spovs.brainliftId, brainliftId), eq(dok4Spovs.isStale, true))),
  ]);

  return { dok1: dok1Rows, dok2: dok2Rows, dok3: dok3Rows, dok4: dok4Rows };
}

/**
 * Helper to get the right DOK table reference for a given level.
 */
function getDokTable(dokLevel: 1 | 2 | 3 | 4) {
  switch (dokLevel) {
    case 1: return facts;
    case 2: return dok2Summaries;
    case 3: return dok3Insights;
    case 4: return dok4Spovs;
  }
}
