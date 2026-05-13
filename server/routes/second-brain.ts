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
