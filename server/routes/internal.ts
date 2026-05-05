/**
 * Internal API routes for service-to-service communication.
 *
 * Protected by requireServiceAuth middleware (validates API key,
 * provisions user, enforces rate limits).
 *
 * Endpoints:
 *   GET  /api/internal/template                    — Brainlift markdown template (spec 02)
 *   POST /api/internal/grade                       — Submit markdown for grading (spec 03)
 *   GET  /api/internal/brainlifts                  — Paginated list of user's brainlifts (spec 03)
 *   GET  /api/internal/brainlifts/:slug/status     — Grading progress (spec 03)
 *   GET  /api/internal/brainlifts/:slug/assessment — Paginated assessment results (spec 03)
 *   GET  /api/internal/brainlifts/:slug/experts    — List experts for one brainlift
 *   POST /api/internal/brainlifts/:slug/experts    — Create experts for one brainlift
 *   DELETE /api/internal/brainlifts/:slug/experts/:id — Delete one expert
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createDeliverableRequestSchema,
  deliverableIdParamsSchema,
  listDocumentsQuerySchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
  updateDeliverableRequestSchema,
} from '@shared/routes';
import { requireServiceAuth } from '../middleware/service-auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { processGradeRequest } from '../services/internal-grading';
import {
  buildGradingQueuedResponse,
  getBrainliftAssessmentForAuthContext,
  getBrainliftStatusForAuthContext,
  getBrainliftTemplatePayload,
  listBrainliftsForAuthContext,
} from '../services/brainlift-grading-surface';
import {
  createSprintDeliverable,
  listDocumentsForUser,
  readSprintDeliverable,
  updateSprintDeliverable,
} from '../services/sprint';
import { createVersion, pruneVersions } from '../storage/versions';
import { propagateStaleFlags, dismissStaleFlag, getStaleItems } from '../storage/stale';
import { recomputeBrainliftScore } from '../services/brainlift';
import { withJob } from '../utils/withJob';
import type { PreviousEvaluation } from '@shared/types/regrading';
import { db } from '../db';
import { facts, dok2Summaries, dok3Insights, dok4Spovs } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { SprintStorageConflictError } from '../storage/sprints';
import {
  createPlanHandler as publicCreatePlanHandler,
  listPlansHandler as publicListPlansHandler,
  getActivePlanHandler as publicGetActivePlanHandler,
  listTasksHandler as publicListTasksHandler,
  getTaskHandler as publicGetTaskHandler,
  readDeliverableHandler as publicReadDeliverableHandler,
  listDeliverablesHandler as publicListDeliverablesHandler,
} from './sprints';

export const internalRouter = Router();

const createExpertsRequestSchema = z.object({
  experts: z.array(z.object({
    name: z.string().trim().min(1),
    who: z.string().trim().min(1),
    why: z.string().trim().min(1),
    focus: z.string().trim().min(1).optional(),
    where: z.string().trim().min(1).optional(),
  })).min(1),
});

// ── Template endpoint (spec 02) ──

export async function getTemplateHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const payload = await getBrainliftTemplatePayload();
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Template not available',
    });
  }
}

internalRouter.get(
  '/api/internal/template',
  requireServiceAuth,
  asyncHandler(getTemplateHandler),
);

// ── FR1: POST /api/internal/grade ──

export async function gradeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { markdown, title } = req.body;

  if (!markdown || typeof markdown !== 'string' || markdown.trim().length === 0) {
    res.status(400).json({ error: 'Markdown content is required' });
    return;
  }

  try {
    const result = await processGradeRequest(
      markdown,
      title,
      req.authContext!.userId,
    );

    res.status(201).json(buildGradingQueuedResponse(result));
  } catch (error: any) {
    if (error instanceof BadRequestError || error.statusCode === 400) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}

internalRouter.post(
  '/api/internal/grade',
  requireServiceAuth,
  asyncHandler(gradeHandler),
);

// ── FR2: GET /api/internal/brainlifts ──

export async function listBrainliftsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(20, Math.max(1, parseInt(String(req.query.pageSize)) || 10));

  res.json(await listBrainliftsForAuthContext(req.authContext!, { page, pageSize }));
}

internalRouter.get(
  '/api/internal/brainlifts',
  requireServiceAuth,
  asyncHandler(listBrainliftsHandler),
);

// ── FR3: GET /api/internal/brainlifts/:slug/status ──

export async function statusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json(await getBrainliftStatusForAuthContext(req.authContext!, req.params.slug));
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    throw error;
  }
}

internalRouter.get(
  '/api/internal/brainlifts/:slug/status',
  requireServiceAuth,
  asyncHandler(statusHandler),
);

// ── FR4: GET /api/internal/brainlifts/:slug/assessment ──

export async function assessmentHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug } = req.params;
  const dokParam = parseInt(String(req.query.dok));

  if (isNaN(dokParam) || dokParam < 1 || dokParam > 4) {
    res.status(400).json({ error: 'dok parameter is required and must be 1-4' });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize)) || 20));
  const detail = req.query.detail === 'full' ? 'full' : 'summary';

  // Filter/sort params
  const itemIdRaw = parseInt(String(req.query.itemId));
  const itemId = isNaN(itemIdRaw) ? undefined : itemIdRaw;
  const sortByRaw = String(req.query.sortBy || '');
  const sortBy = (['id', 'score', 'updatedAt'].includes(sortByRaw) ? sortByRaw : undefined) as 'id' | 'score' | 'updatedAt' | undefined;
  const orderRaw = String(req.query.order || '');
  const order = (['asc', 'desc'].includes(orderRaw) ? orderRaw : undefined) as 'asc' | 'desc' | undefined;
  const statusRaw = String(req.query.status || '');
  const status = (['regrading', 'grading', 'graded', 'error'].includes(statusRaw) ? statusRaw : undefined) as 'regrading' | 'grading' | 'graded' | 'error' | undefined;

  try {
    res.json(await getBrainliftAssessmentForAuthContext(req.authContext!, {
      slug,
      dok: dokParam as 1 | 2 | 3 | 4,
      page,
      pageSize,
      itemId,
      sortBy,
      order,
      status,
      detail,
    }));
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    if (error instanceof BadRequestError) {
      res.status(400).json({ error: error.message });
      return;
    }

    throw error;
  }
}

internalRouter.get(
  '/api/internal/brainlifts/:slug/assessment',
  requireServiceAuth,
  asyncHandler(assessmentHandler),
);

async function queueExpertsRerank(brainliftId: number): Promise<void> {
  try {
    await withJob('experts:rerank')
      .forPayload({ brainliftId })
      .withOptions({ jobKey: `rerank-experts-${brainliftId}` })
      .queue();
  } catch (error) {
    console.error('[Internal Experts] Failed to queue rerank job:', error);
  }
}

export async function listExpertsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'access');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const experts = await storage.getExpertsByBrainliftId(brainlift.id);
  res.json(experts);
}

export async function createExpertsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const { experts } = createExpertsRequestSchema.parse(req.body);
  const createdExperts = await storage.createExpertsForBrainlift(brainlift.id, experts);
  await queueExpertsRerank(brainlift.id);
  res.status(201).json(createdExperts);
}

export async function deleteExpertHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const expertId = parseInt(req.params.id, 10);
  if (isNaN(expertId)) {
    res.status(400).json({ error: 'Invalid expert ID' });
    return;
  }

  const deleted = await storage.deleteExpertForBrainlift(expertId, brainlift.id);
  if (!deleted) {
    res.status(404).json({ error: 'Expert not found' });
    return;
  }

  await queueExpertsRerank(brainlift.id);
  res.status(204).end();
}

internalRouter.get(
  '/api/internal/brainlifts/:slug/experts',
  requireServiceAuth,
  asyncHandler(listExpertsHandler),
);

internalRouter.post(
  '/api/internal/brainlifts/:slug/experts',
  requireServiceAuth,
  asyncHandler(createExpertsHandler),
);

internalRouter.delete(
  '/api/internal/brainlifts/:slug/experts/:id',
  requireServiceAuth,
  asyncHandler(deleteExpertHandler),
);

// ── Scope Breaker internal sprint routes (spec 03) ──

export async function internalCreatePlanHandler(req: Request, res: Response): Promise<void> {
  await publicCreatePlanHandler(req, res);
}

export async function internalListPlansHandler(req: Request, res: Response): Promise<void> {
  await publicListPlansHandler(req, res);
}

export async function internalGetActivePlanHandler(req: Request, res: Response): Promise<void> {
  await publicGetActivePlanHandler(req, res);
}

export async function internalListTasksHandler(req: Request, res: Response): Promise<void> {
  await publicListTasksHandler(req, res);
}

export async function internalListAllTasksForUserHandler(req: Request, res: Response): Promise<void> {
  const authContext = req.authContext!;
  const query = listTasksQuerySchema.parse(req.query);

  const rows = await storage.listTasksForUser(authContext.userId, {
    date: query.date,
    week: query.week,
    state: query.state,
    includePastDue: query.includePastDue,
    localDate: query.localDate,
  });

  res.json(rows.map((row) => ({
    id: row.id,
    planId: row.planId,
    brainliftSlug: row.brainliftSlug,
    brainliftTitle: row.brainliftTitle,
    scheduledDate: row.scheduledDate,
    weekNumber: row.weekNumber,
    dayInWeek: row.dayInWeek,
    title: row.title,
    description: row.description,
    milestone: row.milestone,
    isComplete: row.isComplete,
    isPastDue: row.isPastDue,
    deliverable: row.deliverable,
  })));
}

export async function internalGetTaskHandler(req: Request, res: Response): Promise<void> {
  await publicGetTaskHandler(req, res);
}

export async function internalReadDeliverableHandler(req: Request, res: Response): Promise<void> {
  await publicReadDeliverableHandler(req, res);
}

export async function internalListDeliverablesHandler(req: Request, res: Response): Promise<void> {
  await publicListDeliverablesHandler(req, res);
}

export async function internalCreateDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;
  const routeTaskId = req.params.taskId != null ? taskIdParamsSchema.parse(req.params).taskId : undefined;
  const body = createDeliverableRequestSchema.parse(req.body);
  if (routeTaskId != null && body.taskId != null && routeTaskId !== body.taskId) {
    throw new BadRequestError('Route taskId and body taskId must match');
  }
  const taskId = routeTaskId ?? body.taskId;

  try {
    const result = await createSprintDeliverable({
      brainlift: {
        id: brainlift.id,
        title: brainlift.title,
        gdriveRootFolderId: brainlift.gdriveRootFolderId ?? null,
      },
      userId: authContext.userId,
      ...(taskId != null ? { taskId } : {}),
      title: body.title,
      markdown: body.markdown,
      sourceSurface: 'mcp',
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SprintStorageConflictError) {
      res.status(409).json({ message: error.message });
      return;
    }

    throw error;
  }
}

export async function internalUpdateDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const body = updateDeliverableRequestSchema.parse(req.body);
  res.json(await updateSprintDeliverable({
    brainliftId: brainlift.id,
    taskId,
    markdown: body.markdown,
    sourceSurface: 'mcp',
  }));
}

export async function internalReadDeliverableByIdHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { id } = deliverableIdParamsSchema.parse(req.params);
  res.json(await readSprintDeliverable({
    brainliftId: brainlift.id,
    deliverableId: id,
  }));
}

export async function internalPatchDeliverableByIdHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { id } = deliverableIdParamsSchema.parse(req.params);
  const body = updateDeliverableRequestSchema.parse(req.body);
  res.json(await updateSprintDeliverable({
    brainliftId: brainlift.id,
    deliverableId: id,
    markdown: body.markdown,
    sourceSurface: 'mcp',
  }));
}

export async function internalListDocumentsHandler(req: Request, res: Response): Promise<void> {
  const authContext = req.authContext!;
  const query = listDocumentsQuerySchema.parse(req.query);
  res.json(await listDocumentsForUser(authContext.userId, authContext.isAdmin, query));
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/plans',
  requireServiceAuth,
  requireBrainliftModify,
  asyncHandler(internalCreatePlanHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/plans',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalListPlansHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/plans/active',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalGetActivePlanHandler),
);

internalRouter.get(
  '/api/internal/tasks',
  requireServiceAuth,
  asyncHandler(internalListAllTasksForUserHandler),
);

internalRouter.get(
  '/api/internal/documents',
  requireServiceAuth,
  asyncHandler(internalListDocumentsHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/tasks',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalListTasksHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/tasks/:taskId',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalGetTaskHandler),
);

internalRouter.post(
  '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable',
  requireServiceAuth,
  requireBrainliftModify,
  asyncHandler(internalCreateDeliverableHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalReadDeliverableHandler),
);

internalRouter.put(
  '/api/internal/brainlifts/:slug/tasks/:taskId/deliverable',
  requireServiceAuth,
  requireBrainliftModify,
  asyncHandler(internalUpdateDeliverableHandler),
);

internalRouter.post(
  '/api/internal/brainlifts/:slug/deliverables',
  requireServiceAuth,
  requireBrainliftModify,
  asyncHandler(internalCreateDeliverableHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/deliverables',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalListDeliverablesHandler),
);

internalRouter.get(
  '/api/internal/brainlifts/:slug/deliverables/:id',
  requireServiceAuth,
  requireBrainliftAccess,
  asyncHandler(internalReadDeliverableByIdHandler),
);

internalRouter.patch(
  '/api/internal/brainlifts/:slug/deliverables/:id',
  requireServiceAuth,
  requireBrainliftModify,
  asyncHandler(internalPatchDeliverableByIdHandler),
);

// ── Helpers ──

type InternalBrainliftAccess = 'access' | 'modify';

/**
 * Resolve a brainlift by slug and verify the authenticated user has the
 * required access level. Returns null for both "not found" and "not allowed"
 * to preserve IDOR protections.
 */
