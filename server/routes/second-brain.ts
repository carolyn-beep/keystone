import { Router, type Request, type Response } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { extractContent } from '../services/content-extractor';
import { fetchAuthorFromUrl } from '../services/author-extractor';

export const secondBrainRouter = Router();

function parseNumericId(rawValue: string | undefined, label: string): number {
  const parsed = Number.parseInt(String(rawValue), 10);
  if (Number.isNaN(parsed)) {
    throw new BadRequestError(`Invalid ${label} ID`);
  }
  return parsed;
}

function parseOptionalNumericQuery(value: unknown, label: string): number | undefined {
  if (value == null) {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return parsed;
}

function parseRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestError(`${field} is required`);
  }
  return value.trim();
}

function parseOptionalNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestError(`${field} must be a number`);
  }
  return value;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '23505' || maybeError.cause?.code === '23505';
}

function isSourceCategoryRestrict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as {
    constraint?: string;
    cause?: { constraint?: string };
  };
  return maybeError.constraint === 'sources_category_id_fkey'
    || maybeError.cause?.constraint === 'sources_category_id_fkey';
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export async function listSourcesHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const categoryId = parseOptionalNumericQuery(req.query.categoryId, 'categoryId');
  const sources = await storage.getSourcesByBrainlift(brainlift.id);
  res.json({
    sources: categoryId == null
      ? sources
      : sources.filter((source) => source.categoryId === categoryId),
  });
}

export async function getSourceHandler(req: Request, res: Response): Promise<void> {
  const sourceId = parseNumericId(req.params.id, 'source');
  const source = await storage.getSourceForBrainlift(sourceId, req.brainlift!.id);
  if (!source) {
    throw new NotFoundError('Source not found');
  }
  res.json(source);
}

export async function createSourceHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const title = parseRequiredString(body, 'title');
  const url = parseRequiredString(body, 'url');
  const author = parseRequiredString(body, 'author');
  const categoryId = parseOptionalNumber(body.categoryId, 'categoryId');
  if (typeof categoryId !== 'number') {
    throw new BadRequestError('categoryId is required');
  }
  const learningStreamItemId = parseOptionalNumber(body.learningStreamItemId, 'learningStreamItemId');
  if (learningStreamItemId === null) {
    throw new BadRequestError('learningStreamItemId must be a number');
  }

  try {
    const source = await storage.createSource(req.brainlift!.id, {
      title,
      url,
      author,
      categoryId,
      extractedContent: body.extractedContent as any,
      learningStreamItemId,
    });
    res.status(201).json(source);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = (await storage.getSourcesByBrainlift(req.brainlift!.id))
      .find((source) => source.url === url);
    if (!existing) {
      throw error;
    }
    res.status(200).json(existing);
  }
}

export async function updateSourceHandler(req: Request, res: Response): Promise<void> {
  const sourceId = parseNumericId(req.params.id, 'source');
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch.title = parseRequiredString(body, 'title');
  if (body.url !== undefined) patch.url = parseRequiredString(body, 'url');
  if (body.author !== undefined) patch.author = parseRequiredString(body, 'author');
  if (body.categoryId !== undefined) {
    const categoryId = parseOptionalNumber(body.categoryId, 'categoryId');
    if (typeof categoryId !== 'number') {
      throw new BadRequestError('categoryId must be a number');
    }
    patch.categoryId = categoryId;
  }
  if (body.extractedContent !== undefined) patch.extractedContent = body.extractedContent;

  const source = await storage.updateSourceForBrainlift(sourceId, req.brainlift!.id, patch as any);
  if (!source) {
    throw new NotFoundError('Source not found');
  }
  res.json(source);
}

export async function deleteSourceHandler(req: Request, res: Response): Promise<void> {
  const sourceId = parseNumericId(req.params.id, 'source');
  const deleted = await storage.deleteSourceForBrainlift(sourceId, req.brainlift!.id);
  if (!deleted) {
    throw new NotFoundError('Source not found');
  }
  res.sendStatus(204);
}

/**
 * Validates and returns an array of positive integer source ids from the
 * request body's `ids` field. Throws BadRequestError on any malformed
 * input so the handler can stay focused on storage + status.
 */
function parseSourceIdsBody(body: Record<string, unknown>): number[] {
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestError('ids must be a non-empty array of source ids');
  }
  if (!raw.every((v) => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v))) {
    throw new BadRequestError('ids must contain only integers');
  }
  return raw as number[];
}

/**
 * Spec 03 FR2 — bulk delete sources.
 *
 * The storage layer's WHERE clause silently drops cross-brainlift ids,
 * so we compare the returned count to the requested count and throw
 * NotFoundError when they differ. That hides whether the id existed in
 * another brainlift (vs not at all), which is the IDOR-safe behavior.
 */
