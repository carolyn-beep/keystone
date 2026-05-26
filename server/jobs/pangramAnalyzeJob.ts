/**
 * Polymorphic background job: analyze a DOK2 summary, DOK3 insight, or DOK4
 * SPOV with the Pangram AI-writing-detection API and persist the result.
 *
 * - Hash-and-skip: if the assembled text's SHA-256 matches the stored
 *   text_hash AND the existing row's status is 'done', skip the API call
 *   entirely. Defends against curation cascades that re-fire regrades on
 *   unchanged text (could otherwise be 50+ wasted calls per cascade).
 * - 3 retries, ~10s exponential backoff (total ~30s span) per CLAUDE.md
 *   override for tight third-party APIs.
 * - On exhausted retries, overwrite row to status='error' (NULLs out prior
 *   result fields) -- preserving a stale result would describe text that no
 *   longer exists (decisions §6).
 * - Storage write failure after Pangram success: re-throw so graphile-worker
 *   retries the whole job using its default policy (independent of the
 *   3-retry Pangram budget).
 *
 * Internal codename only. External label everywhere user/agent-facing is
 * "AI Writing Signal".
 */

import { createHash } from 'crypto';
import type { JobHelpers } from 'graphile-worker';
import { pangramAssessmentsStorage } from '../storage/pangramAssessments';
import { analyzeText } from '../ai/pangram/client';
import { assembleTextForEntity } from '../ai/pangram/assembleText';
import type { PangramEntityType } from '@shared/schema';
import type { PangramResponse } from '../ai/pangram/types';

const MAX_ATTEMPTS = 3;
// Backoff for attempts 2 and 3. Total wall-time budget ≈ 30s (request + sleep).
const BACKOFF_MS = [0, 10_000, 20_000];

interface PangramAnalyzePayload {
  entityType: PangramEntityType;
  entityId: number;
  brainliftId: number;
}

type JobResult =
  | { status: 'skipped' }
  | { status: 'done' }
  | { status: 'error' };

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run Pangram with the 3-attempt retry budget. Returns the response, or
 * throws the last error if the budget is exhausted.
 */
async function callPangramWithRetries(
  text: string,
  helpers: JobHelpers,
): Promise<PangramResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await sleep(BACKOFF_MS[attempt - 1] ?? 0);
    }
    try {
      return await analyzeText({ text });
    } catch (err) {
      lastError = err;
      helpers.logger.warn(
        `[Pangram Analyze] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${(err as Error)?.message ?? String(err)}`,
      );
    }
  }
  throw lastError;
}

export async function pangramAnalyzeJob(
  payload: PangramAnalyzePayload,
  helpers: JobHelpers,
): Promise<JobResult> {
  const { entityType, entityId, brainliftId } = payload;
  helpers.logger.info(
    `[Pangram Analyze] start entityType=${entityType} entityId=${entityId} brainliftId=${brainliftId}`,
  );

  // 1. Assemble text.
  const text = await assembleTextForEntity(entityType, entityId, brainliftId);
  if (text.length === 0) {
    helpers.logger.info(
      `[Pangram Analyze] empty assembled text for ${entityType} ${entityId}; skipping`,
    );
    return { status: 'skipped' };
  }

  // 2. Hash-and-skip.
  const textHash = sha256Hex(text);
  const existing = await pangramAssessmentsStorage.getByEntity(entityType, entityId);
  if (existing && existing.textHash === textHash && existing.status === 'done') {
    helpers.logger.info(
      `[Pangram Analyze] hash-and-skip (text unchanged, prior status=done) for ${entityType} ${entityId}`,
    );
    return { status: 'skipped' };
  }

  // 3. Mark analyzing. If brainlift was deleted out from under us (FK
  // violation, pg 23503), the entity is orphaned -- skip without retrying.
  try {
    await pangramAssessmentsStorage.upsertAnalyzing(
      entityType,
      entityId,
      brainliftId,
      textHash,
    );
  } catch (err) {
    const pgCode = (err as { cause?: { code?: string } })?.cause?.code;
    if (pgCode === '23503') {
      helpers.logger.warn(
        `[Pangram Analyze] brainlift ${brainliftId} no longer exists for ${entityType} ${entityId}; skipping`,
      );
      return { status: 'skipped' };
    }
    throw err;
  }

  // 4. Call Pangram with retries.
  let result: PangramResponse;
  try {
    result = await callPangramWithRetries(text, helpers);
  } catch (err) {
    const errorMessage = `${(err as Error)?.name ?? 'Error'}: ${(err as Error)?.message ?? String(err)}`;
    helpers.logger.error(
      `[Pangram Analyze] all ${MAX_ATTEMPTS} attempts failed for ${entityType} ${entityId}: ${errorMessage}`,
    );
    // Mark error -- NULLs out prior result columns by contract. Do NOT
    // re-throw: exhaustion is terminal, not a graphile retry trigger.
    await pangramAssessmentsStorage.markError(entityType, entityId, errorMessage);
    return { status: 'error' };
  }

  // 5. Persist result. If this write fails, re-throw so graphile retries the
  // whole job (independent of the Pangram retry budget).
  await pangramAssessmentsStorage.markDone(entityType, entityId, result);
  helpers.logger.info(
    `[Pangram Analyze] done for ${entityType} ${entityId}: ${result.prediction_short}`,
  );
  return { status: 'done' };
}
