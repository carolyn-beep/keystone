import { Router, type Request, type Response } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import {
  asyncHandler,
  BadRequestError,
  ConflictError,
  NotFoundError,
  RateLimitError,
} from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { z } from 'zod';
import { swarmEmitter } from '../ai/learning-stream-swarm-v2/event-emitter';
import { runResearchSwarm } from '../ai/learning-stream-swarm-v2/run';
import { estimateRunCostUsd } from '../ai/learning-stream-swarm-v2/cost';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { categories, learningStreamItems, sources } from '@shared/schema';
import { orchestrate } from '../ai/learning-stream-swarm-v2/orchestrator';
import { runRequestSchema, type RunSpec } from '@shared/research-stream';

export const learningStreamRouter = Router();

function parseBookmarkItemId(rawValue: string | undefined): number {
  const itemId = parseInt(String(rawValue), 10);
  if (isNaN(itemId)) {
    throw new BadRequestError('Invalid item ID');
  }
  return itemId;
}

function parseBookmarkCategoryId(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    throw new BadRequestError('categoryId required before save to Second Brain');
  }
  return rawValue;
}

export async function bookmarkResearchItemWithSource(args: {
  brainliftId: number;
  itemId: number;
  categoryId: number;
}) {
  return db.transaction(async (tx) => {
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(
        eq(categories.id, args.categoryId),
        eq(categories.brainliftId, args.brainliftId),
      ))
      .limit(1);

    if (!category) {
      throw new BadRequestError('Category does not belong to this brainlift');
    }

    const [item] = await tx
      .select()
      .from(learningStreamItems)
      .where(and(
        eq(learningStreamItems.id, args.itemId),
        eq(learningStreamItems.brainliftId, args.brainliftId),
      ))
      .limit(1);

    if (!item) {
      throw new NotFoundError('Item not found or does not belong to this brainlift');
    }

    const [updatedItem] = await tx
      .update(learningStreamItems)
      .set({
        status: 'bookmarked',
        updatedAt: new Date(),
      })
      .where(and(
        eq(learningStreamItems.id, args.itemId),
        eq(learningStreamItems.brainliftId, args.brainliftId),
      ))
      .returning();

    if (!updatedItem) {
      throw new NotFoundError('Item not found or does not belong to this brainlift');
    }

    const [insertedSource] = await tx
      .insert(sources)
      .values({
        brainliftId: args.brainliftId,
        title: item.topic,
        url: item.url,
        author: item.author,
        categoryId: args.categoryId,
        extractedContent: item.extractedContent,
        learningStreamItemId: item.id,
        // Second Brain v2 enrichment fields — mirrored 1:1 from the
        // learning_stream_items row so saved sources carry the same shape
        // as the Research Stream cards. All four are nullable on the LSI
        // side too, so they may pass through as null.
        type: item.type,
        keyInsights: item.facts,
        length: item.time,
        whyMatters: item.aiRationale,
      })
      .onConflictDoNothing({
        // Re-bookmark of an already-mirrored item returns the existing
        // source row unchanged via the SELECT fallback below; enrichment
        // fields are NOT overwritten on a second bookmark, so any
        // user-edited values survive.
        target: [sources.brainliftId, sources.url],
      })
      .returning();

    const source = insertedSource ?? (await tx
      .select()
      .from(sources)
      .where(and(
        eq(sources.brainliftId, args.brainliftId),
        eq(sources.url, item.url),
      ))
      .limit(1))[0];

    if (!source) {
      throw new NotFoundError('Source not found after bookmark mirror');
    }

    return {
      item: updatedItem,
      source,
    };
  });
}

export async function bookmarkLearningStreamItemHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const itemId = parseBookmarkItemId(req.params.itemId);
  const categoryId = parseBookmarkCategoryId(req.body?.categoryId);

  const result = await bookmarkResearchItemWithSource({
    brainliftId: brainlift.id,
    itemId,
    categoryId,
  });

  res.json(result);
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
 * GET /api/brainlifts/:slug/learning-stream/by-id/:itemId
 * Fetch a single learning stream item regardless of status. Used by the
 * Second Brain source reader to pull the underlying item for the full
 * <ExpandedItemView> (chat + quiz + content) when the user opens an
 * already-bookmarked source.
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream/by-id/:itemId',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);
    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }
    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Item not found');
    }
    res.json(item);
  })
);

