import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { dok3GradingEmitter } from '../events/dok3GradingEmitter';
import { createVersion, pruneVersions } from '../storage/versions';
import { propagateStaleFlags } from '../storage/stale';
import { recomputeBrainliftScore } from '../services/brainlift';
import { attachAiWritingSignal } from '../services/aiWritingSignal';
import type { PreviousEvaluation } from '@shared/types/regrading';

export const dok3Router = Router();

/**
 * GET /api/brainlifts/:slug/dok3-insights
 * List all DOK3 insights for a brainlift (excludes scratchpadded by default)
 */
dok3Router.get(
  '/api/brainlifts/:slug/dok3-insights',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const includeScratchpadded = req.query.includeScratchpadded === 'true';
    const insights = await storage.getDOK3Insights(
      req.brainlift!.id,
      includeScratchpadded ? [] : ['scratchpadded']
    );
    const withSignal = await attachAiWritingSignal(insights, 'dok3_insight');
    res.json(withSignal);
  })
);

/**
 * GET /api/brainlifts/:slug/dok3-scratchpad
 * List scratchpadded DOK3 insights
 */
dok3Router.get(
  '/api/brainlifts/:slug/dok3-scratchpad',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const items = await storage.getDOK3ScratchpadItems(req.brainlift!.id);
    res.json(items);
  })
);

/**
 * POST /api/brainlifts/:slug/dok3-insights
 * Create a new DOK3 insight with DOK2 links.
 * Validates multi-source requirement, inserts, and queues grading.
 */
dok3Router.post(
  '/api/brainlifts/:slug/dok3-insights',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { text, linkedDok2Ids } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequestError('text is required and must be a non-empty string');
    }
    if (!Array.isArray(linkedDok2Ids) || linkedDok2Ids.length < 2) {
      throw new BadRequestError('linkedDok2Ids must contain at least 2 DOK2 summary IDs');
    }
    if (!linkedDok2Ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
      throw new BadRequestError('linkedDok2Ids must contain only integers');
    }

    const brainliftId = req.brainlift!.id;

    // Validate multi-source requirement (also checks IDs exist)
    const validation = await storage.validateMultiSourceLinks(linkedDok2Ids);
    if (!validation.valid) {
      throw new BadRequestError(validation.error!);
    }

    // Validate all DOK2 IDs belong to this brainlift
    const allDok2s = await storage.getDOK2Summaries(brainliftId);
    const brainliftDok2Ids = new Set(allDok2s.map((s: { id: number }) => s.id));
    for (const dok2Id of linkedDok2Ids) {
      if (!brainliftDok2Ids.has(dok2Id)) {
        throw new BadRequestError(`DOK2 summary ID ${dok2Id} does not belong to this brainlift`);
      }
    }

    const result = await storage.createDok3Insight({
      brainliftId,
      text: text.trim(),
      linkedDok2Ids,
    });

    // Queue grading job (fire-and-forget)
    try {
      await withJob('dok3:grade')
        .forPayload({ insightId: result.id, brainliftId })
        .queue();
    } catch (err) {
      console.error(`[DOK3 Route] Failed to queue grade job for new insight ${result.id}:`, err);
    }

    res.status(201).json({ id: result.id, status: 'grading' });
  })
);

/**
 * POST /api/brainlifts/:slug/dok3-insights/:id/link
 * Link a DOK3 insight to DOK2 summaries (requires ≥2 from different sources).
 * After linking, queues a dok3:grade job.
 */
