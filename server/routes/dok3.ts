import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { dok3GradingEmitter } from '../events/dok3GradingEmitter';

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
    res.json(insights);
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
