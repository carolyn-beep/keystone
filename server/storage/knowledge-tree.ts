/**
 * Knowledge Tree Storage Layer
 *
 * Handles Phase 3 knowledge tree queries: three-section list, item detail,
 * manual source creation, and extraction deletion.
 */

import {
  db, eq, and, sql, inArray, isNull,
  learningStreamItems, facts, dok2Summaries, dok2Points, dok2FactRelations, categories,
  type LearningStreamItem, type Category,
} from './base';
import { z } from 'zod';

/**
 * Auto-bookmark an LS item if it's still pending.
 * Called when an extraction (fact or summary) is linked to the item,
 * so it moves from "unprocessed" to "triaged" or "saved".
 */
export async function autoBookmarkIfPending(itemId: number): Promise<void> {
  await db.update(learningStreamItems)
    .set({ status: 'bookmarked' })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.status, 'pending'),
    ));
}

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

// ─── Category CRUD ──────────────────────────────────────────────────────────

/**
 * Category with source count for API responses
 */
export interface CategoryWithCount {
  id: number;
  name: string;
  sortOrder: number | null;
  sourceCount: number;
}

/**
 * Create a new category for a brainlift.
 */
export async function createCategory(
  brainliftId: number,
  name: string
): Promise<Category> {
  const [inserted] = await db.insert(categories).values({
    brainliftId,
    name,
  }).returning();

  return inserted;
}

/**
 * Update a category (rename and/or reorder).
 * IDOR-safe: includes brainliftId in the WHERE clause.
 * Returns the updated row, or null if not found.
 */
export async function updateCategory(
  categoryId: number,
  brainliftId: number,
  fields: { name?: string; sortOrder?: number | null }
): Promise<Category | null> {
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.sortOrder !== undefined) updates.sortOrder = fields.sortOrder;

  if (Object.keys(updates).length === 0) return null;

  const [updated] = await db.update(categories)
    .set(updates)
    .where(and(
      eq(categories.id, categoryId),
      eq(categories.brainliftId, brainliftId),
    ))
    .returning();

  return updated ?? null;
}

/**
 * Delete a category.
 * IDOR-safe: includes brainliftId in the WHERE clause.
 * LS items with this categoryId get SET NULL automatically via FK constraint.
 * Returns { success: true } or null if not found.
 */
export async function deleteCategory(
  categoryId: number,
  brainliftId: number
): Promise<{ success: true } | null> {
  const deleted = await db.delete(categories)
    .where(and(
      eq(categories.id, categoryId),
      eq(categories.brainliftId, brainliftId),
    ))
    .returning({ id: categories.id });

  if (deleted.length === 0) return null;
  return { success: true };
}

/**
 * List categories for a brainlift with source counts.
 * sourceCount = number of saved LS items (factCount >= 1 AND summaryCount >= 1)
 * assigned to each category.
 */
export async function getCategoriesWithCounts(
  brainliftId: number
): Promise<CategoryWithCount[]> {
  // Subquery: IDs of saved items (bookmarked with >= 1 fact and >= 1 summary)
  const savedItemIds = db
    .select({ id: learningStreamItems.id })
    .from(learningStreamItems)
    .leftJoin(facts, eq(facts.learningStreamItemId, learningStreamItems.id))
    .leftJoin(dok2Summaries, eq(dok2Summaries.learningStreamItemId, learningStreamItems.id))
    .where(and(
      eq(learningStreamItems.brainliftId, brainliftId),
      eq(learningStreamItems.status, 'bookmarked'),
    ))
    .groupBy(learningStreamItems.id)
    .having(and(
      sql`COUNT(DISTINCT ${facts.id}) >= 1`,
      sql`COUNT(DISTINCT ${dok2Summaries.id}) >= 1`,
    ))
    .as('saved_items');

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
      sourceCount: sql<number>`COUNT(${savedItemIds.id})::int`,
    })
    .from(categories)
    .leftJoin(
      savedItemIds,
      sql`${savedItemIds.id} IN (
        SELECT ${learningStreamItems.id} FROM ${learningStreamItems}
        WHERE ${learningStreamItems.categoryId} = ${categories.id}
      )`,
    )
    .where(eq(categories.brainliftId, brainliftId))
    .groupBy(categories.id)
    .orderBy(categories.sortOrder, categories.createdAt);

  return rows;
}

