/**
 * Storage module for pangram_assessments (AI Writing Signal).
 *
 * Polymorphic-by-(entityType, entityId). One row per analyzed entity across
 * DOK2 summaries, DOK3 insights, DOK4 SPOVs.
 *
 * Internal codename only -- never surface "Pangram" in user/agent-facing copy.
 * External label everywhere is "AI Writing Signal".
 */

import { db, eq, and, inArray, pangramAssessments } from './base';
import type {
  AiWritingSignalConfidence,
  AiWritingSignalLabel,
  AiWritingSignalPayload,
  PangramAssessment,
  PangramEntityType,
  PangramPredictionShort,
} from '@shared/schema';
import type { PangramResponse, PangramWindow } from '../ai/pangram/types';

/**
 * Map raw Pangram label → lowercase external "AI Writing Signal" label.
 *
 * The `satisfies` Record<PangramPredictionShort, AiWritingSignalLabel> below
 * forces TypeScript to fail compilation if a new PangramPredictionShort value
 * is added without updating this map.
 */
const PREDICTION_SHORT_TO_LABEL = {
  Human: 'human',
  'AI-Assisted': 'ai-assisted',
  Mixed: 'mixed',
  AI: 'ai',
} as const satisfies Record<PangramPredictionShort, AiWritingSignalLabel>;

export function predictionShortToLabel(
  p: PangramPredictionShort,
): AiWritingSignalLabel {
  return PREDICTION_SHORT_TO_LABEL[p];
}

