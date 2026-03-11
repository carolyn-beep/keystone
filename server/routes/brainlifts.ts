import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import { extractBrainlift } from "../ai/brainliftExtractor";
import { extractContent, validateContent, type SourceType } from "../utils/content-extractor";
import { saveBrainliftFromAI, runPostProcessingPipeline } from "../services/brainlift";
import { preformatHierarchy } from "../services/brainlift-preformat";
import { evaluateNeedsPreformat } from "../ai/preformat/evaluator";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, BadRequestError } from "../middleware/error-handler";
import {
  requireBrainliftAccess,
  requireBrainliftModify,
  requireBrainliftModifyById
} from "../middleware/brainlift-auth";
import { createSSEResponse } from "../utils/sse";
import { STAGE_LABELS } from "@shared/import-progress";

export const brainliftsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const PAGE_SIZE = 9;

// Get all brainlifts (filtered by user role, or all if admin with ?all=true)
// Supports pagination via ?page=1 (1-indexed)
// Supports filtering via ?filter=all|owned|shared
brainliftsRouter.get(
  api.brainlifts.list.path,
  requireAuth,
  asyncHandler(async (req, res) => {
    const showAll = req.query.all === 'true' && req.authContext!.isAdmin;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // Filter parameter: all (default), owned, or shared
    const filter = (req.query.filter as 'all' | 'owned' | 'shared') || 'all';
    if (!['all', 'owned', 'shared'].includes(filter)) {
      throw new BadRequestError('Invalid filter parameter');
    }

    const { brainlifts, total } = showAll
      ? await storage.getAllBrainliftsPaginated(offset, PAGE_SIZE)
      : await storage.getBrainliftsForUserPaginated(req.authContext!, offset, PAGE_SIZE, filter);

    res.json({
      brainlifts,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        totalPages: Math.ceil(total / PAGE_SIZE),
      },
    });
  })
);

// Get single brainlift by slug
brainliftsRouter.get(
  api.brainlifts.get.path,
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const authContext = req.authContext!;

    // Determine user's permission level for this brainlift
    let userPermission: 'owner' | 'editor' | 'viewer' | null = null;

    if (storage.isOwner(brainlift, authContext)) {
      userPermission = 'owner';
    } else if (!authContext.isAdmin) {
      // Only check share permissions for non-admins (admins have implicit access)
      const sharePermission = await storage.getUserSharePermission(brainlift.id, authContext.userId);
      userPermission = sharePermission;
    }

    // Enrich response with user's permission
    res.json({
      ...brainlift,
      userPermission,
    });
  })
);

// Create brainlift
brainliftsRouter.post(
  api.brainlifts.create.path,
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = api.brainlifts.create.input.parse(req.body);
    const brainlift = await storage.createBrainlift(
      {
        slug: input.slug,
        title: input.title,
        description: input.description,
        author: input.author || null,
        summary: input.summary
      },
      input.facts,
      input.contradictionClusters,
      req.authContext!.userId
    );
    res.status(201).json(brainlift);
  })
);

// Delete brainlift (owner only - editors cannot delete)
brainliftsRouter.delete(
  '/api/brainlifts/:id',
  requireAuth,
  requireBrainliftModifyById,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Only owner can delete (not editors)
    if (!storage.isOwner(brainlift, req.authContext!)) {
      throw new BadRequestError('Only the owner can delete this brainlift');
    }

    await storage.deleteBrainlift(brainlift.id);
    res.json({ message: "Brainlift deleted successfully" });
  })
);

