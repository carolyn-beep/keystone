/**
 * DOK1 CRUD Storage
 *
 * Create, edit, delete, and impact preview functions for DOK1 facts.
 * All functions are IDOR-safe: require brainliftId match.
 */

import {
  db, eq, and, inArray, sql,
  facts, dok2Summaries, dok2FactRelations,
  dok3InsightLinks, dok3Insights, dok4Dok3Links, dok4Spovs,
} from './base';

/**
 * Create a new DOK1 fact. Returns the new fact's ID.
 * Generates a unique originalId and sets score=0 (pending grading).
 */
export async function createFact(params: {
  brainliftId: number;
  fact: string;
  source: string;
  category?: string;
}): Promise<{ id: number }> {
  // Generate unique originalId based on max existing prefix
  const [maxResult] = await db.select({
    maxId: sql<string>`COALESCE(MAX(
      CASE
        WHEN ${facts.originalId} ~ '^[0-9]+'
        THEN CAST(substring(${facts.originalId} from '^[0-9]+') AS integer)
        ELSE 0
      END
    ), 0)`,
  }).from(facts).where(eq(facts.brainliftId, params.brainliftId));

  const nextId = (parseInt(maxResult?.maxId ?? '0') || 0) + 1;
  const originalId = `${nextId}`;

  const [inserted] = await db.insert(facts).values({
    brainliftId: params.brainliftId,
    originalId,
    fact: params.fact,
    source: params.source,
    category: params.category ?? null,
    score: 0,
    isGradeable: true,
  }).returning({ id: facts.id });

  return { id: inserted.id };
}

export interface EditFactResult {
  previousText: string;
  previousScore: number | null;
  previousFeedback: string | null;
}

export interface DeleteImpact {
  item: { id: number; text: string; score: number | null };
  unlinkedItems: Array<{ id: number; dokLevel: number; text: string }>;
  staleDok2Ids: number[];
  staleDok3Ids: number[];
  staleDok4Ids: number[];
}

export interface DeleteResult {
  deleted: boolean;
  impactSummary: { unlinked: number; markedStale: number };
}

/**
 * Edit a DOK1 fact's text. Returns previous state for versioning.
 * Returns null if fact not found or wrong brainliftId (IDOR).
 */
export async function editFact(
  factId: number,
  brainliftId: number,
  newText: string,
): Promise<EditFactResult | null> {
  // Fetch current fact with IDOR check
  const [current] = await db.select().from(facts)
    .where(and(eq(facts.id, factId), eq(facts.brainliftId, brainliftId)));

  if (!current) return null;

  const result: EditFactResult = {
    previousText: current.fact,
    previousScore: current.score,
    previousFeedback: current.note,
  };

  // Update fact text + timestamp
  await db.update(facts)
    .set({ fact: newText, updatedAt: new Date() })
    .where(eq(facts.id, factId));

  return result;
}

/**
 * Compute the impact of deleting a fact.
 * Returns null if fact not found or wrong brainliftId.
 */
export async function getFactDeleteImpact(
  factId: number,
  brainliftId: number,
): Promise<DeleteImpact | null> {
  const [fact] = await db.select().from(facts)
    .where(and(eq(facts.id, factId), eq(facts.brainliftId, brainliftId)));

  if (!fact) return null;

  // Find linked DOK2s
  const dok2Rels = await db.select({ summaryId: dok2FactRelations.summaryId })
    .from(dok2FactRelations)
    .where(eq(dok2FactRelations.factId, factId));

  const dok2Ids = dok2Rels.map(r => r.summaryId);

  // Fetch DOK2 details for unlinkedItems
  let unlinkedItems: Array<{ id: number; dokLevel: number; text: string }> = [];
  if (dok2Ids.length > 0) {
    const dok2Details = await db.select({ id: dok2Summaries.id, sourceName: dok2Summaries.sourceName })
      .from(dok2Summaries)
      .where(inArray(dok2Summaries.id, dok2Ids));
    unlinkedItems = dok2Details.map(d => ({ id: d.id, dokLevel: 2, text: d.sourceName }));
  }

  // Find transitive DOK3 IDs (via DOK2 -> DOK3 links)
  let staleDok3Ids: number[] = [];
  if (dok2Ids.length > 0) {
    const dok3Rels = await db.select({ insightId: dok3InsightLinks.insightId })
      .from(dok3InsightLinks)
      .where(inArray(dok3InsightLinks.dok2SummaryId, dok2Ids));
    staleDok3Ids = Array.from(new Set(dok3Rels.map(r => r.insightId)));
  }

  // Find transitive DOK4 IDs (via DOK3 -> DOK4 links)
  let staleDok4Ids: number[] = [];
  if (staleDok3Ids.length > 0) {
    const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
      .from(dok4Dok3Links)
      .where(inArray(dok4Dok3Links.dok3InsightId, staleDok3Ids));
    staleDok4Ids = Array.from(new Set(dok4Rels.map(r => r.spovId)));
  }

  return {
    item: { id: fact.id, text: fact.fact, score: fact.score },
    unlinkedItems,
    staleDok2Ids: dok2Ids,
    staleDok3Ids,
    staleDok4Ids,
  };
}

