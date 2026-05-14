import {
  and,
  asc,
  db,
  desc,
  eq,
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
  type Note,
  type Source,
} from '@shared/schema';
import { BadRequestError } from '../middleware/error-handler';

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
