import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNull,
  sql,
} from './base';
import { ilike, or } from 'drizzle-orm';
import {
  categories,
  learningStreamItems,
  notes,
  sources,
  type InsertNote,
  type InsertSource,
  type LearningStreamItem,
  type Note,
  type Source,
} from '@shared/schema';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';

/**
 * Transaction handle type for tx-aware storage helpers.
 *
 * Helpers that take this type can be composed by route handlers under
 * their own `db.transaction(...)` callback without nesting transactions.
 */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CreateSourceInput = Omit<InsertSource, 'id' | 'brainliftId' | 'createdAt' | 'updatedAt'>;
export type UpdateSourceInput = Partial<CreateSourceInput>;
export type SourceWithCategoryName = Source & { categoryName: string };

export type CreateNoteInput = Omit<InsertNote, 'id' | 'brainliftId' | 'createdAt' | 'updatedAt'>;
export type UpdateNoteInput = Partial<CreateNoteInput>;

export const SECOND_BRAIN_LIST_PAGE_SIZE = 30;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  hasMore: boolean;
}

export interface ListSourcesOptions {
  page?: number;
  q?: string;
}

export interface ListSourcesResult {
  items: SourceWithCategoryName[];
  pagination: PaginationMeta;
}

export interface ListNotesOptions {
  page?: number;
  q?: string;
  sourceId?: number;
  unlinkedOnly?: boolean;
}

export interface ListNotesResult {
  items: Note[];
  pagination: PaginationMeta;
}

export interface CategorySummary {
  id: number;
  name: string;
  sortOrder: number | null;
  sourceCount: number;
}

