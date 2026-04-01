/**
 * Knowledge Tree Routes (Phase 3)
 *
 * Endpoints for the Builder Phase 3 knowledge tree:
 * - GET    /api/brainlifts/:slug/knowledge-tree          (three-section list)
 * - POST   /api/brainlifts/:slug/knowledge-tree/manual-source  (create manual source)
 * - GET    /api/brainlifts/:slug/knowledge-tree/items/:itemId  (item detail)
 * - DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/extractions  (delete extractions)
 * - POST   /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts  (create manual fact)
 * - PATCH  /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId  (update fact)
 * - DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId  (delete fact)
 * - POST   /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries  (create manual summary)
 * - PATCH  /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId  (update summary)
 * - DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId  (delete summary)
 */

import { Router } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { swarmEmitter } from '../ai/learning-stream-swarm';
import { z } from 'zod';

export const knowledgeTreeRouter = Router();

// Input validation schemas
const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required'),
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name cannot be empty').optional(),
  sortOrder: z.number().int().nullable().optional(),
}).refine(data => data.name !== undefined || data.sortOrder !== undefined, {
  message: 'At least one field required',
});

const reassignCategorySchema = z.object({
  categoryId: z.number().int().nullable(),
});

const createManualFactSchema = z.object({
  fact: z.string().trim().min(1, 'Fact text is required'),
});

const updateManualFactSchema = z.object({
  fact: z.string().trim().min(1, 'Fact text is required'),
});

const createManualSummarySchema = z.object({
  summaryPoints: z.array(z.string().trim().min(1)).min(1, 'At least one summary point is required'),
  relatedFactIds: z.array(z.number()).default([]),
});

const updateManualSummarySchema = z.object({
  summaryPoints: z.array(z.string().trim().min(1)).min(1, 'At least one summary point is required'),
  relatedFactIds: z.array(z.number()).default([]),
});

// Input validation for manual source creation
const createManualSourceSchema = z.object({
  url: z.string().url().refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Only http/https URLs allowed'),
  title: z.string().trim().min(1, 'Title is required'),
});

/**
 * GET /api/brainlifts/:slug/knowledge-tree
 * Returns the three-section knowledge tree list with research and phase3 metadata.
 */
knowledgeTreeRouter.get(
  '/api/brainlifts/:slug/knowledge-tree',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Must be a native brainlift
    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Knowledge tree is only available for native brainlifts');
    }

    // Get native details for phase3 status
    const nativeDetails = await storage.getNativeDetailsBySlug(req.params.slug);
    if (!nativeDetails) {
      throw new NotFoundError('Native details not found');
    }

    // Get knowledge tree data and research status in parallel
    const [treeData, isJobPending, isSwarmRunning] = await Promise.all([
      storage.getKnowledgeTree(brainlift.id),
      storage.hasResearchJobPending(brainlift.id),
      Promise.resolve(swarmEmitter.isSwarmActive(brainlift.id)),
    ]);

    const isRunning = isJobPending || isSwarmRunning;
    const canRelaunch = treeData.unprocessed.length === 0;

    // Determine phase3 status
    const unlocked = nativeDetails.phaseProgress.phase3 !== 'locked';
    const justUnlocked = unlocked && !nativeDetails.phase3CelebratedAt;

    res.json({
      unprocessed: treeData.unprocessed,
      triaged: treeData.triaged,
      saved: treeData.saved,
      categories: treeData.categories,
      research: { isRunning, canRelaunch },
      phase3: { unlocked, justUnlocked },
    });
  })
);

/**
 * POST /api/brainlifts/:slug/knowledge-tree/manual-source
 * Create a manual source LS item. Returns 409 for duplicate URLs.
 */
knowledgeTreeRouter.post(
  '/api/brainlifts/:slug/knowledge-tree/manual-source',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Manual sources are only available for native brainlifts');
    }

    const input = createManualSourceSchema.parse(req.body);

    // Check for duplicate URL
    const existing = await storage.getLearningStreamItemByUrl(input.url, brainlift.id);
    if (existing) {
      res.status(409).json({
        error: 'DUPLICATE_URL',
        message: 'A source with this URL already exists.',
        existingItem: {
          id: existing.id,
          status: existing.status,
          title: existing.topic,
        },
      });
      return;
    }

    // Create the manual source
    const item = await storage.createManualSource(brainlift.id, input.url, input.title);

    // Queue content extraction in background
    const { withJob } = await import('../utils/withJob');
    withJob('learning-stream:extract-content')
      .forPayload({ itemId: item.id, brainliftId: brainlift.id, url: item.url })
      .withOptions({ jobKey: `extract-content-${item.id}` })
      .queue()
      .catch(err => console.error('[Content Extract] Failed to queue for manual source:', err));

    res.status(201).json({
      learningStreamItem: item,
      openDetail: { itemId: item.id },
    });
  })
);

/**
 * GET /api/brainlifts/:slug/knowledge-tree/items/:itemId
 * Get item detail with linked facts and DOK2 summaries.
 */
knowledgeTreeRouter.get(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const detail = await storage.getItemDetail(itemId, brainlift.id);
    if (!detail) {
      throw new NotFoundError('Item not found');
    }

    res.json(detail);
  })
);

/**
 * DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/extractions
 * Delete all facts and DOK2 summaries linked to the item.
 * The LS item itself stays bookmarked (reverts to triaged in the list).
 */
