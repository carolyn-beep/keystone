/**
 * Brainlift Sources Storage
 *
 * Manages source URLs curated during the import agent flow.
 * Sources are inserted directly as 'confirmed' by the persistence tool.
 * Extraction tools are pure — they do NOT write to this table.
 */

import {
  db, eq, and,
  brainliftSources,
} from './base';
import type { SourceStatus } from '@shared/schema';

interface SourceInput {
  url?: string | null;
  name?: string | null;
  category?: string | null;
  surroundingContext?: string | null;
}

/** Bulk insert sources for a brainlift with a given status */
export async function saveBrainliftSources(
  brainliftId: number,
  sources: SourceInput[],
  status: SourceStatus = 'pending'
) {
  if (sources.length === 0) return [];

  const values = sources.map(s => ({
    brainliftId,
    url: s.url,
    name: s.name ?? null,
    category: s.category ?? null,
    surroundingContext: s.surroundingContext ?? null,
    status,
  }));

  const inserted = await db
    .insert(brainliftSources)
    .values(values)
    .onConflictDoNothing({ target: [brainliftSources.brainliftId, brainliftSources.url] })
    .returning();

  return inserted;
}

/** Get sources for a brainlift, optionally filtered by status */
export async function getBrainliftSources(brainliftId: number, status?: SourceStatus) {
  const conditions = [eq(brainliftSources.brainliftId, brainliftId)];
  if (status) {
    conditions.push(eq(brainliftSources.status, status));
  }

  return db
    .select()
    .from(brainliftSources)
    .where(and(...conditions));
}

/** Delete all sources for a brainlift (cleanup) */
export async function deleteBrainliftSources(brainliftId: number) {
  const result = await db
    .delete(brainliftSources)
    .where(eq(brainliftSources.brainliftId, brainliftId))
    .returning();
  return result.length;
}