async function resolveInternalBrainlift(
  req: Request,
  slug: string,
  requiredAccess: InternalBrainliftAccess,
) {
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) return null;

  const hasAccess = requiredAccess === 'modify'
    ? await storage.canModifyBrainlift(brainlift, req.authContext!)
    : await storage.canAccessBrainlift(brainlift, req.authContext!);

  return hasAccess ? brainlift : null;
}

/**
 * Parse and validate dokLevel param. Returns 1-4 or null if invalid.
 */
function parseDokLevel(param: string): 1 | 2 | 3 | 4 | null {
  const level = parseInt(param);
  if (isNaN(level) || level < 1 || level > 4) return null;
  return level as 1 | 2 | 3 | 4;
}

// ── FR1: PATCH /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId ──

export async function internalEditHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug } = req.params;
  const dokLevel = parseDokLevel(req.params.dokLevel);
  if (!dokLevel) {
    res.status(400).json({ error: 'dokLevel must be 1-4' });
    return;
  }

  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const brainlift = await resolveInternalBrainlift(req, slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const brainliftId = brainlift.id;

  switch (dokLevel) {
    case 1: {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'text is required and must be a non-empty string' });
        return;
      }

      const fact = await storage.getFactByIdForBrainlift(itemId, brainliftId);
      if (!fact) { res.status(404).json({ error: 'Fact not found' }); return; }

      const editResult = await storage.editFact(itemId, brainliftId, text.trim());
      if (!editResult) { res.status(404).json({ error: 'Fact not found' }); return; }

      await createVersion({ dokLevel: 1, itemId, brainliftId, textContent: editResult.previousText, score: editResult.previousScore, feedback: editResult.previousFeedback });
      await propagateStaleFlags({ dokLevel: 1, itemId, brainliftId, reason: `DOK1 fact ${itemId} edited` });
      await pruneVersions(1, itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        oldText: editResult.previousText,
        newText: text.trim(),
        editNumber: 1,
      };
      await db.update(facts).set({ gradingStatus: 'regrading' }).where(eq(facts.id, itemId));
      await withJob('dok1:regrade').forPayload({ factId: itemId, brainliftId, previousEvaluation }).queue();

      res.json({ id: itemId, dokLevel: 1, status: 'regrading', previousScore: editResult.previousScore });
      return;
    }

    case 2: {
      // Accept either { text } (split by newlines) or { points } (array)
      let trimmedPoints: string[];
      if (req.body.text && typeof req.body.text === 'string') {
        trimmedPoints = req.body.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      } else if (Array.isArray(req.body.points) && req.body.points.length > 0) {
        trimmedPoints = req.body.points.map((p: string) => (typeof p === 'string' ? p.trim() : ''));
      } else {
        res.status(400).json({ error: 'text (string) or points (array of strings) is required' });
        return;
      }
      if (trimmedPoints.length === 0) {
        res.status(400).json({ error: 'text must contain at least one non-empty line' });
        return;
      }

      const editResult = await storage.editDok2Summary(itemId, brainliftId, trimmedPoints);
      if (!editResult) { res.status(404).json({ error: 'DOK2 summary not found' }); return; }

      await createVersion({ dokLevel: 2, itemId, brainliftId, textContent: editResult.previousPoints.join('\n'), score: editResult.previousScore, feedback: editResult.previousFeedback });
      await propagateStaleFlags({ dokLevel: 2, itemId, brainliftId, reason: `DOK2 summary ${itemId} edited` });
      await pruneVersions(2, itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        oldText: editResult.previousPoints.join('\n'),
        newText: trimmedPoints.join('\n'),
        editNumber: 1,
      };
      await db.update(dok2Summaries).set({ gradingStatus: 'regrading' }).where(eq(dok2Summaries.id, itemId));
      await withJob('dok2:regrade').forPayload({ summaryId: itemId, brainliftId, previousEvaluation }).queue();

      res.json({ id: itemId, dokLevel: 2, status: 'regrading', previousScore: editResult.previousScore });
      return;
    }

    case 3: {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'text is required and must be a non-empty string' });
        return;
      }

      const insight = await storage.getDOK3InsightForBrainlift(itemId, brainliftId);
      if (!insight) { res.status(404).json({ error: 'DOK3 insight not found' }); return; }

      const editResult = await storage.editDok3Insight(itemId, brainliftId, text.trim());
      if (!editResult) { res.status(404).json({ error: 'DOK3 insight not found' }); return; }

      await createVersion({ dokLevel: 3, itemId, brainliftId, textContent: editResult.previousText, score: editResult.previousScore, feedback: editResult.previousFeedback });
      await propagateStaleFlags({ dokLevel: 3, itemId, brainliftId, reason: `DOK3 insight ${itemId} edited` });
      await pruneVersions(3, itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        previousRationale: editResult.previousRationale ?? undefined,
        previousCriteriaBreakdown: editResult.previousCriteriaBreakdown ?? undefined,
        oldText: editResult.previousText,
        newText: text.trim(),
        editNumber: 1,
      };
      await withJob('dok3:regrade').forPayload({ insightId: itemId, brainliftId, previousEvaluation }).queue();

      res.json({ id: itemId, dokLevel: 3, status: 'regrading', previousScore: editResult.previousScore });
      return;
    }

    case 4: {
      const { text } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'text is required and must be a non-empty string' });
        return;
      }

      const spovs = await storage.getDOK4Spovs(brainliftId);
      const spov = spovs.find((s: { id: number }) => s.id === itemId);
      if (!spov) { res.status(404).json({ error: 'SPOV not found' }); return; }

      const editResult = await storage.editDok4Spov(itemId, brainliftId, text.trim());
      if (!editResult) { res.status(404).json({ error: 'SPOV not found' }); return; }

      await createVersion({ dokLevel: 4, itemId, brainliftId, textContent: editResult.previousText, score: editResult.previousScore, feedback: editResult.previousFeedback });
      // DOK4 is terminal -- no stale propagation
      await pruneVersions(4, itemId);

      const previousEvaluation: PreviousEvaluation = {
        previousScore: editResult.previousScore ?? 0,
        previousFeedback: editResult.previousFeedback ?? '',
        previousRationale: editResult.previousRationale ?? undefined,
        previousCriteriaBreakdown: editResult.previousCriteriaBreakdown ?? undefined,
        oldText: editResult.previousText,
        newText: text.trim(),
        editNumber: 1,
      };
      await withJob('dok4:regrade').forPayload({ spovId: itemId, brainliftId, previousEvaluation }).queue();

      res.json({ id: itemId, dokLevel: 4, status: 'regrading', previousScore: editResult.previousScore });
      return;
    }
  }
}

