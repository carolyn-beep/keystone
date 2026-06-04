/**
 * Readability + length scoring for the downstream rewrite engine.
 *
 * Ported from the research harness (scripts/optimal-prompt/lib/readability.ts,
 * itself a verbatim port of scripts/readability-compare.mjs) so prod FK/word
 * values are directly comparable to the experiment numbers: same text-readability
 * library, same clean(), same FK 2-dp rounding, same lexicon word counter.
 *
 * Only clean/wordCount/fkGrade are ported — the gate needs FK + word count. The
 * harness's multi-metric score() (CLI/ARI/Fog/DC) is measurement-only and is not
 * carried into prod.
 */
import trMod from 'text-readability';

// text-readability ships as CJS; under ESM/TS interop the callable lives on
// `.default` in some builds and on the module object in others. Handle both.
const rs: any = (trMod as any).default || trMod;

// Reference-citation tokens like [DOK1:1234]. The FE renders these as inline
// chips, so they are metadata, not prose — they must NOT count toward word count
// or Flesch-Kincaid. Tolerant of stray spaces/casing, matching the FE parser.
// (This is a deliberate divergence from the research harness, which scored tokens
// as words; prod excludes them so the gate measures real reading difficulty.)
const SCORING_TOKEN_RE = /\[\s*DOK\s*[1-4]\s*:\s*\d+\s*\]/gi;

/** Strip the citation tokens that the FE renders as chips (not prose). */
export function stripTokens(raw: string | null | undefined): string {
  return raw ? String(raw).replace(SCORING_TOKEN_RE, ' ') : '';
}

/** Strip markdown/links/source-tails/citation tokens so scoring sees prose only. */
export function clean(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = String(raw);
  t = t.replace(SCORING_TOKEN_RE, ' ');
  t = t.replace(/\[([^\]]*)\]\((https?:\/\/[^)]*)\)/g, '$1');
  t = t.replace(/https?:\/\/\S+/g, ' ');
  // [\s\S] instead of the `s` (dotAll) flag so this compiles without an es2018 target.
  t = t.replace(/\n+\s*Source:[\s\S]*$/i, ' ');
  t = t.replace(/[*_`#>]+/g, ' ');
  t = t.replace(/^\s*[-•]\s+/gm, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

/** Lexicon word count (text-readability), matching the harness counter. */
export function wordCount(text: string | null | undefined): number {
  return rs.lexiconCount(text || '', true);
}

/**
 * Flesch-Kincaid grade rounded to 2 decimals. Returns null when the text is
 * empty, has fewer than 5 words, or the library throws / yields a non-finite
 * value. Never throws.
 */
export function fkGrade(text: string | null | undefined): number | null {
  const words = wordCount(text);
  if (!text || words < 5) return null;
  try {
    const v = rs.fleschKincaidGrade(text);
    return Number.isFinite(v) ? Number(v.toFixed(2)) : null;
  } catch {
    return null;
  }
}