/**
 * Reassign an LS item's category.
 * IDOR-safe: includes brainliftId in the WHERE clause.
 * categoryId = null means uncategorized.
 */
export async function reassignItemCategory(
  itemId: number,
  brainliftId: number,
  categoryId: number | null
): Promise<void> {
  await db.update(learningStreamItems)
    .set({ categoryId })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ));
}

// ─── Manual CRUD Functions ──────────────────────────────────────────────────

/**
 * Get extraction counts for an item (fact and summary counts).
 */
export async function getExtractionCounts(
  itemId: number,
  brainliftId: number
): Promise<{ facts: number; summaries: number }> {
  const [factResult] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  })
    .from(facts)
    .where(and(
      eq(facts.learningStreamItemId, itemId),
      eq(facts.brainliftId, brainliftId),
    ));

  const [summaryResult] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  })
    .from(dok2Summaries)
    .where(and(
      eq(dok2Summaries.learningStreamItemId, itemId),
      eq(dok2Summaries.brainliftId, brainliftId),
    ));

  return {
    facts: factResult?.count ?? 0,
    summaries: summaryResult?.count ?? 0,
  };
}

/**
 * Create a manual fact linked to a specific LS item.
 * Computes sequential originalId within the brainlift.
 * Sets source = item.url for DOK3/DOK4 compatibility.
 */
export async function createManualFact(
  itemId: number,
  brainliftId: number,
  factText: string
): Promise<{
  id: number;
  originalId: string;
  fact: string;
  learningStreamItemId: number;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  // Verify item belongs to brainlift
  const [item] = await db.select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!item) return null;

  // Compute next originalId: max integer prefix + 1
  const [maxResult] = await db
    .select({
      maxId: sql<string>`COALESCE(MAX(
        CASE
          WHEN ${facts.originalId} ~ '^[0-9]+'
          THEN CAST(substring(${facts.originalId} from '^[0-9]+') AS integer)
          ELSE 0
        END
      ), 0)`,
    })
    .from(facts)
    .where(eq(facts.brainliftId, brainliftId));

  const nextId = (parseInt(maxResult?.maxId ?? '0') || 0) + 1;

  const [inserted] = await db.insert(facts).values({
    brainliftId,
    originalId: String(nextId),
    category: null,
    source: item.url,
    fact: factText,
    score: 0,
    isGradeable: true,
    learningStreamItemId: itemId,
  }).returning();

  await autoBookmarkIfPending(itemId);
  const counts = await getExtractionCounts(itemId, brainliftId);

  return {
    id: inserted.id,
    originalId: inserted.originalId,
    fact: inserted.fact,
    learningStreamItemId: itemId,
    extractionCounts: counts,
  };
}

/**
 * Update a manual fact. IDOR-safe: verifies item + brainlift ownership.
 */
export async function updateManualFact(
  factId: number,
  itemId: number,
  brainliftId: number,
  factText: string
): Promise<{
  id: number;
  originalId: string;
  fact: string;
  learningStreamItemId: number | null;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  const [updated] = await db.update(facts)
    .set({ fact: factText })
    .where(and(
      eq(facts.id, factId),
      eq(facts.learningStreamItemId, itemId),
      eq(facts.brainliftId, brainliftId),
    ))
    .returning();

  if (!updated) return null;

  const counts = await getExtractionCounts(itemId, brainliftId);

  return {
    id: updated.id,
    originalId: updated.originalId,
    fact: updated.fact,
    learningStreamItemId: updated.learningStreamItemId,
    extractionCounts: counts,
  };
}

/**
 * Delete a manual fact. IDOR-safe: verifies item + brainlift ownership.
 */
export async function deleteManualFact(
  factId: number,
  itemId: number,
  brainliftId: number
): Promise<{
  success: boolean;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  const [deleted] = await db.delete(facts)
    .where(and(
      eq(facts.id, factId),
      eq(facts.learningStreamItemId, itemId),
      eq(facts.brainliftId, brainliftId),
    ))
    .returning();

  if (!deleted) return null;

  const counts = await getExtractionCounts(itemId, brainliftId);

  return { success: true, extractionCounts: counts };
}