internalRouter.patch(
  '/api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId',
  requireServiceAuth,
  asyncHandler(internalEditHandler),
);

// ── FR2: DELETE /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId ──

export async function internalDeleteHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug } = req.params;
  const dokLevel = parseDokLevel(req.params.dokLevel);
  if (!dokLevel) {
    res.status(400).json({ error: 'dokLevel must be 1-4' });
    return;
  }

  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const brainlift = await resolveInternalBrainlift(req, slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const brainliftId = brainlift.id;
  const isPreview = req.query.preview === 'true';

  // Route to the correct storage function by DOK level
  const impactFns: Record<number, (id: number, blId: number) => Promise<any>> = {
    1: storage.getFactDeleteImpact,
    2: storage.getDok2DeleteImpact,
    3: storage.getDok3DeleteImpact,
    4: storage.getDok4DeleteImpact,
  };

  const deleteFns: Record<number, (id: number, blId: number) => Promise<any>> = {
    1: storage.deleteFact,
    2: storage.deleteDok2Summary,
    3: storage.deleteDok3Insight,
    4: storage.deleteDok4Spov,
  };

  if (isPreview) {
    const impact = await impactFns[dokLevel](itemId, brainliftId);
    if (!impact) {
      res.status(404).json({ error: 'Item not found' });
      return;
    }
    res.json(impact);
    return;
  }

  const result = await deleteFns[dokLevel](itemId, brainliftId);
  if (!result) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  await recomputeBrainliftScore(brainliftId, {
    trigger: 'delete',
    dokLevel,
    itemId,
  });
  res.json(result);
}