/**
 * POST /api/brainlifts/:slug/sources/:sourceId/ensure-learning-stream-item
 * Lazy-create a learning_stream_item for a Second Brain source that
 * doesn't have one yet (manually-added sources, legacy rows). Returns
 * the learning_stream_item so the reader can render the full
 * <ExpandedItemView> with chat / quiz / content tabs.
 *
 * Idempotent: if the source already has a linked item, returns it.
 * Otherwise creates a new item in status='bookmarked', writes the FK
 * back onto the source, and queues content extraction.
 */
learningStreamRouter.post(
  '/api/brainlifts/:slug/sources/:sourceId/ensure-learning-stream-item',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const sourceId = parseInt(req.params.sourceId);
    if (isNaN(sourceId)) {
      throw new BadRequestError('Invalid source ID');
    }

    const source = await storage.getSourceForBrainlift(sourceId, brainlift.id);
    if (!source) throw new NotFoundError('Source not found');

    // Already linked? Just return the item.
    if (source.learningStreamItemId != null) {
      const existing = await storage.getLearningStreamItemById(
        source.learningStreamItemId,
        brainlift.id,
      );
      if (existing) {
        res.json(existing);
        return;
      }
      // FK was stale (item deleted); fall through to create a fresh one.
    }

    // Try to find an existing item for the same URL on this brainlift
    // (unique_brainlift_url constraint). If present, just adopt it.
    let item = await storage.getLearningStreamItemByUrl(source.url, brainlift.id);

    if (!item) {
      item = await storage.addLearningStreamItem(brainlift.id, {
        type: source.type ?? 'News',
        author: source.author ?? 'Unknown',
        topic: source.title,
        time: source.length ?? '5 min',
        facts: source.keyInsights ?? source.title,
        url: source.url,
        source: 'quick-search',
        relevanceScore: null,
        aiRationale: source.whyMatters ?? null,
      });
      // New items default to 'pending'; flip to 'bookmarked' since the
      // source already lives in Second Brain.
      const updated = await storage.updateLearningStreamItemStatus(item.id, brainlift.id, 'bookmarked');
      if (updated) item = updated;
    }

    await storage.updateSourceForBrainlift(source.id, brainlift.id, { learningStreamItemId: item.id });

    // Queue content extraction if there isn't any yet.
    if (!item.extractedContent) {
      const { withJob } = await import('../utils/withJob');
      withJob('learning-stream:extract-content')
        .forPayload({ itemId: item.id, brainliftId: brainlift.id, url: item.url })
        .withOptions({ jobKey: `extract-content-${item.id}` })
        .queue()
        .catch(err => console.error('[Content Extract] Failed to queue on ensure:', err));
    }

    res.json(item);
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
    const authContext = req.authContext!;
    const [stats, isResearching, swarmQuota] = await Promise.all([
      storage.getLearningStreamStats(brainlift.id),
      storage.hasResearchJobPending(brainlift.id),
      authContext.isAdmin
        ? Promise.resolve(null)
        : storage.getSwarmUsageToday(authContext.userId),
    ]);
    res.json({ ...stats, isResearching: isResearching || swarmEmitter.isSwarmActive(brainlift.id), swarmQuota });
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
  asyncHandler(bookmarkLearningStreamItemHandler)
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

    res.json(updated);
  })
);

/**
 * GET /api/brainlifts/:slug/learning-stream/:itemId/content
 * Get extracted content for inline viewing.
 * If content hasn't been extracted yet (old items), queues an extraction job on-demand.
 */
learningStreamRouter.get(
  '/api/brainlifts/:slug/learning-stream/:itemId/content',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    if (item.extractedContent) {
      res.json(item.extractedContent);
    } else {
      // Queue extraction on-demand (idempotent via jobKey — safe to call repeatedly)
      const { withJob } = await import('../utils/withJob');
      withJob('learning-stream:extract-content')
        .forPayload({ itemId, brainliftId: brainlift.id, url: item.url })
        .withOptions({ jobKey: `extract-content-${itemId}` })
        .queue()
        .catch(err => console.error('[Content Extract] Failed to queue on-demand:', err));

      res.json({ contentType: 'pending' });
    }
  })
);

/**
 * POST /api/brainlifts/:slug/learning-stream/:itemId/retry-extract
 * Re-queue content extraction for a failed item
 */
learningStreamRouter.post(
  '/api/brainlifts/:slug/learning-stream/:itemId/retry-extract',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.params.itemId);

    if (isNaN(itemId)) {
      throw new BadRequestError('Invalid item ID');
    }

    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Item not found');
    }

    await storage.clearExtractedContent(itemId, brainlift.id);

    // Queue extraction
    const { withJob } = await import('../utils/withJob');
    await withJob('learning-stream:extract-content')
      .forPayload({ itemId, brainliftId: brainlift.id, url: item.url })
      .withOptions({ jobKey: `extract-content-${itemId}` })
      .queue();

    res.json({ contentType: 'pending' });
  })
);

