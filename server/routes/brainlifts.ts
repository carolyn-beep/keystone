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

export const brainliftsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const PAGE_SIZE = 9;

// Get all brainlifts (filtered by user role, or all if admin with ?all=true)
// Supports pagination via ?page=1 (1-indexed)
brainliftsRouter.get(
  api.brainlifts.list.path,
  requireAuth,
  asyncHandler(async (req, res) => {
    const showAll = req.query.all === 'true' && req.authContext!.isAdmin;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const { brainlifts, total } = showAll
      ? await storage.getAllBrainliftsPaginated(offset, PAGE_SIZE)
      : await storage.getBrainliftsForUserPaginated(req.authContext!, offset, PAGE_SIZE);

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
    res.json(req.brainlift);
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
      input.readingList,
      req.authContext!.userId
    );
    res.status(201).json(brainlift);
  })
);

// Delete brainlift
brainliftsRouter.delete(
  '/api/brainlifts/:id',
  requireAuth,
  requireBrainliftModifyById,
  asyncHandler(async (req, res) => {
    await storage.deleteBrainlift(req.brainlift!.id);
    res.json({ message: "Brainlift deleted successfully" });
  })
);

// Import brainlift from file or URL
brainliftsRouter.post(
  '/api/brainlifts/import',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const sourceType = req.body.sourceType as SourceType;

    const { content: rawContent, sourceLabel } = await extractContent({
      sourceType,
      file: req.file,
      url: req.body.url,
      textContent: req.body.content,
    });

    const content = validateContent(rawContent);

    console.log(`Processing ${sourceLabel}, content length: ${content.length} chars`);

    const brainliftData = await extractBrainlift(content, sourceLabel);
    const brainlift = await saveBrainliftFromAI(brainliftData, content, sourceType, req.authContext!.userId);

    res.status(201).json(brainlift);
  })
);

// Get grades for a brainlift
brainliftsRouter.get(
  '/api/brainlifts/:slug/grades',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const grades = await storage.getGradesByBrainliftId(req.brainlift!.id);
    res.json(grades);
  })
);

// Save a grade for a reading list item
const gradeSchema = z.object({
  readingListItemId: z.number(),
  aligns: z.enum(['yes', 'no', 'partial']).nullable().optional(),
  contradicts: z.enum(['yes', 'no']).nullable().optional(),
  newInfo: z.enum(['yes', 'no']).nullable().optional(),
  quality: z.number().min(1).max(5).nullable().optional(),
});

brainliftsRouter.post(
  '/api/brainlifts/:slug/grades',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const parsed = gradeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid grade data');
    }
    const { readingListItemId, aligns, contradicts, newInfo, quality } = parsed.data;

    const grade = await storage.saveGrade({
      readingListItemId,
      aligns: aligns ?? null,
      contradicts: contradicts ?? null,
      newInfo: newInfo ?? null,
      quality: quality ?? null,
    });
    res.json(grade);
  })
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

    const { content: rawContent, sourceLabel } = await extractContent({
      sourceType,
      file: req.file,
      url: req.body.url,
      textContent: req.body.content,
    });

    const content = validateContent(rawContent);

    console.log(`Updating ${slug} with ${sourceLabel}, content length: ${content.length} chars`);

    const brainliftData = await extractBrainlift(content, sourceLabel);

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

    const readingList = brainliftData.readingList.map((r) => ({
      type: r.type,
      author: r.author,
      topic: r.topic,
      time: r.time,
      facts: r.facts,
      url: r.url,
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
      clusters,
      readingList
    );

    // Run expert extraction and redundancy analysis in parallel after update
    await runPostProcessingPipeline({
      brainliftId: updatedBrainlift.id,
      title: brainliftData.title,
      description: brainliftData.description,
      author: (brainliftData as any).author || null,
      facts: facts,
      originalContent: content,
      readingList: readingList,
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
