/**
 * Rewrite integration helper (spec 03-rewrite-integration).
 *
 * The single DRY entry point that wires the pure rewrite engine
 * (`rewriteField`, spec 02) into the four grading pipelines. Called after the
 * grader produces a long user-facing field and before persistence.
 *
 * Contract: `rewriteForPersist` NEVER throws. On any failure (engine fallback,
 * an unexpected engine rejection, or a metric-write error) it returns the
 * grader's original text in BOTH `userFacing` and `raw`, logs a warning, and
 * records a fallback metric. The score is never touched here.
 *
 * Callers persist: existing column = `userFacing`, `*_raw` column = `raw`.
 */

import { rewriteField, type RewriteReason } from './rewrite';
import type { DokLevel } from './config';
import { storage } from '../../storage';

export interface RewriteContext {
  level: DokLevel;
  /** fact / summary / insight / spov id. */
  itemId: number;
  brainliftId: number;
}

const DOK_LEVEL_NUMBER: Record<DokLevel, number> = {
  DOK1: 1,
  DOK2: 2,
  DOK3: 3,
  DOK4: 4,
};

/**
 * Run the rewrite engine on `text`, record a metric, and return both the
 * user-facing (possibly rewritten) text and the grader original. Never throws.
 */
export async function rewriteForPersist(
  text: string,
  ctx: RewriteContext,
): Promise<{ userFacing: string; raw: string }> {
  let userFacing = text;
  let rewritten = false;
  let reason: RewriteReason = 'model_failed';
  let metrics: {
    fkBefore: number | null;
    fkAfter: number | null;
    wordsBefore: number;
    wordsAfter: number;
    candidateFk: number | null;
    candidateWords: number | null;
    rounds: number;
    model?: string;
  } = {
    fkBefore: null,
    fkAfter: null,
    wordsBefore: 0,
    wordsAfter: 0,
    candidateFk: null,
    candidateWords: null,
    rounds: 0,
  };

  try {
    // rewriteField is contractually no-throw, but guard anyway: an unexpected
    // rejection must still leave grading intact (original in both columns).
    const result = await rewriteField({ level: ctx.level, text });
    userFacing = result.text;
    rewritten = result.rewritten;
    reason = result.reason;
    metrics = result.metrics;
  } catch (err) {
    userFacing = text;
    rewritten = false;
    reason = 'model_failed';
    console.warn(
      `[readability.rewriteForPersist] engine threw for ${ctx.level} item ${ctx.itemId}; falling back to original`,
      err instanceof Error ? err.message : err,
    );
  }

  if (!rewritten) {
    console.warn(
      `[readability.rewriteForPersist] ${ctx.level} item ${ctx.itemId}: not rewritten (reason=${reason}); using grader original`,
    );
  }

  // Metric write must never block persistence of the grading result.
  try {
    await storage.recordRewriteMetric({
      dokLevel: DOK_LEVEL_NUMBER[ctx.level],
      itemId: ctx.itemId,
      brainliftId: ctx.brainliftId,
      rewritten,
      reason,
      fkBefore: metrics.fkBefore,
      fkAfter: metrics.fkAfter,
      wordsBefore: metrics.wordsBefore,
      wordsAfter: metrics.wordsAfter,
      candidateFk: metrics.candidateFk,
      candidateWords: metrics.candidateWords,
      rounds: metrics.rounds,
      model: metrics.model ?? null,
    });
  } catch (err) {
    console.warn(
      `[readability.rewriteForPersist] metric write failed for ${ctx.level} item ${ctx.itemId}`,
      err instanceof Error ? err.message : err,
    );
  }

  return { userFacing, raw: text };
}