export async function bulkDeleteSourcesHandler(req: Request, res: Response): Promise<void> {
  const ids = parseSourceIdsBody(req.body as Record<string, unknown>);
  const deletedCount = await storage.bulkDeleteSources(req.brainlift!.id, ids);

  if (deletedCount !== ids.length) {
    throw new NotFoundError('One or more sources not found');
  }

  res.sendStatus(204);
}

/**
 * Spec 03 FR3 — bulk recategorize sources.
 *
 * Returns { updated: number } on success. Cross-brainlift categoryId is
 * surfaced by the storage layer as a BadRequestError. Cross-brainlift
 * source ids surface as a 404 (same IDOR pattern as bulk-delete).
 */
export async function bulkRecategorizeSourcesHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const ids = parseSourceIdsBody(body);

  const categoryId = parseOptionalNumber(body.categoryId, 'categoryId');
  if (typeof categoryId !== 'number') {
    throw new BadRequestError('categoryId is required');
  }

  const updatedCount = await storage.bulkUpdateSourceCategories(req.brainlift!.id, ids, categoryId);

  if (updatedCount !== ids.length) {
    throw new NotFoundError('One or more sources not found');
  }

  res.json({ updated: updatedCount });
}

export async function listNotesHandler(req: Request, res: Response): Promise<void> {
  const sourceId = req.query.sourceId === 'null'
    ? null
    : parseOptionalNumericQuery(req.query.sourceId, 'sourceId');
  const notes = await storage.getNotesByBrainlift(req.brainlift!.id, { sourceId });
  res.json({ notes });
}

export async function getNoteHandler(req: Request, res: Response): Promise<void> {
  const noteId = parseNumericId(req.params.id, 'note');
  const note = await storage.getNoteForBrainlift(noteId, req.brainlift!.id);
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  res.json(note);
}

export async function createNoteHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const content = parseRequiredString(body, 'content');
  const sourceId = parseOptionalNumber(body.sourceId, 'sourceId');
  const categoryId = parseOptionalNumber(body.categoryId, 'categoryId');

  const note = await storage.createNote(req.brainlift!.id, {
    content,
    sourceId,
    categoryId,
  });
  res.status(201).json(note);
}

export async function updateNoteHandler(req: Request, res: Response): Promise<void> {
  const noteId = parseNumericId(req.params.id, 'note');
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.content !== undefined) patch.content = parseRequiredString(body, 'content');
  if (body.sourceId !== undefined) patch.sourceId = parseOptionalNumber(body.sourceId, 'sourceId');
  if (body.categoryId !== undefined) patch.categoryId = parseOptionalNumber(body.categoryId, 'categoryId');

  const note = await storage.updateNoteForBrainlift(noteId, req.brainlift!.id, patch as any);
  if (!note) {
    throw new NotFoundError('Note not found');
  }
  res.json(note);
}

export async function deleteNoteHandler(req: Request, res: Response): Promise<void> {
  const noteId = parseNumericId(req.params.id, 'note');
  const deleted = await storage.deleteNoteForBrainlift(noteId, req.brainlift!.id);
  if (!deleted) {
    throw new NotFoundError('Note not found');
  }
  res.sendStatus(204);
}

function parseIdArray(body: Record<string, unknown>): number[] {
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestError('ids must be a non-empty array');
  }
  const ids: number[] = [];
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
      throw new BadRequestError('ids must contain only integers');
    }
    ids.push(value);
  }
  return ids;
}

export async function bulkDeleteNotesHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const ids = parseIdArray(body);
  const result = await storage.bulkDeleteNotes(req.brainlift!.id, ids);
  res.json(result);
}

export async function bulkRecategorizeNotesHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const ids = parseIdArray(body);

  // categoryId must be present (number or null); undefined is invalid.
  if (!('categoryId' in body)) {
    throw new BadRequestError('categoryId is required (use null to clear)');
  }

  const categoryRaw = body.categoryId;
  let categoryId: number | null;
  if (categoryRaw === null) {
    categoryId = null;
  } else if (typeof categoryRaw === 'number' && Number.isFinite(categoryRaw) && Number.isInteger(categoryRaw)) {
    categoryId = categoryRaw;
  } else {
    throw new BadRequestError('categoryId must be an integer or null');
  }

  const result = await storage.bulkUpdateNoteCategories(req.brainlift!.id, ids, categoryId);
  res.json(result);
}