// Evaluate brainlift content for preformat decision
brainliftsRouter.post(
  '/api/brainlifts/evaluate',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const sourceType = req.body.sourceType as SourceType;
    if (!sourceType) {
      throw new BadRequestError('Missing sourceType');
    }

    const { content: rawContent, sourceLabel, hierarchy } = await extractContent({
      sourceType,
      file: req.file,
      url: req.body.url,
    });

    const content = validateContent(rawContent);

    console.log(`[Evaluate] Processing ${sourceLabel}, content length: ${content.length} chars`);

    if (!hierarchy || hierarchy.length === 0) {
      // No hierarchy available — cannot evaluate, assume no formatting needed
      res.json({
        decision: 'no_formatting_needed' as const,
        confidence: 'high' as const,
        reasons: ['No hierarchy available for evaluation (non-Workflowy source)'],
        contentSizeChars: content.length,
      });
      return;
    }

    const result = await evaluateNeedsPreformat(hierarchy);
    res.json(result);
  })
);

// Validation skip threshold: 200K chars
const VALIDATION_SKIP_THRESHOLD = 200_000;

// Import brainlift with SSE progress streaming
brainliftsRouter.post(
  '/api/brainlifts/import-stream',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    const sse = createSSEResponse(res);

    try {
      const sourceType = req.body.sourceType as SourceType;
      const shouldPreformat = req.body.preformat === 'true' || req.body.preformat === true;

      // Emit extracting progress
      sse.send({ stage: 'extracting', message: STAGE_LABELS.extracting });

      const { content: rawContent, sourceLabel, hierarchy } = await extractContent({
        sourceType,
        file: req.file,
        url: req.body.url,
      });

      const content = validateContent(rawContent);

      console.log(`[SSE Import] Processing ${sourceLabel}, content length: ${content.length} chars, preformat: ${shouldPreformat}`);
      if (hierarchy) {
        console.log(`[SSE Import] Hierarchy available: ${hierarchy.length} roots`);
      }

      // Determine effective hierarchy (preformat or original)
      let effectiveHierarchy = hierarchy;

      if (shouldPreformat && hierarchy && hierarchy.length > 0) {
        try {
          // Determine content size for validation threshold
          const contentSizeChars = content.length;
          const skipValidation = contentSizeChars > VALIDATION_SKIP_THRESHOLD;

          // Emit initial formatting progress
          sse.send({
            stage: 'formatting',
            message: STAGE_LABELS.formatting,
            completed: 0,
            total: 1, // Will be updated by onProgress
          });

          const preformatResult = await preformatHierarchy(hierarchy, {
            onProgress: (completed, total) => {
              sse.send({
                stage: 'formatting',
                message: `Formatting section ${completed}/${total}...`,
                completed,
                total,
              });
            },
            skipValidation,
          });

          // Emit validating progress
          if (skipValidation) {
            sse.send({
              stage: 'validating',
              message: 'Validation skipped for large content',
            });
          } else {
            sse.send({
              stage: 'validating',
              message: STAGE_LABELS.validating,
            });
          }

          if (preformatResult && preformatResult.report.passed) {
            effectiveHierarchy = preformatResult.cleanHierarchy;
            console.log(`[SSE Import] Using preformatted hierarchy: loss=${preformatResult.report.contentLossPercent.toFixed(1)}%`);
          } else if (preformatResult) {
            console.log(`[SSE Import] Preformat validation failed (loss=${preformatResult.report.contentLossPercent.toFixed(1)}%), using original hierarchy`);
          } else {
            console.log('[SSE Import] Preformat returned null, using original hierarchy');
          }
        } catch (err) {
          console.warn('[SSE Import] Preformat error, falling back to original hierarchy:', err);
        }
      }

      const brainliftData = await extractBrainlift(content, sourceLabel, effectiveHierarchy ?? undefined);

      const autoLink = req.body.autoLink !== 'false'; // default: true

      const brainlift = await saveBrainliftFromAI(
        brainliftData,
        content,
        sourceType,
        req.authContext!.userId,
        0,
        sse.send,
        autoLink,
      );

      // Save the hierarchy to the DB (preformatted if preformat ran, original otherwise)
      if (effectiveHierarchy && effectiveHierarchy.length > 0) {
        await storage.updateBrainliftFields(brainlift.id, { importHierarchy: effectiveHierarchy });
      }

      // Mark import as complete
      await storage.updateImportStatus(brainlift.id, 'complete');

      // Emit complete with slug
      sse.send({
        stage: 'complete',
        message: STAGE_LABELS.complete,
        slug: brainlift.slug,
      });

      sse.close();
    } catch (err: any) {
      console.error('[SSE Import] Error:', err);
      // Sanitize DB errors — never expose raw SQL/params to the client
      const isDbError = err.query || err.cause?.code;
      const userMessage = isDbError
        ? 'Import failed due to a database error. Please try again.'
        : (err.message || 'Import failed');
      sse.error(userMessage);
    }
  }
);