dok3Router.post(
  '/api/brainlifts/:slug/dok3-insights/:id/link',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const { dok2SummaryIds } = req.body;
    if (!Array.isArray(dok2SummaryIds) || dok2SummaryIds.length === 0) {
      throw new BadRequestError('dok2SummaryIds must be a non-empty array of numbers');
    }
    if (!dok2SummaryIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
      throw new BadRequestError('dok2SummaryIds must contain only integers');
    }

    const brainliftId = req.brainlift!.id;

    // IDOR check: insight must belong to this brainlift
    const insight = await storage.getDOK3InsightForBrainlift(insightId, brainliftId);
    if (!insight) throw new NotFoundError('DOK3 insight not found');

    if (insight.status !== 'pending_linking') {
      throw new BadRequestError('Insight is not in pending_linking status');
    }

    // Validate multi-source requirement
    const validation = await storage.validateMultiSourceLinks(dok2SummaryIds);
    if (!validation.valid) {
      throw new BadRequestError(validation.error!);
    }

    const updated = await storage.linkDOK3Insight(insightId, brainliftId, dok2SummaryIds);

    // Queue grading job (fire-and-forget)
    try {
      await withJob('dok3:grade')
        .forPayload({ insightId, brainliftId })
        .queue();
    } catch (err) {
      console.error(`[DOK3 Route] Failed to queue grade job for insight ${insightId}:`, err);
    }

    res.json(updated);
  })
);

/**
 * POST /api/brainlifts/:slug/dok3-insights/:id/scratchpad
 * Soft-delete: set insight status to 'scratchpadded'
 */
dok3Router.post(
  '/api/brainlifts/:slug/dok3-insights/:id/scratchpad',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const brainliftId = req.brainlift!.id;

    // IDOR check
    const insight = await storage.getDOK3InsightForBrainlift(insightId, brainliftId);
    if (!insight) throw new NotFoundError('DOK3 insight not found');

    await storage.scratchpadDOK3Insight(insightId, brainliftId);
    res.json({ id: insightId, status: 'scratchpadded' });
  })
);

/**
 * POST /api/brainlifts/:slug/dok3-insights/:id/unscratchpad
 * Undo scratchpad: restore insight to 'pending_linking'
 */
dok3Router.post(
  '/api/brainlifts/:slug/dok3-insights/:id/unscratchpad',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const brainliftId = req.brainlift!.id;

    // IDOR check + status check
    const insight = await storage.getDOK3InsightForBrainlift(insightId, brainliftId);
    if (!insight) throw new NotFoundError('DOK3 insight not found');

    if (insight.status !== 'scratchpadded') {
      throw new BadRequestError('Insight is not scratchpadded');
    }

    await storage.unscratchpadDOK3Insight(insightId, brainliftId);
    res.json({ id: insightId, status: 'pending_linking' });
  })
);

/**
 * GET /api/brainlifts/:slug/dok3-insights/:id/gate-status
 * Check if a DOK3 insight's foundation is fully graded
 */
dok3Router.get(
  '/api/brainlifts/:slug/dok3-insights/:id/gate-status',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const brainliftId = req.brainlift!.id;

    const insight = await storage.getDOK3InsightForBrainlift(insightId, brainliftId);
    if (!insight) throw new NotFoundError('DOK3 insight not found');

    const gateStatus = await storage.checkFoundationGraded(insightId);
    res.json(gateStatus);
  })
);

/**
 * POST /api/brainlifts/:slug/dok3-insights/grade
 * Queue grading for all linked (ungraded) DOK3 insights. Returns 202.
 */
dok3Router.post(
  '/api/brainlifts/:slug/dok3-insights/grade',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainliftId = req.brainlift!.id;

    const insights = await storage.getDOK3Insights(brainliftId);
    const toGrade = insights.filter(i =>
      i.status === 'linked' || i.status === 'error'
    );

    if (toGrade.length === 0) {
      return res.status(200).json({ queued: 0, message: 'No insights to grade' });
    }

    // Queue a job per insight
    let queued = 0;
    for (const insight of toGrade) {
      try {
        await withJob('dok3:grade')
          .forPayload({ insightId: insight.id, brainliftId })
          .queue();
        queued++;
      } catch (err) {
        console.error(`[DOK3 Route] Failed to queue grade job for insight ${insight.id}:`, err);
      }
    }

    res.status(202).json({ queued });
  })
);

