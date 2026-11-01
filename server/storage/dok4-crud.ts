/**
 * DOK4 CRUD Storage
 *
 * Create, edit, delete, and impact preview functions for DOK4 SPOVs.
 * All functions are IDOR-safe: require brainliftId match.
 */

import {
  db, eq, and,
  dok4Spovs, dok4Dok3Links,
} from './base';
import type { DOK4SpovStatus } from '@shared/schema';
import type { DeleteImpact, DeleteResult } from './dok1-crud';

/**
 * Create a new DOK4 SPOV with DOK3 links and primary designation.
 * Sets status to 'linked'. Caller must validate DOK3 grading status.
 * Returns the new SPOV's ID.
 */
export async function createDok4Spov(params: {
  brainliftId: number;
  text: string;
  linkedDok3Ids: number[];
  primaryDok3Id: number;
}): Promise<{ id: number }> {
  const [inserted] = await db.insert(dok4Spovs).values({
    brainliftId: params.brainliftId,
    text: params.text,
    status: 'linked' as DOK4SpovStatus,
  }).returning({ id: dok4Spovs.id });

  // Insert DOK3 links with primary designation
  if (params.linkedDok3Ids.length > 0) {
    await db.insert(dok4Dok3Links).values(
      params.linkedDok3Ids.map(dok3InsightId => ({
        spovId: inserted.id,
        dok3InsightId,
        isPrimary: dok3InsightId === params.primaryDok3Id,
      }))
    );
  }

  return { id: inserted.id };
}

export interface EditDok4Result {
  previousText: string;
  previousScore: number | null;
  previousFeedback: string | null;
  previousRationale: string | null;
  previousCriteriaBreakdown: Record<string, { assessment: string; evidence: string }> | null;
}

/**
 * Edit a DOK4 SPOV's text. Returns previous state for versioning.
 * Returns null if SPOV not found or wrong brainliftId (IDOR).
 */
export async function editDok4Spov(
  spovId: number,
  brainliftId: number,
  newText: string,
): Promise<EditDok4Result | null> {
  const [current] = await db.select().from(dok4Spovs)
    .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));

  if (!current) return null;

  const result: EditDok4Result = {
    previousText: current.text,
    previousScore: current.score,
    previousFeedback: current.feedback,
    previousRationale: current.rationale,
    previousCriteriaBreakdown: current.criteriaBreakdown as Record<string, { assessment: string; evidence: string }> | null,
  };

  await db.update(dok4Spovs)
    .set({ text: newText, updatedAt: new Date() })
    .where(eq(dok4Spovs.id, spovId));

  return result;
}

/**
 * Compute the impact of deleting a DOK4 SPOV.
 * DOK4 is terminal -- no downstream dependencies.
 * Returns null if SPOV not found or wrong brainliftId.
 */
export async function getDok4DeleteImpact(
  spovId: number,
  brainliftId: number,
): Promise<DeleteImpact | null> {
  const [spov] = await db.select().from(dok4Spovs)
    .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));

  if (!spov) return null;

  return {
    item: { id: spov.id, text: spov.text, score: spov.score },
    unlinkedItems: [],
    staleDok2Ids: [],
    staleDok3Ids: [],
    staleDok4Ids: [],
  };
}

/**
 * Delete a DOK4 SPOV. Removes DOK3 links. No downstream stale (terminal level).
 * Returns null if SPOV not found or wrong brainliftId.
 */
export async function deleteDok4Spov(
  spovId: number,
  brainliftId: number,
): Promise<DeleteResult | null> {
  const [spov] = await db.select().from(dok4Spovs)
    .where(and(eq(dok4Spovs.id, spovId), eq(dok4Spovs.brainliftId, brainliftId)));

  if (!spov) return null;

  // Remove DOK3 links (cascade should handle this, but explicit is safer)
  await db.delete(dok4Dok3Links).where(eq(dok4Dok3Links.spovId, spovId));

  // Delete the SPOV
  await db.delete(dok4Spovs).where(eq(dok4Spovs.id, spovId));

  return { deleted: true, impactSummary: { unlinked: 0, markedStale: 0 } };
}

export interface AddLinksDok4Result {
  addedCount: number;
  existingItem: { id: number; text: string; score: number | null; status: string };
}

/**
 * Add DOK3 insight links to an existing DOK4 SPOV.
 * Skips already-linked DOK3s via onConflictDoNothing.
 * Optionally updates the primary DOK3 designation.
 * Returns null if SPOV not found or wrong brainliftId (IDOR).
 */
export async function addLinksToDok4Spov(params: {
  spovId: number;
  brainliftId: number;
  dok3Ids: number[];
  newPrimaryDok3Id?: number;
}): Promise<AddLinksDok4Result | null> {
  const [spov] = await db.select().from(dok4Spovs)
    .where(and(eq(dok4Spovs.id, params.spovId), eq(dok4Spovs.brainliftId, params.brainliftId)));

  if (!spov) return null;

  let addedCount = 0;
  if (params.dok3Ids.length > 0) {
    const inserted = await db.insert(dok4Dok3Links)
      .values(params.dok3Ids.map(dok3InsightId => ({
        spovId: params.spovId,
        dok3InsightId,
        isPrimary: false,
      })))
      .onConflictDoNothing()
      .returning({ id: dok4Dok3Links.id });
    addedCount = inserted.length;
  }

  // Optionally update primary designation
  if (params.newPrimaryDok3Id != null) {
    // Clear existing primary
    await db.update(dok4Dok3Links)
      .set({ isPrimary: false })
      .where(eq(dok4Dok3Links.spovId, params.spovId));
    // Set new primary
    await db.update(dok4Dok3Links)
      .set({ isPrimary: true })
      .where(and(
        eq(dok4Dok3Links.spovId, params.spovId),
        eq(dok4Dok3Links.dok3InsightId, params.newPrimaryDok3Id),
      ));
  }

  return {
    addedCount,
    existingItem: {
      id: spov.id,
      text: spov.text,
      score: spov.score,
      status: spov.status,
    },
  };
}
