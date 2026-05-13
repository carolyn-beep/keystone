import {
  and,
  asc,
  db,
  eq,
  isNull,
} from './base';
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
