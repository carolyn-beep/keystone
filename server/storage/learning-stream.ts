import {
  db, eq, and, sql, inArray,
  learningStreamItems, swarmUsage,
  type LearningStreamItem, type NewLearningStreamItem
} from './base';
import type { ExtractedContent } from '@shared/schema';
import type { RunSpec } from '@shared/research-stream';
import { withJob } from '../utils/withJob';
import { pool } from '../db';
import { z } from 'zod';

// URL validation schema - only allow http/https protocols to prevent XSS
const urlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Only http/https URLs allowed');

/**
 * Add a new item to the learning stream (status='pending' by default)
 * If URL already exists for this brainlift, returns the existing item (skips duplicate)
 */
export async function addLearningStreamItem(
  brainliftId: number,
  item: {
    type: string;
    author: string;
    topic: string;
    time: string;
    facts: string;
    url: string;
    source: 'quick-search' | 'deep-research' | 'twitter' | 'swarm-research' | 'manual' | 'starter-pack';
    relevanceScore?: string | null;
    aiRationale?: string | null;
    categoryId?: number | null;
  }
): Promise<LearningStreamItem> {
  // Validate URL to prevent XSS attacks (javascript:, data:, file:// protocols)
  const validatedUrl = urlSchema.parse(item.url);

  try {
    const [inserted] = await db.insert(learningStreamItems).values({
      brainliftId,
      type: item.type,
      author: item.author,
      topic: item.topic,
      time: item.time,
      facts: item.facts,
      url: validatedUrl,
      source: item.source,
      status: 'pending',
      relevanceScore: item.relevanceScore || null,
      aiRationale: item.aiRationale || null,
      categoryId: item.categoryId ?? null,
    }).returning();

    // Fire-and-forget: queue content extraction in background
    withJob('learning-stream:extract-content')
      .forPayload({ itemId: inserted.id, brainliftId, url: inserted.url })
      .queue()
      .catch(err => console.error('[Content Extract] Failed to queue:', err));

    return inserted;
  } catch (error: any) {
    // Handle duplicate URL constraint violation (23505 = unique_violation)
    if (error.code === '23505' && error.constraint === 'unique_brainlift_url') {
      // Fetch and return the existing item
      const [existing] = await db.select()
        .from(learningStreamItems)
        .where(and(
          eq(learningStreamItems.brainliftId, brainliftId),
          eq(learningStreamItems.url, validatedUrl)
        ))
        .limit(1);

      if (existing) {
        return existing;
      }
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Get all learning stream items for a brainlift (optionally filter by status)
 */
export async function getLearningStreamItems(
  brainliftId: number,
  status?: 'pending' | 'bookmarked' | 'graded' | 'discarded'
): Promise<LearningStreamItem[]> {
  if (status) {
    return db.select()
      .from(learningStreamItems)
      .where(and(
        eq(learningStreamItems.brainliftId, brainliftId),
        eq(learningStreamItems.status, status)
      ))
      .orderBy(learningStreamItems.createdAt);
  }

  return db.select()
    .from(learningStreamItems)
    .where(eq(learningStreamItems.brainliftId, brainliftId))
    .orderBy(learningStreamItems.createdAt);
}

/**
 * Update learning stream item status (bookmark/discard)
 */
export async function updateLearningStreamItemStatus(
  itemId: number,
  brainliftId: number,
  status: 'pending' | 'bookmarked' | 'discarded'
): Promise<LearningStreamItem | null> {
  const [updated] = await db.update(learningStreamItems)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ))
    .returning();

  return updated || null;
}

/**
 * Backfill presentation metadata (topic/author/type) discovered during
 * content extraction — used for pasted manual items whose insert-time values
 * are placeholders (raw URL as topic, hostname as author, type 'News').
 * Only provided, non-empty fields are written. IDOR-safe: brainliftId in the
 * WHERE clause.
 */
export async function updateLearningStreamItemMetadata(
  itemId: number,
  brainliftId: number,
  patch: { topic?: string; author?: string; type?: string },
): Promise<void> {
  const set: Partial<{ topic: string; author: string; type: string }> = {};
  if (patch.topic) set.topic = patch.topic;
  if (patch.author) set.author = patch.author;
  if (patch.type) set.type = patch.type;
  if (Object.keys(set).length === 0) return;

  await db.update(learningStreamItems)
    .set({ ...set, updatedAt: new Date() })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ));
}

