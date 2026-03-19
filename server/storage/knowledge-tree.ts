/**
 * Knowledge Tree Storage Layer
 *
 * Handles Phase 3 knowledge tree queries: three-section list, item detail,
 * manual source creation, and extraction deletion.
 */

import {
  db, eq, and, sql, inArray,
  learningStreamItems, facts, dok2Summaries, dok2Points, dok2FactRelations, categories,
  type LearningStreamItem,
} from './base';
import { z } from 'zod';

// URL validation schema - only allow http/https protocols to prevent XSS
const urlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Only http/https URLs allowed');

/**
 * Saved item view shape for the knowledge tree list
 */
export interface SavedItemView {
  id: number;
  title: string;
  url: string;
  type: string;
  author: string;
  excerpt: string;
  createdAt: Date;
  factCount: number;
  summaryCount: number;
  hasSavedMinimum: boolean;
  categoryId: number | null;
  categoryName: string | null;
}

/**
 * Knowledge tree response shape
 */
export interface KnowledgeTreeData {
  unprocessed: LearningStreamItem[];
  triaged: LearningStreamItem[];
  saved: SavedItemView[];
  categories: Array<{
    id: number;
    brainliftId: number;
    name: string;
    sortOrder: number | null;
    createdAt: Date;
  }>;
}

/**
 * Get the full knowledge tree for a brainlift.
 * Returns three sections: unprocessed (pending), triaged (bookmarked without saved minimum),
 * and saved (bookmarked with factCount >= 1 AND summaryCount >= 1).
 */
export async function getKnowledgeTree(brainliftId: number): Promise<KnowledgeTreeData> {
  // Get all LS items for the brainlift, plus count of linked facts and summaries for bookmarked items
  const [allItems, savedRows, allCategories] = await Promise.all([
    // All items for unprocessed/triaged
    db.select()
      .from(learningStreamItems)
      .where(eq(learningStreamItems.brainliftId, brainliftId))
      .orderBy(sql`${learningStreamItems.createdAt} DESC`),

    // Saved items: bookmarked with linked facts and summaries
    db.select({
      id: learningStreamItems.id,
      title: learningStreamItems.topic,
      url: learningStreamItems.url,
      type: learningStreamItems.type,
      author: learningStreamItems.author,
      excerpt: learningStreamItems.facts,
      createdAt: learningStreamItems.createdAt,
      categoryId: learningStreamItems.categoryId,
      categoryName: categories.name,
      factCount: sql<number>`COUNT(DISTINCT ${facts.id})::int`,
      summaryCount: sql<number>`COUNT(DISTINCT ${dok2Summaries.id})::int`,
    })
      .from(learningStreamItems)
      .leftJoin(facts, eq(facts.learningStreamItemId, learningStreamItems.id))
      .leftJoin(dok2Summaries, eq(dok2Summaries.learningStreamItemId, learningStreamItems.id))
      .leftJoin(categories, eq(categories.id, learningStreamItems.categoryId))
      .where(and(
        eq(learningStreamItems.brainliftId, brainliftId),
        eq(learningStreamItems.status, 'bookmarked'),
      ))
      .groupBy(learningStreamItems.id, categories.name)
      .having(and(
        sql`COUNT(DISTINCT ${facts.id}) >= 1`,
        sql`COUNT(DISTINCT ${dok2Summaries.id}) >= 1`,
      ))
      .orderBy(sql`${learningStreamItems.createdAt} DESC`),

    // All categories for this brainlift
    db.select()
      .from(categories)
      .where(eq(categories.brainliftId, brainliftId))
      .orderBy(categories.sortOrder, categories.createdAt),
  ]);

  // Build set of saved item IDs for exclusion from triaged
  const savedItemIds = new Set(savedRows.map(r => r.id));

  // Partition items
  const unprocessed = allItems.filter(item => item.status === 'pending');
  const triaged = allItems.filter(item =>
    item.status === 'bookmarked' && !savedItemIds.has(item.id)
  );

  const saved: SavedItemView[] = savedRows.map(row => ({
    id: row.id,
    title: row.title,
    url: row.url,
    type: row.type,
    author: row.author,
    excerpt: row.excerpt,
    createdAt: row.createdAt,
    factCount: row.factCount,
    summaryCount: row.summaryCount,
    hasSavedMinimum: true,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
  }));

  return { unprocessed, triaged, saved, categories: allCategories };
}

/**
 * Item detail response shape
 */
export interface ItemDetailResponse {
  learningStreamItem: LearningStreamItem;
  facts: Array<{
    id: number;
    originalId: string;
    fact: string;
    learningStreamItemId: number | null;
  }>;
  summaries: Array<{
    id: number;
    text: string[];
    learningStreamItemId: number | null;
    relatedFactIds: number[];
  }>;
  extractionCounts: {
    facts: number;
    summaries: number;
  };
  categoryId: number | null;
  categoryName: string | null;
}