async function getByEntity(
  entityType: PangramEntityType,
  entityId: number,
): Promise<PangramAssessment | null> {
  const rows = await db
    .select()
    .from(pangramAssessments)
    .where(
      and(
        eq(pangramAssessments.entityType, entityType),
        eq(pangramAssessments.entityId, entityId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Batch label lookup for the internal API surface.
 *
 * Returns `null` (not undefined, never omitted) for entities missing a row OR
 * with status !== 'done'. Empty input array returns an empty Map without
 * issuing any SQL.
 */
async function getLabelsByEntities(
  entityType: PangramEntityType,
  entityIds: number[],
): Promise<Map<number, AiWritingSignalLabel | null>> {
  const result = new Map<number, AiWritingSignalLabel | null>();
  if (entityIds.length === 0) {
    return result;
  }

  // Initialize all requested IDs to null; overwrite below for rows present
  // with status='done'.
  for (const id of entityIds) {
    result.set(id, null);
  }

  const rows = await db
    .select({
      entityId: pangramAssessments.entityId,
      predictionShort: pangramAssessments.predictionShort,
    })
    .from(pangramAssessments)
    .where(
      and(
        eq(pangramAssessments.entityType, entityType),
        inArray(pangramAssessments.entityId, entityIds),
        eq(pangramAssessments.status, 'done'),
      ),
    );

  for (const r of rows) {
    if (r.predictionShort) {
      result.set(r.entityId, predictionShortToLabel(r.predictionShort));
    }
  }
  return result;
}

/**
 * Upsert by (entityType, entityId): mark the row as `analyzing`, write the
 * fresh text_hash, clear any prior error_message. Other result fields are
 * preserved on update (they will be overwritten when the analysis completes
 * via markDone, or NULLed via markError if it fails).
 */
async function upsertAnalyzing(
  entityType: PangramEntityType,
  entityId: number,
  brainliftId: number,
  textHash: string,
): Promise<void> {
  await db
    .insert(pangramAssessments)
    .values({
      entityType,
      entityId,
      brainliftId,
      textHash,
      status: 'analyzing',
      errorMessage: null,
    })
    .onConflictDoUpdate({
      target: [pangramAssessments.entityType, pangramAssessments.entityId],
      set: {
        textHash,
        status: 'analyzing',
        errorMessage: null,
        // brainliftId could in principle change if an entity moves brainlifts
        // (today it cannot), so keep it in sync defensively.
        brainliftId,
        updatedAt: new Date(),
      },
    });
}

async function markDone(
  entityType: PangramEntityType,
  entityId: number,
  result: PangramResponse,
  expectedTextHash?: string,
): Promise<boolean> {
  const whereClause = expectedTextHash
    ? and(
        eq(pangramAssessments.entityType, entityType),
        eq(pangramAssessments.entityId, entityId),
        eq(pangramAssessments.textHash, expectedTextHash),
      )
    : and(
        eq(pangramAssessments.entityType, entityType),
        eq(pangramAssessments.entityId, entityId),
      );

  const rows = await db
    .update(pangramAssessments)
    .set({
      status: 'done',
      version: result.version,
      predictionShort: result.prediction_short,
      fractionAi: String(result.fraction_ai),
      fractionAiAssisted: String(result.fraction_ai_assisted),
      fractionHuman: String(result.fraction_human),
      numAiSegments: result.num_ai_segments,
      numAiAssistedSegments: result.num_ai_assisted_segments,
      numHumanSegments: result.num_human_segments,
      dashboardLink: result.dashboard_link ?? null,
      headline: result.headline,
      prediction: result.prediction,
      windows: result.windows,
      errorMessage: null,
      analyzedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(whereClause)
    .returning({ id: pangramAssessments.id });

  return rows.length > 0;
}

/**
 * Mark the row as errored. Wipes prior result columns because the prior
 * result described text that no longer exists (decisions §6 -- honest > green).
 */
async function markError(
  entityType: PangramEntityType,
  entityId: number,
  errorMessage: string,
  expectedTextHash?: string,
): Promise<boolean> {
  const whereClause = expectedTextHash
    ? and(
        eq(pangramAssessments.entityType, entityType),
        eq(pangramAssessments.entityId, entityId),
        eq(pangramAssessments.textHash, expectedTextHash),
      )
    : and(
        eq(pangramAssessments.entityType, entityType),
        eq(pangramAssessments.entityId, entityId),
      );

  const rows = await db
    .update(pangramAssessments)
    .set({
      status: 'error',
      errorMessage,
      predictionShort: null,
      fractionAi: null,
      fractionAiAssisted: null,
      fractionHuman: null,
      version: null,
      numAiSegments: null,
      numAiAssistedSegments: null,
      numHumanSegments: null,
      dashboardLink: null,
      headline: null,
      prediction: null,
      windows: null,
      analyzedAt: null,
      updatedAt: new Date(),
    })
    .where(whereClause)
    .returning({ id: pangramAssessments.id });

  return rows.length > 0;
}

/**
 * Pick the dominant window's confidence from a raw windows JSONB blob.
 *
 * "Dominant" = largest word_count (best representative of the document). Falls
 * back to the first window's confidence, or null if windows is empty/missing.
 *
 * Exported for unit testing.
 */
export function dominantConfidence(raw: unknown): AiWritingSignalConfidence | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  let bestConfidence: AiWritingSignalConfidence | null = null;
  let bestWords = -1;
  for (const w of raw) {
    if (typeof w !== 'object' || w === null) continue;
    const win = w as Partial<PangramWindow>;
    const conf = win.confidence;
    if (conf !== 'High' && conf !== 'Medium' && conf !== 'Low') continue;
    const words = typeof win.word_count === 'number' ? win.word_count : 0;
    if (words > bestWords) {
      bestWords = words;
      bestConfidence = conf;
    }
  }
  return bestConfidence;
}

/**
 * Translate a single row to the AiWritingSignalPayload exposed on the web
 * GETs. Status drives which fields are populated: `analyzing` rows carry only
 * status; `error` rows carry status + errorMessage; `done` rows carry the full
 * payload. Pending rows are treated as analyzing for the wire (UI does not
 * distinguish queued vs in-flight).
 */
function rowToPayload(row: PangramAssessment): AiWritingSignalPayload {
  if (row.status === 'error') {
    return {
      status: 'error',
      label: null,
      version: null,
      fractions: null,
      headline: null,
      confidence: null,
      errorMessage: "The signal couldn't be computed for this item.",
      analyzedAt: null,
    };
  }
  if (row.status === 'done' && row.predictionShort) {
    return {
      status: 'done',
      label: predictionShortToLabel(row.predictionShort),
      version: row.version,
      fractions:
        row.fractionAi !== null &&
        row.fractionAiAssisted !== null &&
        row.fractionHuman !== null
          ? {
              ai: Number(row.fractionAi),
              aiAssisted: Number(row.fractionAiAssisted),
              human: Number(row.fractionHuman),
            }
          : null,
      headline: row.headline,
      confidence: dominantConfidence(row.windows),
      errorMessage: null,
      analyzedAt: row.analyzedAt ? row.analyzedAt.toISOString() : null,
    };
  }
  // Treat 'pending' and 'analyzing' identically on the web wire.
  return {
    status: 'analyzing',
    label: null,
    version: null,
    fractions: null,
    headline: null,
    confidence: null,
    errorMessage: null,
    analyzedAt: null,
  };
}

/**
 * Batch fetch the full AI Writing Signal payload for a list of entity IDs.
 *
 * Returns a Map keyed by entityId. Every requested id is present in the map
 * (Map.has returns true); the value is `null` for ids with no row, and a
 * populated payload otherwise (with `status` driving which inner fields are
 * filled).
 *
 * Empty input array short-circuits without issuing SQL. All other calls
 * perform exactly one SELECT regardless of input size.
 */
async function getFullByEntities(
  entityType: PangramEntityType,
  entityIds: number[],
): Promise<Map<number, AiWritingSignalPayload | null>> {
  const result = new Map<number, AiWritingSignalPayload | null>();
  if (entityIds.length === 0) {
    return result;
  }

  // Pre-seed every requested id to null so missing rows are explicit.
  for (const id of entityIds) {
    result.set(id, null);
  }

  const rows = await db
    .select()
    .from(pangramAssessments)
    .where(
      and(
        eq(pangramAssessments.entityType, entityType),
        inArray(pangramAssessments.entityId, entityIds),
      ),
    );

  for (const row of rows) {
    result.set(row.entityId, rowToPayload(row));
  }
  return result;
}

export const pangramAssessmentsStorage = {
  getByEntity,
  getLabelsByEntities,
  getFullByEntities,
  upsertAnalyzing,
  markDone,
  markError,
  predictionShortToLabel,
};