/**
 * POST /api/brainlifts/:slug/learning-stream/launch
 *
 * Spec 03 endpoint. Validates a `RunRequest`, enforces concurrency (409)
 * and the daily swarm cap (429), runs the orchestrator synchronously, records
 * `swarm_usage` with the resolved `RunSpec`, queues the research job, and
 * returns `{ runId }`.
 *
 * The body is the `RunRequest` at the top level (empty `{}` is valid for Path B).
 * Exported as `launchResearchStreamHandler` so unit tests can invoke it directly.
 */
export async function launchResearchStreamHandler(req: Request, res: Response): Promise<void> {
  const startedAt = Date.now();
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;

  // 1. Parse + validate body.
  const parsed = runRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new BadRequestError(
      'RunRequest failed validation.',
      'invalid_run_request',
      { issues: parsed.error.issues },
    );
  }
  const runRequest = parsed.data;

  // 2. Concurrency check.
  if (swarmEmitter.isSwarmActive(brainlift.id) || await storage.hasResearchJobPending(brainlift.id)) {
    const existingRunId = await storage.getActiveRunIdForBrainlift(brainlift.id);
    throw new ConflictError(
      'A swarm is already running for this brainlift.',
      'research_run_in_progress',
      { existingRunId: existingRunId ?? undefined },
    );
  }

  // 3. Daily cap (admins bypass).
  if (!authContext.isAdmin) {
    const quota = await storage.getSwarmUsageToday(authContext.userId);
    if (quota.remaining <= 0) {
      throw new RateLimitError(
        `Daily swarm limit reached (${quota.used}/${quota.limit}). Resets at midnight UTC.`,
        'daily_limit_reached',
        { limit: quota.limit, used: quota.used },
      );
    }
  }

  // 4. Orchestrate (synchronous). On throw, daily cap is NOT decremented because
  //    recordSwarmUsage runs only after success — user can retry.
  const orchestrated = await orchestrate(brainlift.id, runRequest);
  const runSpec: RunSpec = orchestrated.runSpec;

  // 5. Record usage.
  const runId = await storage.recordSwarmUsage(authContext.userId, brainlift.id, runSpec);

  // 6. Run the interactive swarm in this API process so the in-memory SSE
  //    emitter is the same emitter the browser is subscribed to. Worker-backed
  //    jobs can still run the same v2 runner for automated/non-interactive paths.
  const orchestratorUsage = {
    model: orchestrated.modelUsed,
    inputTokens: orchestrated.usage.inputTokens,
    outputTokens: orchestrated.usage.outputTokens,
  };
  void (async () => {
    try {
      const result = await runResearchSwarm(brainlift.id, runSpec, runId);
      const estimatedUsd = estimateRunCostUsd([
        ...result.slotUsages,
        orchestratorUsage,
      ]);
      await storage.updateSwarmUsageEstimatedUsd(runId, estimatedUsd);
      console.log(
        `[/launch:run] brainlift=${brainlift.id} runId=${runId} ` +
        `saved=${result.totalSaved} failed=${result.failedCount} usd=${estimatedUsd.toFixed(4)}`,
      );
    } catch (error: any) {
      const message = error?.message ?? String(error);
      console.error(`[/launch:run] brainlift=${brainlift.id} runId=${runId} failed`, error);
      swarmEmitter.endSwarm(brainlift.id, {
        success: false,
        totalSaved: 0,
        duplicatesSkipped: 0,
        failedCount: runSpec.agents.length,
        errors: [message],
      });
    }
  })();

  // 7. Launch log line (single Render-searchable record).
  const slotSummary = runSpec.agents.map((a) => a.type).join(',');
  const elapsed = Date.now() - startedAt;
  console.log(
    `[/launch] brainlift=${brainlift.id} user=${authContext.userId} runId=${runId} ` +
    `spec=[${slotSummary}] orchModel=${orchestrated.modelUsed} ms=${elapsed}`,
  );
  if (orchestrated.usedDefault) {
    console.warn(
      `[/launch] runId=${runId} used_default_runspec=true (orchestrator models failed)`,
    );
  }

  res.status(200).json({ runId });
}

learningStreamRouter.post(
  '/api/brainlifts/:slug/learning-stream/launch',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(launchResearchStreamHandler),
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