export interface SecondBrainSummary {
  sourceCount: number;
  noteCount: number;
  linkedNoteCount: number;
  unlinkedNoteCount: number;
  categoryCount: number;
  categories: Array<{ id: number; name: string; sourceCount: number }>;
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function normalizePage(page: number | undefined): number {
  if (page == null || !Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.floor(page);
}

function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

async function ensureCategoryBelongsToBrainlift(categoryId: number, brainliftId: number): Promise<void> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(
      eq(categories.id, categoryId),
      eq(categories.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!category) {
    throw new BadRequestError('Category does not belong to this brainlift');
  }
}

async function ensureSourceBelongsToBrainlift(sourceId: number, brainliftId: number): Promise<void> {
  const [source] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(
      eq(sources.id, sourceId),
      eq(sources.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!source) {
    throw new BadRequestError('Source does not belong to this brainlift');
  }
}

async function ensureLearningStreamItemBelongsToBrainlift(itemId: number, brainliftId: number): Promise<void> {
  const [item] = await db
    .select({ id: learningStreamItems.id })
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!item) {
    throw new BadRequestError('Learning stream item does not belong to this brainlift');
  }
}

function ensureNoteContent(content: string | null | undefined): void {
  if (content != null && content.trim().length === 0) {
    throw new BadRequestError('Note content cannot be empty');
  }
}

export async function createSource(
  brainliftId: number,
  input: CreateSourceInput,
): Promise<Source> {
  await ensureCategoryBelongsToBrainlift(input.categoryId, brainliftId);

  if (input.learningStreamItemId != null) {
    await ensureLearningStreamItemBelongsToBrainlift(input.learningStreamItemId, brainliftId);
  }

  const [source] = await db
    .insert(sources)
    .values({
      ...input,
      brainliftId,
    })
    .returning();

  return source;
}

export async function getSourcesByBrainlift(brainliftId: number): Promise<SourceWithCategoryName[]> {
  const rows = await db
    .select({
      id: sources.id,
      brainliftId: sources.brainliftId,
      title: sources.title,
      url: sources.url,
      author: sources.author,
      categoryId: sources.categoryId,
      extractedContent: sources.extractedContent,
      learningStreamItemId: sources.learningStreamItemId,
      // Spec 03 FR1: surface spec-01 enrichment fields. Without these the
      // v2 cards have no metadata to render.
      type: sources.type,
      keyInsights: sources.keyInsights,
      length: sources.length,
      whyMatters: sources.whyMatters,
      createdAt: sources.createdAt,
      updatedAt: sources.updatedAt,
      categoryName: categories.name,
    })
    .from(sources)
    .innerJoin(categories, eq(sources.categoryId, categories.id))
    .where(eq(sources.brainliftId, brainliftId))
    .orderBy(asc(sources.createdAt), asc(sources.id));

  return rows;
}

export async function getSourceForBrainlift(
  sourceId: number,
  brainliftId: number,
): Promise<Source | null> {
  const [source] = await db
    .select()
    .from(sources)
    .where(and(
      eq(sources.id, sourceId),
      eq(sources.brainliftId, brainliftId),
    ))
    .limit(1);

  return source ?? null;
}

export async function updateSourceForBrainlift(
  sourceId: number,
  brainliftId: number,
  patch: UpdateSourceInput,
): Promise<Source | null> {
  if (patch.categoryId != null) {
    await ensureCategoryBelongsToBrainlift(patch.categoryId, brainliftId);
  }

  if (patch.learningStreamItemId != null) {
    await ensureLearningStreamItemBelongsToBrainlift(patch.learningStreamItemId, brainliftId);
  }

  const [source] = await db
    .update(sources)
    .set({
      ...stripUndefined(patch as Record<string, unknown>),
      updatedAt: new Date(),
    })
    .where(and(
      eq(sources.id, sourceId),
      eq(sources.brainliftId, brainliftId),
    ))
    .returning();

  return source ?? null;
}

export async function deleteSourceForBrainlift(
  sourceId: number,
  brainliftId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(sources)
    .where(and(
      eq(sources.id, sourceId),
      eq(sources.brainliftId, brainliftId),
    ))
    .returning({ id: sources.id });

  return deleted.length > 0;
}

/**
 * Spec 03 FR2 — bulk delete sources scoped to a single brainlift.
 *
 * Returns the number of rows actually deleted. The route layer compares
 * the requested count vs returned count to detect cross-brainlift ids
 * and surface a 404 (IDOR-safe enumeration prevention).
 *
 * Empty `sourceIds` short-circuits to 0 (avoids a no-op `IN ()` query
 * which some drivers reject).
 */
export async function bulkDeleteSources(
  brainliftId: number,
  sourceIds: number[],
): Promise<number> {
  if (sourceIds.length === 0) {
    return 0;
  }

  const deleted = await db
    .delete(sources)
    .where(and(
      inArray(sources.id, sourceIds),
      eq(sources.brainliftId, brainliftId),
    ))
    .returning({ id: sources.id });

  return deleted.length;
}

/**
 * Spec 03 FR3 — bulk recategorize sources scoped to a single brainlift.
 *
 * Validates the target category belongs to this brainlift first. Then
 * runs a single UPDATE filtered by `id IN (...) AND brainlift_id = $2`
 * so cross-brainlift ids are silently skipped (route layer surfaces a
 * 404 if the returned count is less than requested).
 *
 * Empty `sourceIds` short-circuits to 0.
 */
export async function bulkUpdateSourceCategories(
  brainliftId: number,
  sourceIds: number[],
  categoryId: number,
): Promise<number> {
  await ensureCategoryBelongsToBrainlift(categoryId, brainliftId);

  if (sourceIds.length === 0) {
    return 0;
  }

  const updated = await db
    .update(sources)
    .set({ categoryId, updatedAt: new Date() })
    .where(and(
      inArray(sources.id, sourceIds),
      eq(sources.brainliftId, brainliftId),
    ))
    .returning({ id: sources.id });

  return updated.length;
}

export async function createNote(
  brainliftId: number,
  input: CreateNoteInput,
): Promise<Note> {
  ensureNoteContent(input.content);

  if (input.sourceId != null) {
    await ensureSourceBelongsToBrainlift(input.sourceId, brainliftId);
  }

  if (input.categoryId != null) {
    await ensureCategoryBelongsToBrainlift(input.categoryId, brainliftId);
  }

  const [note] = await db
    .insert(notes)
    .values({
      ...input,
      brainliftId,
    })
    .returning();

  return note;
}

export async function getNotesByBrainlift(
  brainliftId: number,
  opts: { sourceId?: number | null } = {},
): Promise<Note[]> {
  const sourcePredicate = opts.sourceId === undefined
    ? undefined
    : opts.sourceId === null
      ? isNull(notes.sourceId)
      : eq(notes.sourceId, opts.sourceId);

  return db
    .select()
    .from(notes)
    .where(and(
      eq(notes.brainliftId, brainliftId),
      sourcePredicate,
    ))
    .orderBy(asc(notes.createdAt), asc(notes.id));
}

export async function getNoteForBrainlift(
  noteId: number,
  brainliftId: number,
): Promise<Note | null> {
  const [note] = await db
    .select()
    .from(notes)
    .where(and(
      eq(notes.id, noteId),
      eq(notes.brainliftId, brainliftId),
    ))
    .limit(1);

  return note ?? null;
}

export async function updateNoteForBrainlift(
  noteId: number,
  brainliftId: number,
  patch: UpdateNoteInput,
): Promise<Note | null> {
  ensureNoteContent(patch.content);

  if (patch.sourceId != null) {
    await ensureSourceBelongsToBrainlift(patch.sourceId, brainliftId);
  }

  if (patch.categoryId != null) {
    await ensureCategoryBelongsToBrainlift(patch.categoryId, brainliftId);
  }

  const [note] = await db
    .update(notes)
    .set({
      ...stripUndefined(patch as Record<string, unknown>),
      updatedAt: new Date(),
    })
    .where(and(
      eq(notes.id, noteId),
      eq(notes.brainliftId, brainliftId),
    ))
    .returning();

  return note ?? null;
}

export async function deleteNoteForBrainlift(
  noteId: number,
  brainliftId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(notes)
    .where(and(
      eq(notes.id, noteId),
      eq(notes.brainliftId, brainliftId),
    ))
    .returning({ id: notes.id });

  return deleted.length > 0;
}

/**
 * Bulk delete notes by id, scoped to a single brainlift. Notes not owned
 * by `brainliftId` are silently skipped (IDOR-safe). Returns the count
 * of rows actually deleted.
 *
 * Uses a single `WHERE id IN (...) AND brainliftId = ?` query (no
 * per-id round trips).
 */
export async function bulkDeleteNotes(
  brainliftId: number,
  ids: number[],
): Promise<{ deleted: number }> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deleted: 0 };
  }

  const deleted = await db
    .delete(notes)
    .where(and(
      inArray(notes.id, ids),
      eq(notes.brainliftId, brainliftId),
    ))
    .returning({ id: notes.id });

  return { deleted: deleted.length };
}