internalRouter.delete(
  '/api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId',
  requireServiceAuth,
  asyncHandler(internalDeleteHandler),
);

// ── FR3: POST /api/internal/brainlifts/:slug/dok1 ──

export async function internalCreateDok1Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const { fact, source, category } = req.body;
  if (!fact || typeof fact !== 'string' || fact.trim().length === 0) {
    res.status(400).json({ error: 'fact is required and must be a non-empty string' });
    return;
  }
  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    res.status(400).json({ error: 'source is required and must be a non-empty string' });
    return;
  }

  const brainliftId = brainlift.id;
  const result = await storage.createFact({
    brainliftId,
    fact: fact.trim(),
    source: source.trim(),
    category: category?.trim() || undefined,
  });

  await db.update(facts).set({ gradingStatus: 'grading' }).where(eq(facts.id, result.id));
  await withJob('dok1:grade-single').forPayload({ factId: result.id, brainliftId }).queue();

  res.status(201).json({ id: result.id, status: 'grading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok1',
  requireServiceAuth,
  asyncHandler(internalCreateDok1Handler),
);

// ── FR3: POST /api/internal/brainlifts/:slug/dok2 ──

export async function internalCreateDok2Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const { sourceName, sourceUrl, points, relatedFactIds } = req.body;
  if (!sourceName || typeof sourceName !== 'string' || sourceName.trim().length === 0) {
    res.status(400).json({ error: 'sourceName is required and must be a non-empty string' });
    return;
  }
  if (!Array.isArray(points) || points.length === 0) {
    res.status(400).json({ error: 'points must be a non-empty array of strings' });
    return;
  }
  if (!points.every((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0)) {
    res.status(400).json({ error: 'All points must be non-empty strings' });
    return;
  }

  const brainliftId = brainlift.id;
  const trimmedPoints = points.map((p: string) => p.trim());

  // Validate relatedFactIds belong to this brainlift
  const factIds: number[] = Array.isArray(relatedFactIds) ? relatedFactIds : [];
  if (factIds.length > 0) {
    if (!factIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
      res.status(400).json({ error: 'relatedFactIds must contain only integers' });
      return;
    }
    for (const factId of factIds) {
      const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
      if (!fact) {
        res.status(400).json({ error: `Fact ID ${factId} not found in this brainlift` });
        return;
      }
    }
  }

  const result = await storage.createDok2Summary({
    brainliftId,
    sourceName: sourceName.trim(),
    sourceUrl: sourceUrl?.trim() || undefined,
    points: trimmedPoints,
    relatedFactIds: factIds,
  });

  await db.update(dok2Summaries).set({ gradingStatus: 'grading' }).where(eq(dok2Summaries.id, result.id));
  await withJob('dok2:grade-single').forPayload({ summaryId: result.id, brainliftId }).queue();

  res.status(201).json({ id: result.id, status: 'grading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok2',
  requireServiceAuth,
  asyncHandler(internalCreateDok2Handler),
);

// ── FR3: POST /api/internal/brainlifts/:slug/dok3 ──

export async function internalCreateDok3Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const { text, linkedDok2Ids } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }
  if (!Array.isArray(linkedDok2Ids) || linkedDok2Ids.length < 2) {
    res.status(400).json({ error: 'linkedDok2Ids must contain at least 2 DOK2 summary IDs' });
    return;
  }
  if (!linkedDok2Ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
    res.status(400).json({ error: 'linkedDok2Ids must contain only integers' });
    return;
  }

  const brainliftId = brainlift.id;

  // Validate multi-source requirement
  const validation = await storage.validateMultiSourceLinks(linkedDok2Ids);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error! });
    return;
  }

  // Validate all DOK2 IDs belong to this brainlift
  const allDok2s = await storage.getDOK2Summaries(brainliftId);
  const brainliftDok2Ids = new Set(allDok2s.map((s: { id: number }) => s.id));
  for (const dok2Id of linkedDok2Ids) {
    if (!brainliftDok2Ids.has(dok2Id)) {
      res.status(400).json({ error: `DOK2 summary ID ${dok2Id} does not belong to this brainlift` });
      return;
    }
  }

  const result = await storage.createDok3Insight({
    brainliftId,
    text: text.trim(),
    linkedDok2Ids,
  });

  try {
    await withJob('dok3:grade').forPayload({ insightId: result.id, brainliftId }).queue();
  } catch (err) {
    console.error(`[Internal API] Failed to queue grade job for new insight ${result.id}:`, err);
  }

  res.status(201).json({ id: result.id, status: 'grading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok3',
  requireServiceAuth,
  asyncHandler(internalCreateDok3Handler),
);

// ── FR3: POST /api/internal/brainlifts/:slug/dok4 ──

export async function internalCreateDok4Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const { text, linkedDok3Ids, primaryDok3Id } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text is required and must be a non-empty string' });
    return;
  }
  if (!Array.isArray(linkedDok3Ids) || linkedDok3Ids.length === 0) {
    res.status(400).json({ error: 'linkedDok3Ids must contain at least 1 DOK3 insight ID' });
    return;
  }
  if (!linkedDok3Ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
    res.status(400).json({ error: 'linkedDok3Ids must contain only integers' });
    return;
  }
  if (typeof primaryDok3Id !== 'number' || !Number.isInteger(primaryDok3Id)) {
    res.status(400).json({ error: 'primaryDok3Id must be an integer' });
    return;
  }
  if (!linkedDok3Ids.includes(primaryDok3Id)) {
    res.status(400).json({ error: 'primaryDok3Id must be included in linkedDok3Ids' });
    return;
  }

  const brainliftId = brainlift.id;

  // Validate all DOK3 IDs belong to this brainlift and are graded
  const allInsights = await storage.getDOK3Insights(brainliftId);
  const insightMap = new Map(allInsights.map((i: { id: number; status: string }) => [i.id, i]));

  for (const dok3Id of linkedDok3Ids) {
    const insight = insightMap.get(dok3Id);
    if (!insight) {
      res.status(400).json({ error: `DOK3 insight ID ${dok3Id} does not belong to this brainlift` });
      return;
    }
    if (insight.status !== 'graded') {
      res.status(400).json({ error: `DOK3 insight ID ${dok3Id} is not graded (status: ${insight.status})` });
      return;
    }
  }

  const result = await storage.createDok4Spov({
    brainliftId,
    text: text.trim(),
    linkedDok3Ids,
    primaryDok3Id,
  });

  try {
    await withJob('dok4:grade').forPayload({ spovId: result.id, brainliftId }).queue();
  } catch (err) {
    console.error(`[Internal API] Failed to queue grade job for new SPOV ${result.id}:`, err);
  }

  res.status(201).json({ id: result.id, status: 'grading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok4',
  requireServiceAuth,
  asyncHandler(internalCreateDok4Handler),
);

// ── FR4: GET /api/internal/brainlifts/:slug/stale ──

export async function internalGetStaleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const brainlift = await resolveInternalBrainlift(req, req.params.slug, 'access');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const staleItems = await getStaleItems(brainlift.id);
  res.json(staleItems);
}

