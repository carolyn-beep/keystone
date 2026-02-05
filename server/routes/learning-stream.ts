import { Router } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { z } from 'zod';
import { swarmEmitter } from '../ai/learning-stream-swarm';

export const learningStreamRouter = Router();

/**
 * Auto-queue research job when all pending items have been processed.
 * Fire-and-forget - errors are logged but don't affect the response.
 * The job's idempotency check handles race conditions.
 */
async function maybeRefillStream(brainliftId: number): Promise<void> {
  try {
    const stats = await storage.getLearningStreamStats(brainliftId);
    if (stats.pending === 0) {
      const { withJob } = await import('../utils/withJob');
      await withJob('learning-stream:research')
        .forPayload({ brainliftId })
        .queue();
      console.log(`[Learning Stream] Auto-queued refill for brainlift ${brainliftId}`);
    }
  } catch (err) {
    // Non-critical - log and continue
    console.error('[Learning Stream] Failed to auto-queue refill:', err);
  }
}

/**
 * GET /api/brainlifts/:slug/learning-stream
 * Get all learning stream items (optionally filter by status)
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const status = req.query.status as string | undefined;

    const validStatuses = ['pending', 'bookmarked', 'graded', 'discarded'];
    if (status && !validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const items = await storage.getLearningStreamItems(
      brainlift.id,
      status as 'pending' | 'bookmarked' | 'graded' | 'discarded' | undefined
    );

    res.json(items);
  })
);

/**
 * GET /api/brainlifts/:slug/learning-stream/stats
 * Get learning stream statistics (includes isResearching flag)
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream/stats',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const [stats, isResearching] = await Promise.all([
      storage.getLearningStreamStats(brainlift.id),
      storage.hasResearchJobPending(brainlift.id),
    ]);
    res.json({ ...stats, isResearching });
  })
);

/**
 * PATCH /api/brainlifts/:slug/learning-stream/:itemId/bookmark
 * Bookmark a learning stream item
 */
learningStreamRouter.patch(
  '/api/brainlifts/:slug/learning-stream/:itemId/bookmark',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const updated = await storage.updateLearningStreamItemStatus(
      itemId,
      brainlift.id,
      'bookmarked'
    );

    if (!updated) {
      throw new NotFoundError('Item not found or does not belong to this brainlift');
    }

    // Auto-refill stream if this was the last pending item
    // DISABLED: Temporarily commented out for testing
    // maybeRefillStream(brainlift.id);

    res.json(updated);
  })
);

/**
 * PATCH /api/brainlifts/:slug/learning-stream/:itemId/discard
 * Discard a learning stream item
 */
learningStreamRouter.patch(
  '/api/brainlifts/:slug/learning-stream/:itemId/discard',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const updated = await storage.updateLearningStreamItemStatus(
      itemId,
      brainlift.id,
      'discarded'
    );

    if (!updated) {
      throw new NotFoundError('Item not found or does not belong to this brainlift');
    }

    // Auto-refill stream if this was the last pending item
    // DISABLED: Temporarily commented out for testing
    // maybeRefillStream(brainlift.id);

    res.json(updated);
  })
);

/**
 * POST /api/brainlifts/:slug/learning-stream/:itemId/grade
 * Grade a learning stream item
 */
learningStreamRouter.post(
  '/api/brainlifts/:slug/learning-stream/:itemId/grade',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const gradeSchema = z.object({
      quality: z.number().min(1).max(5),
      alignment: z.enum(['yes', 'no']),
    });

    const validated = gradeSchema.parse(req.body);

    const updated = await storage.gradeLearningStreamItem(
      itemId,
      brainlift.id,
      validated
    );

    if (!updated) {
      throw new NotFoundError('Item not found or does not belong to this brainlift');
    }

    // Auto-refill stream if this was the last pending item
    // DISABLED: Temporarily commented out for testing
    // maybeRefillStream(brainlift.id);

    res.json(updated);
  })
);

/**
 * POST /api/brainlifts/:slug/learning-stream/refresh
 * Trigger research to get new sources (only if no pending items)
 */
learningStreamRouter.post(
  '/api/brainlifts/:slug/learning-stream/refresh',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Check if pending items exist
    const stats = await storage.getLearningStreamStats(brainlift.id);
    if (stats.pending > 0) {
      throw new BadRequestError(
        `Cannot refresh: ${stats.pending} pending items. Bookmark, grade, or discard them first.`
      );
    }

    // Queue research job
    const { withJob } = await import('../utils/withJob');
    await withJob('learning-stream:research')
      .forPayload({ brainliftId: brainlift.id })
      .queue();

    res.json({
      message: 'Research queued. New sources will appear shortly.',
      stats,
    });
  })
);

/**
 * GET /api/brainlifts/:slug/learning-stream/swarm-events
 * Server-Sent Events endpoint for real-time swarm monitoring.
 * Streams events from the running swarm for this brainlift.
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream/swarm-events',
  requireAuth,
  requireBrainliftAccess,
  (req, res) => {
    const brainlift = req.brainlift!;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ brainliftId: brainlift.id })}\n\n`);

    // Check if a swarm is active
    if (!swarmEmitter.isSwarmActive(brainlift.id)) {
      // No active swarm - send idle status and keep connection open
      res.write(`event: idle\ndata: ${JSON.stringify({ message: 'No active swarm' })}\n\n`);
    }

    // Subscribe to swarm events
    const unsubscribe = swarmEmitter.subscribe(brainlift.id, (event) => {
      // Format as SSE
      res.write(`id: ${event.id}\n`);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);

      // Close connection when swarm completes
      if (event.type === 'swarm:complete') {
        setTimeout(() => {
          res.end();
        }, 100);
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

/**
 * GET /api/brainlifts/:slug/learning-stream/swarm-status
 * Get current swarm status (active/idle) and agent states.
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream/swarm-status',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    const isActive = swarmEmitter.isSwarmActive(brainlift.id);
    const swarmState = swarmEmitter.getSwarmState(brainlift.id);

    if (!isActive || !swarmState) {
      res.json({
        active: false,
        agents: [],
      });
      return;
    }

    const agents = Array.from(swarmState.agents.values()).map((agent) => ({
      agentNumber: agent.agentNumber,
      description: agent.description,
      resourceType: agent.resourceType,
      status: agent.status,
      startTime: agent.startTime,
      endTime: agent.endTime,
      result: agent.result,
      eventCount: agent.events.length,
    }));

    res.json({
      active: true,
      startTime: swarmState.startTime,
      agents,
    });
  })
);