/**
 * Bulk update the `categoryId` of notes owned by a brainlift. Passing
 * `categoryId: null` clears the category (notes allow nullable
 * categories; sources do not). Returns the count of rows actually
 * updated.
 */
export async function bulkUpdateNoteCategories(
  brainliftId: number,
  ids: number[],
  categoryId: number | null,
): Promise<{ updated: number }> {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { updated: 0 };
  }

  if (categoryId !== null) {
    await ensureCategoryBelongsToBrainlift(categoryId, brainliftId);
  }

  const updated = await db
    .update(notes)
    .set({
      categoryId,
      updatedAt: new Date(),
    })
    .where(and(
      inArray(notes.id, ids),
      eq(notes.brainliftId, brainliftId),
    ))
    .returning({ id: notes.id });

  return { updated: updated.length };
}

export async function listSources(
  brainliftId: number,
  opts: ListSourcesOptions = {},
): Promise<ListSourcesResult> {
  const page = normalizePage(opts.page);
  const pageSize = SECOND_BRAIN_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const trimmedQ = opts.q?.trim();
  const qPattern = trimmedQ ? `%${escapeLikePattern(trimmedQ)}%` : null;

  const filters = [eq(sources.brainliftId, brainliftId)];
  if (qPattern) {
    const matcher = or(
      ilike(sources.title, qPattern),
      ilike(sources.url, qPattern),
      ilike(sources.author, qPattern),
      ilike(categories.name, qPattern),
    );
    if (matcher) {
      filters.push(matcher);
    }
  }

  const whereClause = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: sources.id,
        brainliftId: sources.brainliftId,
        title: sources.title,
        url: sources.url,
        author: sources.author,
        categoryId: sources.categoryId,
        extractedContent: sources.extractedContent,
        learningStreamItemId: sources.learningStreamItemId,
        // Spec 03 FR1: same enrichment surface as getSourcesByBrainlift.
        type: sources.type,
        keyInsights: sources.keyInsights,
        length: sources.length,
        whyMatters: sources.whyMatters,
        createdAt: sources.createdAt,
        updatedAt: sources.updatedAt,
        categoryName: categories.name,
      })
      .from(sources)
      .innerJoin(categories, eq(sources.categoryId, categories.id))
      .where(whereClause)
      .orderBy(desc(sources.createdAt), desc(sources.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sources)
      .innerJoin(categories, eq(sources.categoryId, categories.id))
      .where(whereClause),
  ]);

  const totalItems = totalRow[0]?.count ?? 0;

  return {
    items: rows,
    pagination: {
      page,
      pageSize,
      totalItems,
      hasMore: offset + rows.length < totalItems,
    },
  };
}