internalRouter.get(
  '/api/internal/brainlifts/:slug/stale',
  requireServiceAuth,
  asyncHandler(internalGetStaleHandler),
);

// ── FR4: POST /api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId/dismiss-stale ──

export async function internalDismissStaleHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug } = req.params;
  const dokLevel = parseDokLevel(req.params.dokLevel);
  if (!dokLevel) {
    res.status(400).json({ error: 'dokLevel must be 1-4' });
    return;
  }

  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) {
    res.status(400).json({ error: 'Invalid item ID' });
    return;
  }

  const brainlift = await resolveInternalBrainlift(req, slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  await dismissStaleFlag(dokLevel, itemId, brainlift.id);
  res.json({ dismissed: true });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok/:dokLevel/items/:itemId/dismiss-stale',
  requireServiceAuth,
  asyncHandler(internalDismissStaleHandler),
);

// ── Link endpoints: add evidence links to existing items ──

export async function internalLinkDok3Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug, insightId: insightIdStr } = req.params;
  const insightId = parseInt(insightIdStr);
  if (isNaN(insightId)) {
    res.status(400).json({ error: 'Invalid insight ID' });
    return;
  }

  const brainlift = await resolveInternalBrainlift(req, slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }
  const brainliftId = brainlift.id;

  const { dok2Ids } = req.body;
  if (!Array.isArray(dok2Ids) || dok2Ids.length === 0) {
    res.status(400).json({ error: 'dok2Ids must be a non-empty array of numbers' });
    return;
  }

  // Validate DOK2 IDs belong to this brainlift
  const validDok2s = await db.select({ id: dok2Summaries.id })
    .from(dok2Summaries)
    .where(and(inArray(dok2Summaries.id, dok2Ids), eq(dok2Summaries.brainliftId, brainliftId)));
  const validIds = new Set(validDok2s.map(d => d.id));
  const invalidIds = dok2Ids.filter((id: number) => !validIds.has(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: `DOK2 IDs not found in this brainlift: ${invalidIds.join(', ')}` });
    return;
  }

  const result = await storage.addLinksToDok3Insight({ insightId, brainliftId, dok2Ids });
  if (!result) {
    res.status(404).json({ error: 'DOK3 insight not found' });
    return;
  }

  // Create version snapshot (foundation changed)
  await createVersion({
    dokLevel: 3,
    itemId: insightId,
    brainliftId,
    textContent: result.existingItem.text,
    score: result.existingItem.score,
    feedback: null,
  });
  await pruneVersions(3, insightId);

  // Queue regrade with context-aware previous evaluation
  const previousEvaluation: PreviousEvaluation = {
    previousScore: result.existingItem.score ?? 0,
    previousFeedback: '',
    oldText: result.existingItem.text,
    newText: result.existingItem.text,
    editNumber: 1,
  };
  await withJob('dok3:regrade').forPayload({ insightId, brainliftId, previousEvaluation }).queue();

  res.json({ id: insightId, addedLinks: result.addedCount, status: 'regrading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok3/:insightId/links',
  requireServiceAuth,
  asyncHandler(internalLinkDok3Handler),
);

export async function internalLinkDok4Handler(
  req: Request,
  res: Response,
): Promise<void> {
  const { slug, spovId: spovIdStr } = req.params;
  const spovId = parseInt(spovIdStr);
  if (isNaN(spovId)) {
    res.status(400).json({ error: 'Invalid SPOV ID' });
    return;
  }

  const brainlift = await resolveInternalBrainlift(req, slug, 'modify');
  if (!brainlift) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }
  const brainliftId = brainlift.id;

  const { dok3Ids, newPrimaryDok3Id } = req.body;
  if (!Array.isArray(dok3Ids) || dok3Ids.length === 0) {
    res.status(400).json({ error: 'dok3Ids must be a non-empty array of numbers' });
    return;
  }

  // Validate DOK3 IDs belong to this brainlift
  const validDok3s = await db.select({ id: dok3Insights.id })
    .from(dok3Insights)
    .where(and(inArray(dok3Insights.id, dok3Ids), eq(dok3Insights.brainliftId, brainliftId)));
  const validIds = new Set(validDok3s.map(d => d.id));
  const invalidIds = dok3Ids.filter((id: number) => !validIds.has(id));
  if (invalidIds.length > 0) {
    res.status(400).json({ error: `DOK3 IDs not found in this brainlift: ${invalidIds.join(', ')}` });
    return;
  }

  const result = await storage.addLinksToDok4Spov({
    spovId,
    brainliftId,
    dok3Ids,
    newPrimaryDok3Id: newPrimaryDok3Id ?? undefined,
  });
  if (!result) {
    res.status(404).json({ error: 'DOK4 SPOV not found' });
    return;
  }

  // Create version snapshot (foundation changed)
  await createVersion({
    dokLevel: 4,
    itemId: spovId,
    brainliftId,
    textContent: result.existingItem.text,
    score: result.existingItem.score,
    feedback: null,
  });
  await pruneVersions(4, spovId);

  // Queue regrade with context-aware previous evaluation
  const previousEvaluation: PreviousEvaluation = {
    previousScore: result.existingItem.score ?? 0,
    previousFeedback: '',
    oldText: result.existingItem.text,
    newText: result.existingItem.text,
    editNumber: 1,
  };
  await withJob('dok4:regrade').forPayload({ spovId, brainliftId, previousEvaluation }).queue();

  res.json({ id: spovId, addedLinks: result.addedCount, status: 'regrading' });
}

internalRouter.post(
  '/api/internal/brainlifts/:slug/dok4/:spovId/links',
  requireServiceAuth,
  asyncHandler(internalLinkDok4Handler),
);
