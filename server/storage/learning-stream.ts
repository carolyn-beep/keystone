import {
  db, eq, and, sql,
  learningStreamItems,
  type LearningStreamItem, type NewLearningStreamItem
} from './base';
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
    source: 'quick-search' | 'deep-research' | 'twitter';
    relevanceScore?: string | null;
    aiRationale?: string | null;
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
    }).returning();

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
  status: 'bookmarked' | 'discarded'
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
