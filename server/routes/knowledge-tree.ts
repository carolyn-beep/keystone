/**
 * Knowledge Tree Routes (Phase 3)
 *
 * Endpoints for the Builder Phase 3 knowledge tree:
 * - GET  /api/brainlifts/:slug/knowledge-tree          (three-section list)
 * - POST /api/brainlifts/:slug/knowledge-tree/manual-source  (create manual source)
 * - GET  /api/brainlifts/:slug/knowledge-tree/items/:itemId  (item detail)
 * - DELETE /api/brainlifts/:slug/knowledge-tree/items/:itemId/extractions  (delete extractions)
 * - PATCH /api/brainlifts/:slug/native-details/celebrate-phase3  (celebration ack)
 */

import { Router } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { swarmEmitter } from '../ai/learning-stream-swarm';
import { z } from 'zod';

export const knowledgeTreeRouter = Router();

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

/**
 * PATCH /api/brainlifts/:slug/native-details/celebrate-phase3
 * Sets phase3CelebratedAt to now. Idempotent.
 */
knowledgeTreeRouter.patch(
  '/api/brainlifts/:slug/native-details/celebrate-phase3',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Only native brainlifts support celebration');
    }

    await storage.setCelebratePhase3(brainlift.id);

    res.json({ success: true });
  })
);