/**
 * Get item detail with linked facts and DOK2 summaries.
 * IDOR-safe: includes brainliftId in the WHERE clause.
 */
export async function getItemDetail(
  itemId: number,
  brainliftId: number
): Promise<ItemDetailResponse | null> {
  // Get the LS item
  const [item] = await db.select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!item) return null;

  // Get category name if item has a categoryId
  let categoryName: string | null = null;
  if (item.categoryId) {
    const [cat] = await db.select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, item.categoryId))
      .limit(1);
    categoryName = cat?.name ?? null;
  }

  // Get linked facts
  const linkedFacts = await db.select({
    id: facts.id,
    originalId: facts.originalId,
    fact: facts.fact,
    learningStreamItemId: facts.learningStreamItemId,
  })
    .from(facts)
    .where(eq(facts.learningStreamItemId, itemId));

  // Get linked DOK2 summaries
  const linkedSummaries = await db.select()
    .from(dok2Summaries)
    .where(eq(dok2Summaries.learningStreamItemId, itemId));

  // For each summary, get points and related fact IDs
  const summaryResults = await Promise.all(
    linkedSummaries.map(async (summary) => {
      const [points, factRelations] = await Promise.all([
        db.select({ text: dok2Points.text })
          .from(dok2Points)
          .where(eq(dok2Points.summaryId, summary.id))
          .orderBy(dok2Points.sortOrder),
        db.select({ factId: dok2FactRelations.factId })
          .from(dok2FactRelations)
          .where(eq(dok2FactRelations.summaryId, summary.id)),
      ]);

      return {
        id: summary.id,
        text: points.map(p => p.text),
        learningStreamItemId: summary.learningStreamItemId,
        relatedFactIds: factRelations.map(r => r.factId),
      };
    })
  );

  return {
    learningStreamItem: item,
    facts: linkedFacts,
    summaries: summaryResults,
    extractionCounts: {
      facts: linkedFacts.length,
      summaries: summaryResults.length,
    },
    categoryId: item.categoryId,
    categoryName,
  };
}

/**
 * Manual source placeholder values.
 */
const MANUAL_SOURCE_DEFAULTS = {
  type: 'Manual Source',
  author: 'Unknown',
  time: 'Unknown',
  facts: 'Manual source added by user; extraction pending.',
} as const;

/**
 * Create a manual source LS item.
 * Sets source='manual', status='bookmarked', and fills placeholder metadata.
 * Does NOT handle duplicate URL check — caller must check beforehand.
 */
export async function createManualSource(
  brainliftId: number,
  url: string,
  title: string
): Promise<LearningStreamItem> {
  const validatedUrl = urlSchema.parse(url);

  const [inserted] = await db.insert(learningStreamItems).values({
    brainliftId,
    type: MANUAL_SOURCE_DEFAULTS.type,
    author: MANUAL_SOURCE_DEFAULTS.author,
    topic: title,
    time: MANUAL_SOURCE_DEFAULTS.time,
    facts: MANUAL_SOURCE_DEFAULTS.facts,
    url: validatedUrl,
    source: 'manual',
    status: 'bookmarked',
  }).returning();

  return inserted;
}

/**
 * Delete all facts and DOK2 summaries linked to a specific LS item.
 * The LS item itself stays bookmarked (reverts to triaged in the list).
 * IDOR-safe: facts and DOK2 summaries are filtered by learningStreamItemId,
 * and the caller verifies the item belongs to the brainlift.
 */
export async function deleteExtractions(
  itemId: number,
  brainliftId: number
): Promise<{ facts: number; summaries: number }> {
  // Get facts linked to this item (need brainliftId check for safety)
  const linkedFacts = await db.select({ id: facts.id })
    .from(facts)
    .where(and(
      eq(facts.learningStreamItemId, itemId),
      eq(facts.brainliftId, brainliftId),
    ));

  // Get DOK2 summaries linked to this item
  const linkedSummaries = await db.select({ id: dok2Summaries.id })
    .from(dok2Summaries)
    .where(and(
      eq(dok2Summaries.learningStreamItemId, itemId),
      eq(dok2Summaries.brainliftId, brainliftId),
    ));

  const factCount = linkedFacts.length;
  const summaryCount = linkedSummaries.length;

  // Delete facts (cascade will handle factVerifications if any)
  if (factCount > 0) {
    const factIds = linkedFacts.map(f => f.id);
    await db.delete(facts).where(inArray(facts.id, factIds));
  }

  // Delete DOK2 summaries (need to delete points and fact relations first)
  if (summaryCount > 0) {
    const summaryIds = linkedSummaries.map(s => s.id);
    await db.delete(dok2FactRelations).where(inArray(dok2FactRelations.summaryId, summaryIds));
    await db.delete(dok2Points).where(inArray(dok2Points.summaryId, summaryIds));
    await db.delete(dok2Summaries).where(inArray(dok2Summaries.id, summaryIds));
  }

  return { facts: factCount, summaries: summaryCount };
}