export async function listNotes(
  brainliftId: number,
  opts: ListNotesOptions = {},
): Promise<ListNotesResult> {
  const page = normalizePage(opts.page);
  const pageSize = SECOND_BRAIN_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const trimmedQ = opts.q?.trim();
  const qPattern = trimmedQ ? `%${escapeLikePattern(trimmedQ)}%` : null;

  const filters = [eq(notes.brainliftId, brainliftId)];
  if (opts.sourceId != null) {
    filters.push(eq(notes.sourceId, opts.sourceId));
  } else if (opts.unlinkedOnly) {
    filters.push(isNull(notes.sourceId));
  }
  if (qPattern) {
    filters.push(ilike(notes.content, qPattern));
  }

  const whereClause = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(notes)
      .where(whereClause)
      .orderBy(desc(notes.createdAt), desc(notes.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notes)
      .where(whereClause),
  ]);

  const totalItems = totalRow[0]?.count ?? 0;

  return {
    items: rows,
    pagination: {
      page,
      pageSize,
      totalItems,
      hasMore: offset + rows.length < totalItems,
    },
  };
}

export async function listCategories(brainliftId: number): Promise<CategorySummary[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
      sourceCount: sql<number>`count(${sources.id})::int`,
    })
    .from(categories)
    .leftJoin(sources, eq(sources.categoryId, categories.id))
    .where(eq(categories.brainliftId, brainliftId))
    .groupBy(categories.id, categories.name, categories.sortOrder)
    .orderBy(sql`${categories.sortOrder} asc nulls last`, asc(categories.name));

  return rows;
}

export async function getSecondBrainSummary(brainliftId: number): Promise<SecondBrainSummary> {
  const [sourceCountRow, noteCountsRow, categoriesRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sources)
      .where(eq(sources.brainliftId, brainliftId)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        linked: sql<number>`count(${notes.sourceId})::int`,
      })
      .from(notes)
      .where(eq(notes.brainliftId, brainliftId)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        sourceCount: sql<number>`count(${sources.id})::int`,
      })
      .from(categories)
      .leftJoin(sources, eq(sources.categoryId, categories.id))
      .where(eq(categories.brainliftId, brainliftId))
      .groupBy(categories.id, categories.name),
  ]);

  const sourceCount = sourceCountRow[0]?.count ?? 0;
  const noteCount = noteCountsRow[0]?.total ?? 0;
  const linkedNoteCount = noteCountsRow[0]?.linked ?? 0;
  const unlinkedNoteCount = noteCount - linkedNoteCount;

  return {
    sourceCount,
    noteCount,
    linkedNoteCount,
    unlinkedNoteCount,
    categoryCount: categoriesRows.length,
    categories: sourceCount > 0
      ? categoriesRows.map((row) => ({
          id: row.id,
          name: row.name,
          sourceCount: row.sourceCount,
        }))
      : [],
  };
}

// ─── Second Brain v2: Categories Tab (spec 05) ──────────────────────────────

/**
 * Category row enriched with source + note counts, used by the Second Brain
 * Categories sub-tab. Distinct from the knowledge-tree CategoryWithCount,
 * which counts saved learning stream items (different semantic).
 */
export interface CategoryWithSourceAndNoteCount {
  id: number;
  name: string;
  sortOrder: number | null;
  sourceCount: number;
  noteCount: number;
}

/**
 * Single grouped query: per-category source count (from `sources`) and note
 * count (from `notes`). LEFT JOINs ensure categories with zero sources or
 * zero notes still appear with 0 counts. Notes whose categoryId is null
 * are not associated with any category and so are not counted toward any
 * row.
 *
 * Ordering: sort_order ASC NULLS LAST, then name ASC. Matches the manual
 * default sort the UI presents.
 */
