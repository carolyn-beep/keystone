import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { dok4GradingEmitter } from '../events/dok4GradingEmitter';

export const dok4Router = Router();

/**
 * GET /api/brainlifts/:slug/dok4-spovs
 * List all DOK4 SPOVs for a brainlift with DOK3 link data.
 */
dok4Router.get(
  '/api/brainlifts/:slug/dok4-spovs',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const spovs = await storage.getDOK4Spovs(req.brainlift!.id);
    res.json(spovs);
  })
);

/**
 * GET /api/brainlifts/:slug/dok4-spovs/:id/evaluation
 * Get a single SPOV with full evaluation detail.
 */
dok4Router.get(
  '/api/brainlifts/:slug/dok4-spovs/:id/evaluation',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const spovId = parseInt(req.params.id);
    if (isNaN(spovId)) throw new BadRequestError('Invalid SPOV ID');

    const spovs = await storage.getDOK4Spovs(req.brainlift!.id);
    const spov = spovs.find(s => s.id === spovId);

    if (!spov) throw new NotFoundError('SPOV not found');

    res.json(spov);
  })
);

/**
 * POST /api/brainlifts/:slug/dok4-spovs/:id/link
 * Manually link a DOK4 SPOV to DOK3 insights with primary designation.
 * Body: { links: Array<{ dok3InsightId: number; isPrimary: boolean }> }
 * Validates: non-empty links, exactly one isPrimary=true.
 * If all linked DOK3s are graded, queues dok4:grade job.
 */
dok4Router.post(
  '/api/brainlifts/:slug/dok4-spovs/:id/link',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const spovId = parseInt(req.params.id);
    if (isNaN(spovId)) throw new BadRequestError('Invalid SPOV ID');

    const { links } = req.body;
    if (!Array.isArray(links) || links.length === 0) {
      throw new BadRequestError('links must be a non-empty array');
    }

    // Validate link structure
    for (const link of links) {
      if (typeof link !== 'object' || link === null) {
        throw new BadRequestError('Each link must be an object with dok3InsightId and isPrimary');
      }
      if (typeof link.dok3InsightId !== 'number' || typeof link.isPrimary !== 'boolean') {
        throw new BadRequestError('Each link must have dok3InsightId (number) and isPrimary (boolean)');
      }
    }

    // Validate exactly one isPrimary
    const primaryCount = links.filter((l: { isPrimary: boolean }) => l.isPrimary).length;
    if (primaryCount !== 1) {
      throw new BadRequestError('Exactly one link must have isPrimary=true');
    }

    const brainliftId = req.brainlift!.id;

    // IDOR check: SPOV must belong to brainlift
    const spovs = await storage.getDOK4Spovs(brainliftId);
    const spov = spovs.find(s => s.id === spovId);
    if (!spov) throw new NotFoundError('SPOV not found');

    if (spov.status !== 'pending_linking') {
      throw new BadRequestError('SPOV is not in pending_linking status');
    }

    // Link the SPOV
    await storage.linkDOK4Spov(spovId, brainliftId, links);

    // Check if all linked DOK3 insights are graded to determine if we should queue grading
    const dok3Ids = links.map((l: { dok3InsightId: number }) => l.dok3InsightId);
    const allInsights = await storage.getDOK3Insights(brainliftId);
    const linkedInsights = allInsights.filter(i => dok3Ids.includes(i.id));
    const allGraded = linkedInsights.length > 0 && linkedInsights.every(i => i.status === 'graded');

    let gradingQueued = false;
    if (allGraded) {
      try {
        await withJob('dok4:grade')
          .forPayload({ spovId, brainliftId })
          .queue();
        gradingQueued = true;
      } catch (err) {
        console.error(`[DOK4 Route] Failed to queue grade job for SPOV ${spovId}:`, err);
      }
    }

    // Return the updated SPOV
    const updatedSpovs = await storage.getDOK4Spovs(brainliftId);
    const updatedSpov = updatedSpovs.find(s => s.id === spovId);

    res.json({ spov: updatedSpov, gradingQueued });
  })
);

/**
 * POST /api/brainlifts/:slug/dok4-spovs/grade
 * Queue grading for all linked (ungraded) DOK4 SPOVs. Returns 202.
 */
dok4Router.post(
  '/api/brainlifts/:slug/dok4-spovs/grade',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainliftId = req.brainlift!.id;

    const spovs = await storage.getDOK4Spovs(brainliftId);
    const toGrade = spovs.filter(s =>
      s.status === 'linked' || s.status === 'error'
    );

    if (toGrade.length === 0) {
      return res.status(200).json({ queued: 0, message: 'No SPOVs to grade' });
    }

    let queued = 0;
    for (const spov of toGrade) {
      try {
        await withJob('dok4:grade')
          .forPayload({ spovId: spov.id, brainliftId })
          .queue();
        queued++;
      } catch (err) {
        console.error(`[DOK4 Route] Failed to queue grade job for SPOV ${spov.id}:`, err);
      }
    }

    res.status(202).json({ queued });
  })
);

/**
 * POST /api/brainlifts/:slug/dok4-spovs/:id/retry
 * Retry grading for a single SPOV (error or graded status).
 */
dok4Router.post(
  '/api/brainlifts/:slug/dok4-spovs/:id/retry',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const spovId = parseInt(req.params.id);
    if (isNaN(spovId)) throw new BadRequestError('Invalid SPOV ID');

    const brainliftId = req.brainlift!.id;

    const spovs = await storage.getDOK4Spovs(brainliftId);
    const spov = spovs.find(s => s.id === spovId);

    if (!spov) throw new NotFoundError('SPOV not found');

    if (spov.status !== 'error' && spov.status !== 'graded') {
      throw new BadRequestError('SPOV is not in a retryable state (must be error or graded)');
    }

    // Reset to linked before re-queuing
    await storage.updateDOK4SpovStatus(spovId, brainliftId, 'linked');

    await withJob('dok4:grade')
      .forPayload({ spovId, brainliftId })
      .queue();

    res.json({ queued: true });
  })
);

/**
 * GET /api/brainlifts/:slug/dok4-grading-events
 * SSE endpoint for real-time DOK4 grading updates.
 * No asyncHandler -- SSE endpoints manage their own response lifecycle.
 */
dok4Router.get(
  '/api/brainlifts/:slug/dok4-grading-events',
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

    if (!dok4GradingEmitter.isGradingActive(brainlift.id)) {
      res.write(`event: idle\ndata: ${JSON.stringify({ message: 'No active DOK4 grading' })}\n\n`);
    }

    // Subscribe to grading events
    const unsubscribe = dok4GradingEmitter.subscribe(brainlift.id, (event) => {
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection when all grading is done
      if (event.type === 'dok4:done') {
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
