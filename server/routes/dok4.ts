import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { dok4GradingEmitter } from '../events/dok4GradingEmitter';
import { createVersion, pruneVersions } from '../storage/versions';
import { propagateStaleFlags } from '../storage/stale';
import { recomputeBrainliftScore } from '../services/brainlift';
import { attachAiWritingSignal } from '../services/aiWritingSignal';
import type { PreviousEvaluation } from '@shared/types/regrading';

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
    const withSignal = await attachAiWritingSignal(spovs, 'dok4_spov');
    res.json(withSignal);
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

    const [withSignal] = await attachAiWritingSignal([spov], 'dok4_spov');
    res.json(withSignal);
  })
);

/**
 * POST /api/brainlifts/:slug/dok4-spovs
 * Create a new DOK4 SPOV with DOK3 links and primary designation.
 * Validates all linked DOK3s are graded, inserts, and queues grading.
 */
dok4Router.post(
  '/api/brainlifts/:slug/dok4-spovs',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { text, linkedDok3Ids, primaryDok3Id } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequestError('text is required and must be a non-empty string');
    }
    if (!Array.isArray(linkedDok3Ids) || linkedDok3Ids.length === 0) {
      throw new BadRequestError('linkedDok3Ids must contain at least 1 DOK3 insight ID');
    }
    if (!linkedDok3Ids.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
      throw new BadRequestError('linkedDok3Ids must contain only integers');
    }
    if (typeof primaryDok3Id !== 'number' || !Number.isInteger(primaryDok3Id)) {
      throw new BadRequestError('primaryDok3Id must be an integer');
    }
    if (!linkedDok3Ids.includes(primaryDok3Id)) {
      throw new BadRequestError('primaryDok3Id must be included in linkedDok3Ids');
    }

    const brainliftId = req.brainlift!.id;

    // Validate all DOK3 IDs belong to this brainlift and are graded
    const allInsights = await storage.getDOK3Insights(brainliftId);
    const insightMap = new Map(allInsights.map((i: { id: number; status: string }) => [i.id, i]));

    for (const dok3Id of linkedDok3Ids) {
      const insight = insightMap.get(dok3Id);
      if (!insight) {
        throw new BadRequestError(`DOK3 insight ID ${dok3Id} does not belong to this brainlift`);
      }
      if (insight.status !== 'graded') {
        throw new BadRequestError(`DOK3 insight ID ${dok3Id} is not graded (status: ${insight.status})`);
      }
    }

    const result = await storage.createDok4Spov({
      brainliftId,
      text: text.trim(),
      linkedDok3Ids,
      primaryDok3Id,
    });

    // Queue grading job (fire-and-forget)
    try {
      await withJob('dok4:grade')
        .forPayload({ spovId: result.id, brainliftId })
        .queue();
    } catch (err) {
      console.error(`[DOK4 Route] Failed to queue grade job for new SPOV ${result.id}:`, err);
    }

    res.status(201).json({ id: result.id, status: 'grading' });
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
 * PATCH /api/brainlifts/:slug/dok4-spovs/:id
 * Edit a DOK4 SPOV's text. Creates version, queues regrade.
 * No downstream stale propagation (DOK4 is terminal).
 */
dok4Router.patch(
  '/api/brainlifts/:slug/dok4-spovs/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const spovId = parseInt(req.params.id);
    if (isNaN(spovId)) throw new BadRequestError('Invalid SPOV ID');

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequestError('text is required and must be a non-empty string');
    }

    const brainliftId = req.brainlift!.id;

    // Check current state via existing storage
    const spovs = await storage.getDOK4Spovs(brainliftId);
    const spov = spovs.find(s => s.id === spovId);
    if (!spov) throw new NotFoundError('SPOV not found');

    if (spov.text === text.trim()) {
      throw new BadRequestError('Text unchanged');
    }

    // Edit SPOV (returns previous state)
    const editResult = await storage.editDok4Spov(spovId, brainliftId, text.trim());
    if (!editResult) throw new NotFoundError('SPOV not found');

    // Create version snapshot
    await createVersion({
      dokLevel: 4,
      itemId: spovId,
      brainliftId,
      textContent: editResult.previousText,
      score: editResult.previousScore,
      feedback: editResult.previousFeedback,
    });

    // No stale propagation needed (DOK4 is terminal)

    await pruneVersions(4, spovId);

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
    await withJob('dok4:regrade')
      .forPayload({ spovId, brainliftId, previousEvaluation })
      .queue();

    res.json({
      id: spovId,
      status: 'regrading',
      previousScore: editResult.previousScore,
    });
  })
);

/**
 * DELETE /api/brainlifts/:slug/dok4-spovs/:id
 * Delete a DOK4 SPOV. Supports ?preview=true for impact preview.
 */
dok4Router.delete(
  '/api/brainlifts/:slug/dok4-spovs/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const spovId = parseInt(req.params.id);
    if (isNaN(spovId)) throw new BadRequestError('Invalid SPOV ID');

    const brainliftId = req.brainlift!.id;

    // Preview mode
    if (req.query.preview === 'true') {
      const impact = await storage.getDok4DeleteImpact(spovId, brainliftId);
      if (!impact) throw new NotFoundError('SPOV not found');
      return res.json(impact);
    }

    // Actual delete
    const result = await storage.deleteDok4Spov(spovId, brainliftId);
    if (!result) throw new NotFoundError('SPOV not found');

    await recomputeBrainliftScore(brainliftId, {
      trigger: 'delete',
      dokLevel: 4,
      itemId: spovId,
    });

    res.json(result);
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
