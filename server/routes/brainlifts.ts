import { Router } from "express";
import { storage } from "../storage";
import { api } from "@shared/routes";
import { z } from "zod";
import multer from "multer";
import { extractBrainlift } from "../ai/brainliftExtractor";
import { extractContent, validateContent, type SourceType } from "../utils/content-extractor";
import { saveBrainliftFromAI, runPostProcessingPipeline } from "../services/brainlift";
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

// Import brainlift with SSE progress streaming
brainliftsRouter.post(
  '/api/brainlifts/import-stream',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    const sse = createSSEResponse(res);

    try {
      const sourceType = req.body.sourceType as SourceType;

      // Emit extracting progress
      sse.send({ stage: 'extracting', message: STAGE_LABELS.extracting });

      const { content: rawContent, sourceLabel, hierarchy } = await extractContent({
        sourceType,
        file: req.file,
        url: req.body.url,
      });

      const content = validateContent(rawContent);

      console.log(`[SSE Import] Processing ${sourceLabel}, content length: ${content.length} chars`);
      if (hierarchy) {
        console.log(`[SSE Import] Hierarchy available: ${hierarchy.length} roots`);
      }

      const brainliftData = await extractBrainlift(content, sourceLabel, hierarchy);

      const brainlift = await saveBrainliftFromAI(
        brainliftData,
        content,
        sourceType,
        req.authContext!.userId,
        0,
        sse.send
      );

      // Emit complete with slug
      sse.send({
        stage: 'complete',
        message: STAGE_LABELS.complete,
        slug: brainlift.slug,
      });

      sse.close();
    } catch (err: any) {
      console.error('[SSE Import] Error:', err);
      sse.error(err.message || 'Import failed');
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