// Update brainlift (import new version)
brainliftsRouter.patch(
  '/api/brainlifts/:slug/update',
  requireAuth,
  requireBrainliftModify,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const sourceType = req.body.sourceType as SourceType;

    const { content: rawContent, sourceLabel, hierarchy } = await extractContent({
      sourceType,
      file: req.file,
      url: req.body.url,
    });

    const content = validateContent(rawContent);

    console.log(`Updating ${slug} with ${sourceLabel}, content length: ${content.length} chars`);
    if (hierarchy) {
      console.log(`Hierarchy available: ${hierarchy.length} roots`);
    }

    const brainliftData = await extractBrainlift(content, sourceLabel, hierarchy);

    const facts = brainliftData.facts.map((f) => ({
      originalId: f.id,
      category: f.category,
      source: f.source || null,
      fact: f.fact,
      score: f.score,
      contradicts: f.contradicts,
      note: f.aiNotes || null,
    }));

    const clusters = brainliftData.contradictionClusters.map((c) => ({
      name: c.name,
      tension: c.tension,
      status: c.status,
      factIds: c.factIds,
      claims: c.claims,
    }));

    const updatedBrainlift = await storage.updateBrainlift(
      slug,
      {
        slug,
        title: brainliftData.title,
        description: brainliftData.description,
        author: (brainliftData as any).author || null,
        summary: brainliftData.summary,
        classification: brainliftData.classification,
        rejectionReason: brainliftData.rejectionReason || null,
        rejectionSubtype: brainliftData.rejectionSubtype || null,
        rejectionRecommendation: brainliftData.rejectionRecommendation || null,
        originalContent: content,
        sourceType: sourceType,
      },
      facts,
      clusters
    );

    // Run expert extraction and redundancy analysis in parallel after update
    await runPostProcessingPipeline({
      brainliftId: updatedBrainlift.id,
      slug: slug,
      title: brainliftData.title,
      description: brainliftData.description,
      author: (brainliftData as any).author || null,
      facts: facts,
      originalContent: content,
    });

    res.json(await storage.getBrainliftBySlug(slug));
  })
);

// Update brainlift author/owner
brainliftsRouter.patch(
  '/api/brainlifts/:slug/author',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { author } = req.body;
    await storage.updateBrainliftFields(req.brainlift!.id, { author: author || null });
    res.json({ success: true, author });
  })
);

// Get version history for a brainlift
brainliftsRouter.get(
  '/api/brainlifts/:slug/versions',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const versions = await storage.getVersionsByBrainliftId(req.brainlift!.id);
    res.json(versions);
  })
);

// Reformat brainlift using preformat pipeline
brainliftsRouter.post(
  '/api/brainlifts/:slug/reformat',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { confirm } = req.body;
    if (!confirm) {
      throw new BadRequestError('Must confirm reformat operation');
    }

    const brainlift = req.brainlift!;
    const importHierarchy = brainlift.importHierarchy as unknown[] | null;
    if (!importHierarchy || !Array.isArray(importHierarchy) || importHierarchy.length === 0) {
      throw new BadRequestError('BrainLift has no import hierarchy');
    }

    try {
      const result = await preformatHierarchy(importHierarchy as any);
      if (result) {
        res.json({
          success: true,
          report: result.report,
          cleanHierarchy: result.cleanHierarchy,
        });
      } else {
        res.json({
          success: false,
          error: 'Preformat validation failed',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  })
);
