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
 */

import { Router, type Request, type Response } from 'express';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { requireServiceAuth } from '../middleware/service-auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { storage } from '../storage';
import { processGradeRequest } from '../services/internal-grading';
import {
  getBrainliftProgress,
  getBrainliftScores,
  getAssessmentDOK1,
  getAssessmentDOK2,
  getAssessmentDOK3,
  getAssessmentDOK4,
} from '../storage/internal';

export const internalRouter = Router();

// ── Template endpoint (spec 02) ──

let cachedTemplate: string | null = null;
let templateLoadError: string | null = null;

function loadTemplate(): string | null {
  if (cachedTemplate !== null) return cachedTemplate;

  const templatePath = path.resolve(
    process.cwd(),
    'docs/brainlift-mcp-template.md',
  );

  if (!existsSync(templatePath)) {
    templateLoadError = `Template file not found: ${templatePath}`;
    console.error(templateLoadError);
    return null;
  }

  try {
    cachedTemplate = readFileSync(templatePath, 'utf-8');
    return cachedTemplate;
  } catch (error) {
    templateLoadError = `Failed to read template: ${error instanceof Error ? error.message : String(error)}`;
    console.error(templateLoadError);
    return null;
  }
}

export async function getTemplateHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const template = loadTemplate();

  if (template === null) {
    res.status(500).json({
      error: templateLoadError || 'Template not available',
    });
    return;
  }

  res.json({
    template,
    format: 'markdown' as const,
  });
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

    res.status(201).json({
      slug: result.slug,
      brainliftId: result.brainliftId,
      status: 'grading' as const,
      message: 'Brainlift created. Use get_brainlift_assessment to check results.',
      retryAfter: 30,
    });
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
  const offset = (page - 1) * pageSize;

  const { brainlifts, total } = await storage.getBrainliftsForUserPaginated(
    req.authContext!,
    offset,
    pageSize,
    'owned',
  );

  res.json({
    brainlifts: brainlifts.map(b => ({
      slug: b.slug,
      title: b.title,
      status: deriveBrainliftStatus(b.importStatus ?? 'pending'),
      score: b.summary && typeof b.summary === 'object' && 'meanScore' in b.summary
        ? parseFloat(String((b.summary as any).meanScore)) || null
        : null,
      createdAt: b.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      totalItems: total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
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
  const { slug } = req.params;

  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift || brainlift.createdByUserId !== req.authContext!.userId) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const [progress, scores] = await Promise.all([
    getBrainliftProgress(brainlift.id),
    getBrainliftScores(brainlift.id),
  ]);

  const status = deriveStatusFromProgress(brainlift.importStatus ?? 'pending', progress);
  const isComplete = status === 'complete';

  res.json({
    slug: brainlift.slug,
    title: brainlift.title,
    status,
    progress,
    score: scores,
    retryAfter: isComplete ? 0 : 15,
    createdAt: brainlift.createdAt.toISOString(),
  });
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

  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift || brainlift.createdByUserId !== req.authContext!.userId) {
    res.status(404).json({ error: 'Brainlift not found' });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page)) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize)) || 20));
  const detail = req.query.detail === 'full' ? 'full' : 'summary';
  const offset = (page - 1) * pageSize;

  let result: { items: any[]; total: number };

  switch (dokParam) {
    case 1:
      result = await getAssessmentDOK1(brainlift.id, offset, pageSize);
      break;
    case 2:
      result = await getAssessmentDOK2(brainlift.id, offset, pageSize);
      break;
    case 3:
      result = await getAssessmentDOK3(brainlift.id, offset, pageSize, detail as 'summary' | 'full');
      break;
    case 4:
      result = await getAssessmentDOK4(brainlift.id, offset, pageSize, detail as 'summary' | 'full');
      break;
    default:
      res.status(400).json({ error: 'Invalid DOK level' });
      return;
  }

  res.json({
    slug: brainlift.slug,
    dok: dokParam,
    status: 'complete', // Per-DOK status could be enhanced later
    items: result.items,
    pagination: {
      page,
      pageSize,
      totalItems: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    },
  });
}

internalRouter.get(
  '/api/internal/brainlifts/:slug/assessment',
  requireServiceAuth,
  asyncHandler(assessmentHandler),
);

// ── Helpers ──

/**
 * Derive a simple brainlift status from importStatus.
 * Used for list endpoint where we don't have per-DOK progress.
 */
function deriveBrainliftStatus(importStatus: string): string {
  switch (importStatus) {
    case 'complete': return 'complete';
    case 'pending': return 'grading';
    default: return 'grading';
  }
}

/**
 * Derive detailed status from importStatus + per-DOK progress.
 *
 * Logic:
 *   - If importStatus is 'pending' and no DOK items exist: 'extracting'
 *   - If any DOK level has pending/grading items: 'grading'
 *   - If any DOK level has errors and none pending: 'error'
 *   - Otherwise: 'complete'
 */
function deriveStatusFromProgress(
  importStatus: string,
  progress: { dok1: { total: number; pending: number; error: number }; dok2: { total: number; pending: number; error: number }; dok3: { total: number; pending: number; error: number }; dok4: { total: number; pending: number; error: number } },
): 'extracting' | 'grading' | 'complete' | 'error' {
  const totalItems = progress.dok1.total + progress.dok2.total + progress.dok3.total + progress.dok4.total;

  if (importStatus === 'pending' && totalItems === 0) {
    return 'extracting';
  }

  const totalPending = progress.dok1.pending + progress.dok2.pending + progress.dok3.pending + progress.dok4.pending;
  if (totalPending > 0) {
    return 'grading';
  }

  const totalErrors = progress.dok1.error + progress.dok2.error + progress.dok3.error + progress.dok4.error;
  if (totalErrors > 0) {
    return 'error';
  }

  return 'complete';
}