/**
 * Create a manual DOK2 summary linked to a specific LS item.
 * Sets sourceName = item.topic and sourceUrl = item.url for DOK3/DOK4 compatibility.
 */
export async function createManualSummary(
  itemId: number,
  brainliftId: number,
  points: string[],
  relatedFactIds: number[]
): Promise<{
  id: number;
  text: string[];
  relatedFactIds: number[];
  learningStreamItemId: number;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  // Verify item belongs to brainlift
  const [item] = await db.select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!item) return null;

  // Insert summary
  const [inserted] = await db.insert(dok2Summaries).values({
    brainliftId,
    category: null,
    sourceName: item.topic,
    sourceUrl: item.url,
    displayTitle: null,
    workflowyNodeId: null,
    sourceWorkflowyNodeId: null,
    learningStreamItemId: itemId,
  }).returning();

  // Insert points
  if (points.length > 0) {
    await db.insert(dok2Points).values(
      points.map((text, index) => ({
        summaryId: inserted.id,
        text,
        sortOrder: index,
      }))
    );
  }

  // Insert fact relations
  if (relatedFactIds.length > 0) {
    await db.insert(dok2FactRelations).values(
      relatedFactIds.map(factId => ({
        summaryId: inserted.id,
        factId,
      }))
    );
  }

  await autoBookmarkIfPending(itemId);
  const counts = await getExtractionCounts(itemId, brainliftId);

  return {
    id: inserted.id,
    text: points,
    relatedFactIds,
    learningStreamItemId: itemId,
    extractionCounts: counts,
  };
}

/**
 * Update a manual DOK2 summary. Replaces points and relations.
 * IDOR-safe: verifies item + brainlift ownership.
 */
export async function updateManualSummary(
  summaryId: number,
  itemId: number,
  brainliftId: number,
  points: string[],
  relatedFactIds: number[]
): Promise<{
  id: number;
  text: string[];
  relatedFactIds: number[];
  learningStreamItemId: number | null;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  // Verify summary belongs to item and brainlift
  const [summary] = await db.select()
    .from(dok2Summaries)
    .where(and(
      eq(dok2Summaries.id, summaryId),
      eq(dok2Summaries.learningStreamItemId, itemId),
      eq(dok2Summaries.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!summary) return null;

  // Delete existing points and relations
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, summaryId));
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.summaryId, summaryId));

  // Insert new points
  if (points.length > 0) {
    await db.insert(dok2Points).values(
      points.map((text, index) => ({
        summaryId,
        text,
        sortOrder: index,
      }))
    );
  }

  // Insert new relations
  if (relatedFactIds.length > 0) {
    await db.insert(dok2FactRelations).values(
      relatedFactIds.map(factId => ({
        summaryId,
        factId,
      }))
    );
  }

  const counts = await getExtractionCounts(itemId, brainliftId);

  return {
    id: summaryId,
    text: points,
    relatedFactIds,
    learningStreamItemId: summary.learningStreamItemId,
    extractionCounts: counts,
  };
}

/**
 * Delete a manual DOK2 summary with cascade (points + relations).
 * IDOR-safe: verifies item + brainlift ownership.
 */
export async function deleteManualSummary(
  summaryId: number,
  itemId: number,
  brainliftId: number
): Promise<{
  success: boolean;
  extractionCounts: { facts: number; summaries: number };
} | null> {
  // Verify summary belongs to item and brainlift
  const [summary] = await db.select({ id: dok2Summaries.id })
    .from(dok2Summaries)
    .where(and(
      eq(dok2Summaries.id, summaryId),
      eq(dok2Summaries.learningStreamItemId, itemId),
      eq(dok2Summaries.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!summary) return null;

  // Cascade delete: relations -> points -> summary
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.summaryId, summaryId));
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, summaryId));
  await db.delete(dok2Summaries).where(eq(dok2Summaries.id, summaryId));

  const counts = await getExtractionCounts(itemId, brainliftId);

  return { success: true, extractionCounts: counts };
}
