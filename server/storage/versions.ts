/**
 * DOK Item Version History Storage
 *
 * Manages version snapshots for DOK items (facts, summaries, insights, SPOVs).
 * Supports a rolling window: original (version 0) + latest 3 edits.
 */

import { db } from '../db';
import { dokItemVersions } from '@shared/schema';
import { eq, and, sql, desc, notInArray } from 'drizzle-orm';

interface CreateVersionParams {
  dokLevel: 1 | 2 | 3 | 4;
  itemId: number;
  brainliftId: number;
  textContent: string;
  score: number | null;
  feedback: string | null;
  diagnosis?: string | null;
}

/**
 * Create a version snapshot for a DOK item.
 * Computes versionNumber as MAX(version_number) + 1, or 0 if first version.
 */
export async function createVersion(params: CreateVersionParams): Promise<{ id: number; versionNumber: number }> {
  const { dokLevel, itemId, brainliftId, textContent, score, feedback, diagnosis } = params;

  // Compute next version number in the DB to avoid race conditions
  const [maxResult] = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(${dokItemVersions.versionNumber}), -1)` })
    .from(dokItemVersions)
    .where(and(
      eq(dokItemVersions.dokLevel, dokLevel),
      eq(dokItemVersions.itemId, itemId),
    ));

  const versionNumber = (maxResult.maxVersion ?? -1) + 1;

  const [inserted] = await db.insert(dokItemVersions).values({
    dokLevel,
    itemId,
    brainliftId,
    versionNumber,
    textContent,
    score,
    feedback,
    diagnosis: diagnosis ?? null,
  }).returning({ id: dokItemVersions.id });

  return { id: inserted.id, versionNumber };
}

/**
 * Get version history for a DOK item, ordered by version number descending (newest first).
 */
export async function getVersionHistory(dokLevel: 1 | 2 | 3 | 4, itemId: number) {
  return db
    .select()
    .from(dokItemVersions)
    .where(and(
      eq(dokItemVersions.dokLevel, dokLevel),
      eq(dokItemVersions.itemId, itemId),
    ))
    .orderBy(desc(dokItemVersions.versionNumber));
}

/**
 * Prune old versions, keeping original (version 0) + latest 3 edits.
 * Returns count of deleted rows.
 */
export async function pruneVersions(dokLevel: 1 | 2 | 3 | 4, itemId: number): Promise<number> {
  // Get all versions for this item
  const versions = await db
    .select({ id: dokItemVersions.id, versionNumber: dokItemVersions.versionNumber })
    .from(dokItemVersions)
    .where(and(
      eq(dokItemVersions.dokLevel, dokLevel),
      eq(dokItemVersions.itemId, itemId),
    ))
    .orderBy(desc(dokItemVersions.versionNumber));

  if (versions.length <= 4) {
    return 0;
  }

  // Keep: version 0 (original) + latest 3 (first 3 in descending order)
  const latest3 = versions.slice(0, 3);
  const keepIds = new Set<number>();

  // Always keep version 0
  for (const v of versions) {
    if (v.versionNumber === 0) {
      keepIds.add(v.id);
    }
  }
  // Keep latest 3
  for (const v of latest3) {
    keepIds.add(v.id);
  }

  const deleteIds = versions
    .filter(v => !keepIds.has(v.id))
    .map(v => v.id);

  if (deleteIds.length === 0) {
    return 0;
  }

  const deleted = await db
    .delete(dokItemVersions)
    .where(and(
      eq(dokItemVersions.dokLevel, dokLevel),
      eq(dokItemVersions.itemId, itemId),
      sql`${dokItemVersions.id} IN (${sql.join(deleteIds.map(id => sql`${id}`), sql`, `)})`
    ))
    .returning({ id: dokItemVersions.id });

  return deleted.length;
}