/**
 * Delete a DOK1 fact. Removes relations, marks dependents stale, deletes the fact.
 * Returns null if fact not found or wrong brainliftId.
 */
export async function deleteFact(
  factId: number,
  brainliftId: number,
): Promise<DeleteResult | null> {
  const [fact] = await db.select().from(facts)
    .where(and(eq(facts.id, factId), eq(facts.brainliftId, brainliftId)));

  if (!fact) return null;

  // Find linked DOK2 IDs before removing relations
  const dok2Rels = await db.select({ summaryId: dok2FactRelations.summaryId })
    .from(dok2FactRelations)
    .where(eq(dok2FactRelations.factId, factId));
  const dok2Ids = dok2Rels.map(r => r.summaryId);

  // Remove fact relations
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.factId, factId));

  // Mark affected DOK2s stale
  let markedStale = 0;
  if (dok2Ids.length > 0) {
    const staled = await db.update(dok2Summaries)
      .set({ isStale: true, staleReason: `DOK1 fact ${factId} deleted` })
      .where(and(
        inArray(dok2Summaries.id, dok2Ids),
        eq(dok2Summaries.brainliftId, brainliftId),
      ))
      .returning({ id: dok2Summaries.id });
    markedStale += staled.length;

    // Propagate stale to DOK3s
    const dok3Rels = await db.select({ insightId: dok3InsightLinks.insightId })
      .from(dok3InsightLinks)
      .where(inArray(dok3InsightLinks.dok2SummaryId, dok2Ids));
    const dok3Ids = Array.from(new Set(dok3Rels.map(r => r.insightId)));

    if (dok3Ids.length > 0) {
      const dok3Staled = await db.update(dok3Insights)
        .set({ isStale: true, staleReason: `DOK1 fact ${factId} deleted (transitive)` })
        .where(and(
          inArray(dok3Insights.id, dok3Ids),
          eq(dok3Insights.brainliftId, brainliftId),
        ))
        .returning({ id: dok3Insights.id });
      markedStale += dok3Staled.length;

      // Propagate stale to DOK4s
      const dok4Rels = await db.select({ spovId: dok4Dok3Links.spovId })
        .from(dok4Dok3Links)
        .where(inArray(dok4Dok3Links.dok3InsightId, dok3Ids));
      const dok4Ids = Array.from(new Set(dok4Rels.map(r => r.spovId)));

      if (dok4Ids.length > 0) {
        const dok4Staled = await db.update(dok4Spovs)
          .set({ isStale: true, staleReason: `DOK1 fact ${factId} deleted (transitive)` })
          .where(and(
            inArray(dok4Spovs.id, dok4Ids),
            eq(dok4Spovs.brainliftId, brainliftId),
          ))
          .returning({ id: dok4Spovs.id });
        markedStale += dok4Staled.length;
      }
    }
  }

  // Delete the fact
  await db.delete(facts).where(eq(facts.id, factId));

  return { deleted: true, impactSummary: { unlinked: dok2Ids.length, markedStale } };
}