export async function getCategoriesWithCountsForSecondBrain(
  brainliftId: number,
): Promise<CategoryWithSourceAndNoteCount[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      sortOrder: categories.sortOrder,
      sourceCount: sql<number>`count(distinct ${sources.id})::int`,
      noteCount: sql<number>`count(distinct ${notes.id})::int`,
    })
    .from(categories)
    .leftJoin(sources, eq(sources.categoryId, categories.id))
    .leftJoin(notes, eq(notes.categoryId, categories.id))
    .where(eq(categories.brainliftId, brainliftId))
    .groupBy(categories.id, categories.name, categories.sortOrder)
    .orderBy(sql`${categories.sortOrder} asc nulls last`, asc(categories.name));

  return rows;
}

/**
 * Rewrite every passed category's sort_order to its index in the list.
 *
 * Validation:
 *   - orderedIds must contain no duplicates.
 *   - orderedIds.length must match the brainlift's total category count.
 *   - every id must belong to the brainlift (IDOR-safe).
 *
 * The UPDATE uses a single statement with `unnest($1::int[]) WITH ORDINALITY`
 * so all rows are rewritten at once. The WHERE clause includes brainlift_id
 * so even if a foreign id slipped past validation, no other brainlift's
 * rows could be mutated.
 */
export async function reorderCategories(
  brainliftId: number,
  orderedIds: number[],
): Promise<void> {
  // Duplicate guard.
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length) {
    throw new BadRequestError('orderedIds contains duplicate ids');
  }

  // Length + ownership guard via a single SELECT round-trip.
  const existing = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.brainliftId, brainliftId));

  if (existing.length !== orderedIds.length) {
    throw new BadRequestError(
      `orderedIds length (${orderedIds.length}) does not match brainlift category count (${existing.length})`,
    );
  }

  const existingIds = new Set(existing.map((row) => row.id));
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      throw new NotFoundError('Category not found in this brainlift');
    }
  }

  // Empty list → nothing to do (validated above as matching 0 categories).
  if (orderedIds.length === 0) return;

  // All ids are integers (already validated they exist in DB as integers).
  const idsLiteral = orderedIds.map((id) => Number(id)).join(',');

  // Single UPDATE using unnest WITH ORDINALITY. WITH ORDINALITY returns
  // 1-based positions; we subtract 1 so sort_order matches the 0-based
  // index in orderedIds. The brainlift_id condition is belt-and-suspenders
  // alongside the ownership check above.
  await db.execute(sql`
    UPDATE ${categories} AS c
    SET sort_order = u.ord - 1
    FROM unnest(ARRAY[${sql.raw(idsLiteral)}]::int[]) WITH ORDINALITY AS u(id, ord)
    WHERE c.id = u.id
      AND c.brainlift_id = ${brainliftId}
  `);
}

// ============================================================================
// Spec 01 (pedagogy/reader-notes): tx-aware helpers for atomic note save.
//
// The reader's note composer needs a single round-trip that resolves the
// source (existing OR auto-bookmark from a Research Stream item) and the
// category (existing OR create inline) and inserts the note, all inside
// one DB transaction. The two helpers below are the composable building
// blocks for that route handler; both take a `tx` so the caller owns the
// transaction boundary and no nested transactions occur.
// ============================================================================

/**
 * Find-or-insert a category by exact name within a brainlift.
 *
 * - Trims the input name and rejects whitespace-only with BadRequestError.
 * - Exact-match SELECT first (case-sensitive); returns the existing row if
 *   found, without inserting a duplicate.
 * - On miss, INSERTs a new row and returns it.
 * - `23505` unique-violation defensive catch: there is no unique index on
 *   `(brainlift_id, name)` today (see shared/schema.ts), so this branch is
 *   a no-op for current production behavior. It is kept so that if a
 *   future migration adds the index, this helper becomes race-safe with
 *   zero code change.
 *
 * Operates inside the passed `tx`. Caller owns the transaction boundary.
 */