export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  const categories = await storage.getCategoriesWithCounts(req.brainlift!.id);
  res.json({ categories });
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const name = parseRequiredString(req.body as Record<string, unknown>, 'name');
  const category = await storage.createCategory(req.brainlift!.id, name);
  res.status(201).json(category);
}

export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  const categoryId = parseNumericId(req.params.id, 'category');
  const body = req.body as Record<string, unknown>;
  const patch: { name?: string; sortOrder?: number | null } = {};

  if (body.name !== undefined) patch.name = parseRequiredString(body, 'name');
  if (body.sortOrder !== undefined) {
    const sortOrder = parseOptionalNumber(body.sortOrder, 'sortOrder');
    if (sortOrder !== undefined && sortOrder !== null && !Number.isInteger(sortOrder)) {
      throw new BadRequestError('sortOrder must be an integer');
    }
    patch.sortOrder = sortOrder;
  }

  const category = await storage.updateCategory(categoryId, req.brainlift!.id, patch);
  if (!category) {
    throw new NotFoundError('Category not found');
  }
  res.json(category);
}

export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const categoryId = parseNumericId(req.params.id, 'category');
  try {
    const deleted = await storage.deleteCategory(categoryId, req.brainlift!.id);
    if (!deleted) {
      throw new NotFoundError('Category not found');
    }
    res.sendStatus(204);
  } catch (error) {
    if (!isSourceCategoryRestrict(error)) {
      throw error;
    }
    res.status(409).json({ message: 'Move sources to another category first' });
  }
}

export async function prefetchSourceHandler(req: Request, res: Response): Promise<void> {
  const normalizedUrl = normalizeHttpUrl((req.body as Record<string, unknown>).url);
  if (!normalizedUrl) {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  // Exa gives us article text + a `siteName` (= hostname). We additionally
  // do a lightweight HTML fetch to read the real author out of meta tags
  // / JSON-LD — `siteName` alone produced rows that all read "by
  // substack.com" which was useless. Both calls run in parallel so the
  // prefetch latency budget is dominated by the slower of the two.
  const [extracted, htmlAuthor] = await Promise.all([
    extractContent(normalizedUrl),
    fetchAuthorFromUrl(normalizedUrl),
  ]);

  const domain = domainFromUrl(normalizedUrl);
  const isFailure = extracted.contentType === 'fallback';
  const title = extracted.contentType === 'article'
    ? extracted.title ?? domain ?? normalizedUrl
    : domain ?? normalizedUrl;

  const fallbackAuthor = extracted.contentType === 'article'
    ? extracted.siteName ?? domain
    : domain;

  res.json({
    title,
    author: htmlAuthor ?? fallbackAuthor,
    extractedContent: isFailure ? null : extracted,
  });
}

secondBrainRouter.get(
  '/api/brainlifts/:slug/sources',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listSourcesHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/sources/prefetch',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(prefetchSourceHandler),
);

// Bulk routes must be registered BEFORE the `/sources/:id` patterns so
// Express doesn't try to parse 'bulk-delete' / 'bulk-recategorize' as
// numeric source ids.
secondBrainRouter.post(
  '/api/brainlifts/:slug/sources/bulk-delete',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(bulkDeleteSourcesHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/sources/bulk-recategorize',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(bulkRecategorizeSourcesHandler),
);

secondBrainRouter.get(
  '/api/brainlifts/:slug/sources/:id',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(getSourceHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/sources',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(createSourceHandler),
);

secondBrainRouter.patch(
  '/api/brainlifts/:slug/sources/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(updateSourceHandler),
);

secondBrainRouter.delete(
  '/api/brainlifts/:slug/sources/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(deleteSourceHandler),
);

secondBrainRouter.get(
  '/api/brainlifts/:slug/notes',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listNotesHandler),
);

secondBrainRouter.get(
  '/api/brainlifts/:slug/notes/:id',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(getNoteHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/notes',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(createNoteHandler),
);

secondBrainRouter.patch(
  '/api/brainlifts/:slug/notes/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(updateNoteHandler),
);

secondBrainRouter.delete(
  '/api/brainlifts/:slug/notes/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(deleteNoteHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/notes/bulk-delete',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(bulkDeleteNotesHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/notes/bulk-recategorize',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(bulkRecategorizeNotesHandler),
);

secondBrainRouter.get(
  '/api/brainlifts/:slug/categories',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listCategoriesHandler),
);

secondBrainRouter.post(
  '/api/brainlifts/:slug/categories',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(createCategoryHandler),
);

secondBrainRouter.patch(
  '/api/brainlifts/:slug/categories/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(updateCategoryHandler),
);

secondBrainRouter.delete(
  '/api/brainlifts/:slug/categories/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(deleteCategoryHandler),
);
