import {
  db, eq, brainlifts, nativeBrainliftDetails,
  type Brainlift, type NativeBrainliftDetails,
  type NativePhaseProgress, type BuilderSuggestionStatus,
} from './base';
import type { NativeDetailsResponse } from '@shared/routes';
import { generateUniqueSlug } from '../utils/slug';

/**
 * Transactionally create a native brainlift (parent row + details row).
 * Sets sourceType='native', importStatus='complete', zeroed summary.
 */
export async function createNativeBrainlift(input: {
  topic: string;
  purpose: string;
  owner: string | null;
  userId: string;
}): Promise<{ brainlift: Brainlift; nativeDetails: NativeBrainliftDetails }> {
  const slug = await generateUniqueSlug(input.topic);

  return db.transaction(async (tx) => {
    const [brainlift] = await tx.insert(brainlifts).values({
      slug,
      title: input.topic,
      description: input.purpose,
      author: input.owner ?? null,
      sourceType: 'native',
      importStatus: 'complete',
      summary: { totalFacts: 0, meanScore: "0", score5Count: 0, contradictionCount: 0 },
      createdByUserId: input.userId,
    } as typeof brainlifts.$inferInsert).returning();

    const [nativeDetails] = await tx.insert(nativeBrainliftDetails).values({
      brainliftId: brainlift.id,
    }).returning();

    return { brainlift, nativeDetails };
  });
}

/**
 * Read native details joined to parent brainlift fields.
 * Returns null if the brainlift doesn't exist or isn't native.
 */
export async function getNativeDetailsBySlug(slug: string): Promise<NativeDetailsResponse | null> {
  const rows = await db
    .select({
      topic: brainlifts.title,
      purpose: brainlifts.description,
      owner: brainlifts.author,
      phaseProgress: nativeBrainliftDetails.phaseProgress,
      lastActivePhase: nativeBrainliftDetails.lastActivePhase,
      suggestionStatus: nativeBrainliftDetails.suggestionStatus,
      suggestionError: nativeBrainliftDetails.suggestionError,
    })
    .from(brainlifts)
    .innerJoin(nativeBrainliftDetails, eq(brainlifts.id, nativeBrainliftDetails.brainliftId))
    .where(eq(brainlifts.slug, slug));

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    topic: row.topic,
    purpose: row.purpose,
    owner: row.owner,
    phaseProgress: row.phaseProgress,
    lastActivePhase: row.lastActivePhase as 1 | 2 | 3 | 4 | 5,
    suggestionStatus: row.suggestionStatus,
    suggestionError: row.suggestionError,
  };
}

/**
 * Update native brainlift details. Parent fields (topic/purpose/owner) write to brainlifts,
 * builder fields (lastActivePhase/phaseProgress/suggestionStatus/suggestionError) write to native_brainlift_details.
 * Returns refreshed NativeDetailsResponse.
 */
export async function updateNativeDetailsForBrainlift(
  brainliftId: number,
  fields: {
    topic?: string;
    purpose?: string;
    owner?: string | null;
    lastActivePhase?: 1 | 2 | 3 | 4 | 5;
    phaseProgress?: NativePhaseProgress;
    suggestionStatus?: BuilderSuggestionStatus;
    suggestionError?: string | null;
  }
): Promise<NativeDetailsResponse> {
  // Update parent fields if any are provided
  const parentUpdates: Record<string, unknown> = {};
  if (fields.topic !== undefined) parentUpdates.title = fields.topic;
  if (fields.purpose !== undefined) parentUpdates.description = fields.purpose;
  if (fields.owner !== undefined) parentUpdates.author = fields.owner;

  if (Object.keys(parentUpdates).length > 0) {
    await db.update(brainlifts).set(parentUpdates).where(eq(brainlifts.id, brainliftId));
  }

  // Update native details fields if any are provided
  const detailUpdates: Record<string, unknown> = {};
  if (fields.lastActivePhase !== undefined) detailUpdates.lastActivePhase = fields.lastActivePhase;
  if (fields.phaseProgress !== undefined) detailUpdates.phaseProgress = fields.phaseProgress;
  if (fields.suggestionStatus !== undefined) detailUpdates.suggestionStatus = fields.suggestionStatus;
  if (fields.suggestionError !== undefined) detailUpdates.suggestionError = fields.suggestionError;

  if (Object.keys(detailUpdates).length > 0) {
    await db.update(nativeBrainliftDetails).set(detailUpdates).where(eq(nativeBrainliftDetails.brainliftId, brainliftId));
  }

  // Fetch and return refreshed state
  const rows = await db
    .select({
      topic: brainlifts.title,
      purpose: brainlifts.description,
      owner: brainlifts.author,
      phaseProgress: nativeBrainliftDetails.phaseProgress,
      lastActivePhase: nativeBrainliftDetails.lastActivePhase,
      suggestionStatus: nativeBrainliftDetails.suggestionStatus,
      suggestionError: nativeBrainliftDetails.suggestionError,
    })
    .from(brainlifts)
    .innerJoin(nativeBrainliftDetails, eq(brainlifts.id, nativeBrainliftDetails.brainliftId))
    .where(eq(brainlifts.id, brainliftId));

  const row = rows[0];
  return {
    topic: row.topic,
    purpose: row.purpose,
    owner: row.owner,
    phaseProgress: row.phaseProgress,
    lastActivePhase: row.lastActivePhase as 1 | 2 | 3 | 4 | 5,
    suggestionStatus: row.suggestionStatus,
    suggestionError: row.suggestionError,
  };
}

/**
 * Update suggestion lifecycle state on native_brainlift_details.
 */
export async function setBuilderSuggestionState(
  brainliftId: number,
  state: { status: BuilderSuggestionStatus; error?: string | null }
): Promise<void> {
  const updates: Record<string, unknown> = { suggestionStatus: state.status };
  if (state.error !== undefined) updates.suggestionError = state.error;

  await db.update(nativeBrainliftDetails)
    .set(updates)
    .where(eq(nativeBrainliftDetails.brainliftId, brainliftId));
}