/**
 * Grade a learning stream item
 */
export async function gradeLearningStreamItem(
  itemId: number,
  brainliftId: number,
  grading: {
    quality: number; // 1-5
    alignment: 'yes' | 'no';
  }
): Promise<LearningStreamItem | null> {
  const [updated] = await db.update(learningStreamItems)
    .set({
      status: 'graded',
      quality: grading.quality,
      alignment: grading.alignment,
      updatedAt: new Date(),
    })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ))
    .returning();

  return updated || null;
}

/**
 * Get learning stream stats for a brainlift (using SQL aggregation)
 */
export async function getLearningStreamStats(brainliftId: number): Promise<{
  total: number;
  pending: number;
  bookmarked: number;
  graded: number;
  discarded: number;
}> {
  const result = await db
    .select({
      status: learningStreamItems.status,
      count: sql<number>`count(*)::int`,
    })
    .from(learningStreamItems)
    .where(eq(learningStreamItems.brainliftId, brainliftId))
    .groupBy(learningStreamItems.status);

  // Convert array of { status, count } to stats object
  const stats = { total: 0, pending: 0, bookmarked: 0, graded: 0, discarded: 0 };
  for (const row of result) {
    const count = row.count;
    stats.total += count;
    if (row.status === 'pending') stats.pending = count;
    else if (row.status === 'bookmarked') stats.bookmarked = count;
    else if (row.status === 'graded') stats.graded = count;
    else if (row.status === 'discarded') stats.discarded = count;
  }

  return stats;
}

/**
 * Check if there's a pending or running research job for this brainlift.
 * Queries graphile_worker's jobs table directly.
 */
export async function hasResearchJobPending(brainliftId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM graphile_worker._private_jobs j
     JOIN graphile_worker._private_tasks t ON j.task_id = t.id
     WHERE t.identifier = 'learning-stream:research'
       AND j.payload->>'brainliftId' = $1::text
     LIMIT 1`,
    [brainliftId.toString()]
  );

  return result.rows.length > 0;
}

/**
 * Check if a URL already exists in the learning stream for a brainlift.
 * Used by the swarm to avoid duplicate research.
 */
export async function checkLearningStreamDuplicate(
  brainliftId: number,
  url: string
): Promise<boolean> {
  const [existing] = await db.select({ id: learningStreamItems.id })
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.brainliftId, brainliftId),
      eq(learningStreamItems.url, url)
    ))
    .limit(1);

  return !!existing;
}

/**
 * Get existing learning stream URLs for downstream research deduplication.
 */
export async function getLearningStreamUrls(brainliftId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ url: learningStreamItems.url })
    .from(learningStreamItems)
    .where(eq(learningStreamItems.brainliftId, brainliftId));

  return Array.from(new Set(rows.map((row) => row.url).filter((url): url is string => Boolean(url))));
}

/**
 * Get a single learning stream item by ID (IDOR-safe via brainliftId check).
 */
export async function getLearningStreamItemById(
  itemId: number,
  brainliftId: number
): Promise<LearningStreamItem | null> {
  const [item] = await db.select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ))
    .limit(1);

  return item || null;
}

/**
 * Get a single learning stream item by URL and brainliftId.
 * Uses the existing unique_brainlift_url constraint columns.
 */
export async function getLearningStreamItemByUrl(
  url: string,
  brainliftId: number
): Promise<LearningStreamItem | null> {
  const [item] = await db.select()
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.url, url),
      eq(learningStreamItems.brainliftId, brainliftId)
    ))
    .limit(1);

  return item || null;
}

/**
 * Cache extracted content for inline viewing.
 * IDOR-safe: includes brainliftId in the WHERE clause.
 */
export async function cacheExtractedContent(
  itemId: number,
  brainliftId: number,
  content: ExtractedContent
): Promise<void> {
  await db.update(learningStreamItems)
    .set({ extractedContent: content, updatedAt: new Date() })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ));
}

/**
 * Clear cached extracted content so extraction can be retried.
 * IDOR-safe: includes brainliftId in the WHERE clause.
 */
export async function clearExtractedContent(
  itemId: number,
  brainliftId: number
): Promise<void> {
  await db.update(learningStreamItems)
    .set({ extractedContent: null, updatedAt: new Date() })
    .where(and(
      eq(learningStreamItems.id, itemId),
      eq(learningStreamItems.brainliftId, brainliftId)
    ));
}

// === Swarm Usage Rate Limiting ===

const DAILY_SWARM_LIMIT = parseInt(process.env.DAILY_SWARM_LIMIT || '3', 10);

/**
 * Get swarm usage for today (UTC day boundary).
 */
export async function getSwarmUsageToday(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(swarmUsage)
    .where(and(
      eq(swarmUsage.userId, userId),
      sql`${swarmUsage.createdAt} >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
      // Quick (starter-pack) runs are recorded for cost observability but do NOT
      // consume the daily cap (spec 05 Assumption 1). `IS DISTINCT FROM` keeps
      // NULL/absent run_spec rows counted.
      sql`${swarmUsage.runSpec}->>'quick' IS DISTINCT FROM 'true'`
    ));

  const used = result?.count ?? 0;
  return {
    used,
    limit: DAILY_SWARM_LIMIT,
    remaining: Math.max(0, DAILY_SWARM_LIMIT - used),
  };
}

