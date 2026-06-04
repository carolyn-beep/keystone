/**
 * Deterministic acceptance guards for the downstream rewrite engine.
 *
 * No LLM, no I/O. A candidate rewrite is accepted only if it clears every guard
 * that applies to its level; any failure means the engine falls back to the
 * grader's original text. This replaces the prototype's per-rewrite LLM judge.
 */
import type { LevelRewriteConfig } from './config';
import { clean, fkGrade, wordCount } from '../../utils/readability';

/** Min acceptable rewrite length relative to the original (anti over-cut). */
const MIN_WORD_RATIO = 0.1;
/** Min absolute words for a non-trivial original (anti over-cut). */
const MIN_ABS_WORDS = 5;
/** Max acceptable rewrite length relative to the original (anti blowup). */
const MAX_WORD_RATIO = 2;

// Well-formed reference tokens like [DOK1:1234]. The FE renders these inline, so
// the rewriter must never corrupt, renumber, or invent them — only the grader's
// original tokens are valid. Dropping tokens during shortening is allowed.
const TOKEN_RE = /\[DOK[1-4]:\d+\]/g;
const TOKEN_ISH_RE = /\[\s*DOK[^\]]*\]/gi; // anything that looks like a DOK bracket

/** FK+word acceptance gate: FK present AND <= target AND words <= cap. */
export function passesGate(text: string, cfg: LevelRewriteConfig): boolean {
  const cleaned = clean(text);
  const fk = fkGrade(cleaned);
  if (fk === null) return false;
  return fk <= cfg.fkTarget && wordCount(cleaned) <= cfg.wordCap;
}

/**
 * Non-empty / length sanity: reject empty, whitespace-only, absurdly short, or
 * blown-up (> 2x original) rewrites.
 */
export function passesSanity(original: string, rewrite: string): boolean {
  if (!rewrite || !rewrite.trim()) return false;
  // Count prose only — citation tokens are FE chips, not words, so they must not
  // inflate the over-cut / blowup ratios (clean() also strips them).
  const ow = wordCount(clean(original));
  const rw = wordCount(clean(rewrite));
  if (rw === 0) return false;
  if (rw > MAX_WORD_RATIO * ow) return false;
  // anti over-cut: for a non-trivial original, require a floor
  if (ow >= MIN_ABS_WORDS && rw < Math.max(MIN_ABS_WORDS, ow * MIN_WORD_RATIO))
    return false;
  return true;
}

/**
 * Token-preservation subset rule: every token-ish bracket in the rewrite must be
 * well-formed AND present in the original's valid token set. Drops are allowed;
 * malformed, invented, or renumbered tokens reject the whole rewrite.
 */
export function tokensOk(original: string, rewrite: string): boolean {
  const valid = new Set(original.match(TOKEN_RE) ?? []);
  for (const t of rewrite.match(TOKEN_ISH_RE) ?? []) {
    if (!/^\[DOK[1-4]:\d+\]$/.test(t) || !valid.has(t)) return false;
  }
  return true;
}