/**
 * PATCH /api/brainlifts/:slug/dok3-insights/:id
 * Edit a DOK3 insight's text. Creates version, propagates stale, queues regrade.
 */
dok3Router.patch(
  '/api/brainlifts/:slug/dok3-insights/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequestError('text is required and must be a non-empty string');
    }

    const brainliftId = req.brainlift!.id;

    // Check current state
    const insight = await storage.getDOK3InsightForBrainlift(insightId, brainliftId);
    if (!insight) throw new NotFoundError('DOK3 insight not found');

    if (insight.text === text.trim()) {
      throw new BadRequestError('Text unchanged');
    }

    // Edit insight (returns previous state)
    const editResult = await storage.editDok3Insight(insightId, brainliftId, text.trim());
    if (!editResult) throw new NotFoundError('DOK3 insight not found');

    // Create version snapshot
    await createVersion({
      dokLevel: 3,
      itemId: insightId,
      brainliftId,
      textContent: editResult.previousText,
      score: editResult.previousScore,
      feedback: editResult.previousFeedback,
    });

    // Propagate stale flags to linked DOK4s
    await propagateStaleFlags({
      dokLevel: 3,
      itemId: insightId,
      brainliftId,
      reason: `DOK3 insight ${insightId} edited`,
    });

    await pruneVersions(3, insightId);

    // Build previous evaluation context
    const previousEvaluation: PreviousEvaluation = {
      previousScore: editResult.previousScore ?? 0,
      previousFeedback: editResult.previousFeedback ?? '',
      previousRationale: editResult.previousRationale ?? undefined,
      previousCriteriaBreakdown: editResult.previousCriteriaBreakdown ?? undefined,
      oldText: editResult.previousText,
      newText: text.trim(),
      editNumber: 1,
    };

    // Queue regrade job
    await withJob('dok3:regrade')
      .forPayload({ insightId, brainliftId, previousEvaluation })
      .queue();

    res.json({
      id: insightId,
      status: 'regrading',
      previousScore: editResult.previousScore,
    });
  })
);

/**
 * DELETE /api/brainlifts/:slug/dok3-insights/:id
 * Delete a DOK3 insight. Supports ?preview=true for impact preview.
 */
dok3Router.delete(
  '/api/brainlifts/:slug/dok3-insights/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const insightId = parseInt(req.params.id);
    if (isNaN(insightId)) throw new BadRequestError('Invalid insight ID');

    const brainliftId = req.brainlift!.id;

    // Preview mode
    if (req.query.preview === 'true') {
      const impact = await storage.getDok3DeleteImpact(insightId, brainliftId);
      if (!impact) throw new NotFoundError('DOK3 insight not found');
      return res.json(impact);
    }

    // Actual delete
    const result = await storage.deleteDok3Insight(insightId, brainliftId);
    if (!result) throw new NotFoundError('DOK3 insight not found');

    await recomputeBrainliftScore(brainliftId, {
      trigger: 'delete',
      dokLevel: 3,
      itemId: insightId,
    });

    res.json(result);
  })
);

/**
 * GET /api/brainlifts/:slug/dok3-grading-events
 * SSE endpoint for real-time DOK3 grading updates.
 * No asyncHandler — SSE endpoints manage their own response lifecycle.
 */
dok3Router.get(
  '/api/brainlifts/:slug/dok3-grading-events',
  requireAuth,
  requireBrainliftAccess,
  (req, res) => {
    const brainlift = req.brainlift!;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ brainliftId: brainlift.id })}\n\n`);

    if (!dok3GradingEmitter.isGradingActive(brainlift.id)) {
      res.write(`event: idle\ndata: ${JSON.stringify({ message: 'No active grading' })}\n\n`);
    }

    // Subscribe to grading events
    const unsubscribe = dok3GradingEmitter.subscribe(brainlift.id, (event) => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection when all grading is done
      if (event.type === 'dok3:done') {
        setTimeout(() => res.end(), 100);
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      unsubscribe();
    });

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  }
);