/**
 * Record a swarm usage event.
 *
 * Note: `runSpec` is required by the new /launch contract (spec 03) but kept
 * optional in the signature so legacy callers that haven't migrated still
 * compile. The column is nullable in the DB.
 */
export async function recordSwarmUsage(userId: string, brainliftId: number, runSpec?: RunSpec): Promise<number> {
  const [inserted] = await db.insert(swarmUsage).values({ userId, brainliftId, runSpec }).returning({ id: swarmUsage.id });
  return inserted.id;
}

/**
 * Return the runId of the most recent swarm_usage row for this brainlift.
 * Used to surface `existingRunId` in 409 responses when a research job is
 * already in flight. The pairing with `hasResearchJobPending` is an
 * acceptable approximation (a freshly-launched job inserts swarm_usage before
 * queueing — see spec 03 Decision 6).
 */
export async function getActiveRunIdForBrainlift(brainliftId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: swarmUsage.id })
    .from(swarmUsage)
    .where(eq(swarmUsage.brainliftId, brainliftId))
    .orderBy(sql`${swarmUsage.createdAt} DESC`)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Update post-run estimated cost for a swarm usage event.
 */
export async function updateSwarmUsageEstimatedUsd(runId: number, usd: number): Promise<void> {
  await db
    .update(swarmUsage)
    .set({ estimatedUsd: usd.toFixed(4) })
    .where(eq(swarmUsage.id, runId));
}

// === Starter Pack (spec 05) ===

/**
 * Whether a starter-pack run has ever produced a row for this brainlift (any
 * status). Used to enforce one pack per brainlift — a first run that yielded
 * zero items leaves no rows, so a re-fire is naturally allowed.
 */
export async function hasStarterPackItems(brainliftId: number): Promise<boolean> {
  const [existing] = await db.select({ id: learningStreamItems.id })
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.brainliftId, brainliftId),
      eq(learningStreamItems.source, 'starter-pack'),
    ))
    .limit(1);

  return !!existing;
}

/**
 * Pending starter-pack candidates for the scope filter (DB-side status+source
 * filtering). Projects only the fields the filter needs.
 */
export async function getPendingStarterPackItems(
  brainliftId: number,
): Promise<Array<{ id: number; topic: string; facts: string; url: string }>> {
  return db.select({
    id: learningStreamItems.id,
    topic: learningStreamItems.topic,
    facts: learningStreamItems.facts,
    url: learningStreamItems.url,
  })
    .from(learningStreamItems)
    .where(and(
      eq(learningStreamItems.brainliftId, brainliftId),
      eq(learningStreamItems.status, 'pending'),
      eq(learningStreamItems.source, 'starter-pack'),
    ));
}

/**
 * Discard the given starter-pack items in one brainlift-scoped batch UPDATE.
 * No-op for an empty id list.
 */
export async function discardStarterPackItems(
  itemIds: number[],
  brainliftId: number,
): Promise<void> {
  if (itemIds.length === 0) return;
  await db.update(learningStreamItems)
    .set({ status: 'discarded', updatedAt: new Date() })
    .where(and(
      inArray(learningStreamItems.id, itemIds),
      eq(learningStreamItems.brainliftId, brainliftId),
    ));
}