export async function ensureCategoryByName(
  tx: DbTx,
  brainliftId: number,
  name: string,
): Promise<{ id: number; name: string }> {
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) {
    throw new BadRequestError('categoryName cannot be empty');
  }

  const [existing] = await tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(
      eq(categories.brainliftId, brainliftId),
      eq(categories.name, trimmed),
    ))
    .limit(1);

  if (existing) {
    return { id: existing.id, name: existing.name };
  }

  try {
    const [inserted] = await tx
      .insert(categories)
      .values({
        brainliftId,
        name: trimmed,
      })
      .returning({ id: categories.id, name: categories.name });

    return { id: inserted.id, name: inserted.name };
  } catch (error: unknown) {
    // Drizzle wraps pg errors in DrizzleQueryError; the actual pg error
    // (with .code) lives on err.cause. See CLAUDE.md "Error Handling".
    const maybeErr = error as { code?: string; cause?: { code?: string } };
    const pgCode = maybeErr?.cause?.code ?? maybeErr?.code;
    if (pgCode === '23505') {
      const [winner] = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(and(
          eq(categories.brainliftId, brainliftId),
          eq(categories.name, trimmed),
        ))
        .limit(1);
      if (winner) {
        return { id: winner.id, name: winner.name };
      }
    }
    throw error;
  }
}

/**
 * Tx-aware extraction of the LSI→source mirror logic previously inlined in
 * `bookmarkResearchItemWithSource` (server/routes/learning-stream.ts).
 *
 * Inside the caller-provided `tx`:
 *   1. Validates `categoryId` belongs to `brainliftId` (BadRequestError on miss).
 *   2. Loads the learning_stream_items row by (id, brainliftId);
 *      NotFoundError if missing or foreign.
 *   3. Flips the LSI to status='bookmarked' and bumps updatedAt.
 *   4. INSERTs a mirrored `sources` row with enrichment fields
 *      (type/keyInsights/length/whyMatters) copied from the LSI.
 *      Uses onConflictDoNothing on (brainliftId, url); on conflict, falls
 *      back to a SELECT of the existing source row (enrichment fields are
 *      NOT overwritten, preserving any user edits).
 *
 * Returns `{ source, item, created }` where `created=true` iff the INSERT
 * actually produced a row (i.e., the LSI was not already mirrored).
 *
 * The public wrapper in server/routes/learning-stream.ts drops the
 * `created` flag for its caller (PATCH /learning-stream/:itemId/bookmark
 * does not need it); the new POST /notes/from-reader handler in
 * server/routes/second-brain.ts uses `created` to populate the response's
 * `autoBookmarked` flag.
 */
export async function ensureSourceFromLearningStreamItem(
  tx: DbTx,
  args: { brainliftId: number; itemId: number; categoryId: number },
): Promise<{ source: Source; item: LearningStreamItem; created: boolean }> {
  const { brainliftId, itemId, categoryId } = args;

  const [category] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(
      eq(categories.id, categoryId),
      eq(categories.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!category) {
    throw new BadRequestError('Category does not belong to this brainlift');
  }

  const [item] = await tx
    .select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .limit(1);

  if (!item) {
    throw new NotFoundError('Item not found or does not belong to this brainlift');
  }

  const [updatedItem] = await tx
    .update(learningStreamItems)
    .set({
      status: 'bookmarked',
      updatedAt: new Date(),
    })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId),
    ))
    .returning();

  if (!updatedItem) {
    throw new NotFoundError('Item not found or does not belong to this brainlift');
  }

  const [insertedSource] = await tx
    .insert(sources)
    .values({
      brainliftId,
      title: item.topic,
      url: item.url,
      author: item.author,
      categoryId,
      extractedContent: item.extractedContent,
      learningStreamItemId: item.id,
      // Second Brain v2 enrichment fields — mirrored 1:1 from the LSI.
      // All four are nullable on the LSI side too, so they may pass
      // through as null.
      type: item.type,
      keyInsights: item.facts,
      length: item.time,
      whyMatters: item.aiRationale,
    })
    .onConflictDoNothing({
      target: [sources.brainliftId, sources.url],
    })
    .returning();

  if (insertedSource) {
    return { source: insertedSource, item: updatedItem, created: true };
  }

  // onConflictDoNothing path: the source already exists for this URL.
  // Adopt it as-is; do NOT patch its enrichment fields (preserves user
  // edits between re-bookmarks).
  const [existingSource] = await tx
    .select()
    .from(sources)
    .where(and(
      eq(sources.brainliftId, brainliftId),
      eq(sources.url, item.url),
    ))
    .limit(1);

  if (!existingSource) {
    throw new NotFoundError('Source not found after bookmark mirror');
  }

  return { source: existingSource, item: updatedItem, created: false };
}