knowledgeTreeRouter.delete(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/extractions',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    // Verify item exists and belongs to brainlift
    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    const deletedCounts = await storage.deleteExtractions(itemId, brainlift.id);

    res.json({
      success: true,
      deletedCounts,
    });
  })
);

// ─── Category CRUD ──────────────────────────────────────────────────────────

/**
 * GET /api/brainlifts/:slug/categories
 * List all categories for the brainlift with source counts.
 */
knowledgeTreeRouter.get(
  '/api/brainlifts/:slug/categories',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const categories = await storage.getCategoriesWithCounts(brainlift.id);
    res.json(categories);
  })
);

/**
 * POST /api/brainlifts/:slug/categories
 * Create a new category for the brainlift.
 */
knowledgeTreeRouter.post(
  '/api/brainlifts/:slug/categories',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const input = createCategorySchema.parse(req.body);

    const category = await storage.createCategory(brainlift.id, input.name);
    res.status(201).json(category);
  })
);

/**
 * PATCH /api/brainlifts/:slug/categories/:id
 * Rename or reorder a category.
 */
knowledgeTreeRouter.patch(
  '/api/brainlifts/:slug/categories/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      throw new BadRequestError('Invalid category ID');
    }

    const input = updateCategorySchema.parse(req.body);
    const updated = await storage.updateCategory(categoryId, brainlift.id, input);

    if (!updated) {
      throw new NotFoundError('Category not found');
    }

    res.json(updated);
  })
);

/**
 * DELETE /api/brainlifts/:slug/categories/:id
 * Delete a category. Items in the category become uncategorized (FK SET NULL).
 */
knowledgeTreeRouter.delete(
  '/api/brainlifts/:slug/categories/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      throw new BadRequestError('Invalid category ID');
    }

    const result = await storage.deleteCategory(categoryId, brainlift.id);
    if (!result) {
      throw new NotFoundError('Category not found');
    }

    res.json({ success: true });
  })
);

/**
 * PATCH /api/brainlifts/:slug/learning-stream/:itemId/category
 * Reassign an LS item's category. categoryId = null means uncategorized.
 */
knowledgeTreeRouter.patch(
  '/api/brainlifts/:slug/learning-stream/:itemId/category',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const input = reassignCategorySchema.parse(req.body);

    // Verify item exists and belongs to brainlift
    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    await storage.reassignItemCategory(itemId, brainlift.id, input.categoryId);

    res.json({ success: true });
  })
);

// ─── Manual Fact CRUD ───────────────────────────────────────────────────────

/**
 * POST /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts
 * Create a manual fact linked to the LS item.
 */
knowledgeTreeRouter.post(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/facts',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const input = createManualFactSchema.parse(req.body);
    const result = await storage.createManualFact(itemId, brainlift.id, input.fact);

    if (!result) {
      throw new NotFoundError('Item not found');
    }

    res.status(201).json(result);
  })
);

/**
 * PATCH /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId
 * Update a manual fact. IDOR-safe.
 */
knowledgeTreeRouter.patch(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    const factId = parseInt(req.params.factId);

    if (isNaN(itemId) || isNaN(factId)) {
      throw new BadRequestError('Invalid ID');
    }

    const input = updateManualFactSchema.parse(req.body);
    const result = await storage.updateManualFact(factId, itemId, brainlift.id, input.fact);

    if (!result) {
      throw new NotFoundError('Fact not found');
    }

    res.json(result);
  })
);

/**
 * DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId
 * Delete a manual fact. IDOR-safe.
 */
knowledgeTreeRouter.delete(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/facts/:factId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    const factId = parseInt(req.params.factId);

    if (isNaN(itemId) || isNaN(factId)) {
      throw new BadRequestError('Invalid ID');
    }

    const result = await storage.deleteManualFact(factId, itemId, brainlift.id);

    if (!result) {
      throw new NotFoundError('Fact not found');
    }

    res.json(result);
  })
);

// ─── Manual Summary CRUD ────────────────────────────────────────────────────

/**
 * POST /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries
 * Create a manual DOK2 summary linked to the LS item.
 */
knowledgeTreeRouter.post(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const input = createManualSummarySchema.parse(req.body);
    const result = await storage.createManualSummary(
      itemId, brainlift.id, input.summaryPoints, input.relatedFactIds
    );

    if (!result) {
      throw new NotFoundError('Item not found');
    }

    res.status(201).json(result);
  })
);

/**
 * PATCH /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId
 * Update a manual DOK2 summary. IDOR-safe.
 */
knowledgeTreeRouter.patch(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    const summaryId = parseInt(req.params.summaryId);

    if (isNaN(itemId) || isNaN(summaryId)) {
      throw new BadRequestError('Invalid ID');
    }

    const input = updateManualSummarySchema.parse(req.body);
    const result = await storage.updateManualSummary(
      summaryId, itemId, brainlift.id, input.summaryPoints, input.relatedFactIds
    );

    if (!result) {
      throw new NotFoundError('Summary not found');
    }

    res.json(result);
  })
);

/**
 * DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId
 * Delete a manual DOK2 summary with cascade. IDOR-safe.
 */
knowledgeTreeRouter.delete(
  '/api/brainlifts/:slug/knowledge-tree/items/:itemId/summaries/:summaryId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    const summaryId = parseInt(req.params.summaryId);

    if (isNaN(itemId) || isNaN(summaryId)) {
      throw new BadRequestError('Invalid ID');
    }

    const result = await storage.deleteManualSummary(summaryId, itemId, brainlift.id);

    if (!result) {
      throw new NotFoundError('Summary not found');
    }

    res.json(result);
  })
);

