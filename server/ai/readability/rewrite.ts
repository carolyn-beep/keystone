/**
 * Shared downstream rewrite service.
 *
 * Simplifies and shortens a grader's long user-facing field for a high-school
 * audience WITHOUT changing the score. Pure: no DB, no persistence, no grader
 * wiring (that is spec 03). Uses the unified AI client callModelWithFallback
 * (qwen3-30b-a3b primary -> haiku-4.5 failover), always with a `caller` string.
 * No per-rewrite LLM judge — acceptance is decided by deterministic guards.
 *
 * Contract: rewriteField NEVER throws to the caller. Any model error, timeout,
 * malformed output, failed guard, or unmet gate returns the grader's original
 * text with `rewritten: false` and a populated `reason`.
 *
 * The rewrite prompt is ported from the research harness
 * (scripts/optimal-prompt/lib/downstream.ts); the harness sonnet judge is dropped.
 */
import { callModelWithFallback } from '../client';
import { REWRITE_CONFIG, REWRITER_MODELS, type DokLevel } from './config';
import { passesGate, passesSanity, tokensOk } from './guards';
import { clean, fkGrade, wordCount } from '../../utils/readability';

export interface RewriteInput {
  level: DokLevel;
  /** The grader's original long field. */
  text: string;
  /**
   * Whether to enforce `[DOKX:id]` token preservation. Defaults to true for
   * DOK2/DOK3/DOK4 and false for DOK1 (DOK1 never carries tokens).
   */
  protectedTokens?: boolean;
}

export type RewriteReason =
  | 'ok'
  /** Gate (FK/length) not met within maxRounds, but the best candidate cleared the
   *  integrity guards and is kept anyway (rewritten = true). */
  | 'accepted_below_target'
  | 'model_failed'
  /** The model returned no parseable `{"rewrite":...}` field (was bucketed as gate_unmet). */
  | 'malformed_output'
  | 'sanity_failed'
  | 'token_guard_failed';

export interface RewriteResult {
  /** Accepted rewrite, OR the original text on any fallback. */
  text: string;
  /** false => fell back to the original. */
  rewritten: boolean;
  reason: RewriteReason;
  metrics: {
    fkBefore: number | null;
    /** FK of the PERSISTED text (the candidate on success, the original on fallback). */
    fkAfter: number | null;
    wordsBefore: number;
    wordsAfter: number;
    /** FK/words ACHIEVED by the best/last candidate, even on a fallback. Null when no
     *  candidate was produced (model_failed / malformed_output). */
    candidateFk: number | null;
    candidateWords: number | null;
    rounds: number;
    model?: string;
  };
}

// Per-DOK protected terms (kept verbatim IF PRESENT). Criterion codes and quality
// "Level N" labels are intentionally NOT protected — they are jargon the grading
// prompt de-jargons, and enumerating them made the small rewriter echo the list.
const PROTECTED_TERMS_BY_LEVEL: Record<DokLevel, string[]> = {
  DOK1: ['DOK1'],
  DOK2: ['DOK1', 'DOK2'],
  DOK3: ['DOK1', 'DOK2', 'DOK3'],
  DOK4: ['DOK1', 'DOK2', 'DOK3', 'DOK4', 'spiky'],
};

/** Non-global token presence check (avoids /g lastIndex state). */
const HAS_TOKEN_RE = /\[DOK[1-4]:\d+\]/;

function buildSystemPrompt(level: DokLevel, text: string): string {
  // Only mention reference tokens when the input ACTUALLY contains one, and never
  // for DOK1 (DOK1 fields carry no tokens). Otherwise small rewriters parrot the
  // literal example token into tokenless output, which the token guard rejects.
  const hasTokens = level !== 'DOK1' && HAS_TOKEN_RE.test(text);
  const tokenLine = hasTokens
    ? 'REFERENCE TOKENS like [DOK1:1234]: they do NOT count toward length or reading level. ' +
      'Any token you keep must be copied EXACTLY and kept inline right after the claim it ' +
      'supports - never alter a token or move it to the end. You MAY drop a token when you cut ' +
      'the point it cites, but never drop one just to save length. '
    : '';
  return (
    'You rewrite educational grading feedback so a high-school student can read it fast and easily. ' +
    'Your TWO jobs are: (1) make it much SHORTER, and (2) make it SIMPLER. ' +
    'Cut filler, hedging, repetition, restatement, and throat-clearing. Use short sentences and common words. ' +
    'You MUST keep the CORE: the load-bearing reason for the score (the judgment), and the actionable ' +
    'guidance, if any. Cutting length must never delete the core. ' +
    'IF PRESENT, DO NOT REMOVE OR REWORD THESE TERMS - ' +
    PROTECTED_TERMS_BY_LEVEL[level].join(', ') +
    '. ' +
    'QUOTES: text in quotation marks is a direct quote from the student or a source. You may DROP a quote ' +
    'that is not essential to the argument, or TRIM a long one to its load-bearing clause (use an ellipsis ' +
    '... for the cut), but NEVER reword, paraphrase, or change any words you keep inside the quotation marks. ' +
    tokenLine +
    'Respond with ONLY a JSON object, no markdown fences, of the exact form: {"rewrite":"<the rewritten feedback>"}. ' +
    'Put ONLY the final rewritten feedback in the "rewrite" value. Do NOT include any reasoning, ' +
    'explanation, notes, word count, or commentary anywhere in the response.'
  );
}

function buildUserPrompt(
  text: string,
  currentFk: number | null,
  currentWords: number,
  targetWords: number,
  targetFk: number,
): string {
  return (
    `This feedback reads at U.S. grade level ${currentFk} and is ${currentWords} words. ` +
    `Rewrite it to read at grade ${targetFk} or lower (Flesch-Kincaid) AND to about ${targetWords} words or fewer, ` +
    `keeping the core judgment and the actionable improvement. ` +
    `Return JSON: {"rewrite":"..."}.\n\nFEEDBACK:\n${text}`
  );
}

/** Tolerant parse of the model JSON `{"rewrite":"..."}`. */
function extractRewrite(content: string): string | null {
  if (!content) return null;
  const t = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const candidates: any[] = [];
  try {
    candidates.push(JSON.parse(t));
  } catch {
    /* not bare JSON */
  }
  if (!candidates.length) {
    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        candidates.push(JSON.parse(t.slice(first, last + 1)));
      } catch {
        /* not embedded JSON */
      }
    }
  }
  // Return the rewrite field if the key is present (even when empty/whitespace) so
  // the sanity guard — not the malformed-output path — judges empty rewrites.
  for (const o of candidates) {
    if (o && typeof o.rewrite === 'string') return o.rewrite;
  }
  return null;
}

export async function rewriteField(input: RewriteInput): Promise<RewriteResult> {
  const { level, text } = input;
  const cfg = REWRITE_CONFIG[level];
  const enforceTokens = input.protectedTokens ?? level !== 'DOK1';

  const cleaned0 = clean(text);
  const fkBefore = fkGrade(cleaned0);
  const wordsBefore = wordCount(cleaned0);

  const result = (
    rewritten: boolean,
    reason: RewriteReason,
    finalText: string,
    rounds: number,
    model?: string,
    /** The best/last candidate the rewriter produced (null when none was usable).
     *  Drives the achieved candidateFk/candidateWords metrics even on a fallback. */
    candidateText?: string | null,
  ): RewriteResult => {
    const candCleaned = candidateText != null ? clean(candidateText) : null;
    return {
      text: finalText,
      rewritten,
      reason,
      metrics: {
        fkBefore,
        fkAfter: fkGrade(clean(finalText)),
        wordsBefore,
        wordsAfter: wordCount(clean(finalText)),
        candidateFk: candCleaned != null ? fkGrade(candCleaned) : null,
        candidateWords: candCleaned != null ? wordCount(candCleaned) : null,
        rounds,
        model,
      },
    };
  };

  // Short-field no-op: already under the gate, accept without burning a round.
  if (passesGate(text, cfg)) {
    return result(false, 'ok', text, 0, undefined, text);
  }

  let current = text;
  let currentFk = fkBefore;
  let currentWords = wordsBefore;
  let rounds = 0;
  let lastModel: string | undefined;
  // Default for the after-loop "no usable candidate" case is a parse failure: the
  // only way to exit the loop without adopting a candidate is unparseable output.
  let lastFailReason: RewriteReason = 'malformed_output';

  for (let r = 0; r < cfg.maxRounds; r++) {
    let content: string;
    let model: string | undefined;
    try {
      const res = await callModelWithFallback({
        models: [...REWRITER_MODELS],
        system: buildSystemPrompt(level, current),
        messages: [
          {
            role: 'user',
            content: buildUserPrompt(
              current,
              currentFk,
              currentWords,
              cfg.wordCap,
              cfg.fkTarget,
            ),
          },
        ],
        temperature: 0.3,
        responseFormat: { type: 'json_object' },
        caller: `readability.rewrite.${level}`,
      });
      content = res.content;
      model = res.model;
      lastModel = model;
    } catch {
      // Model/timeout/all-failed: never throw to the caller. No candidate produced.
      return result(false, 'model_failed', text, rounds, lastModel, null);
    }
    rounds++;

    const candidate = extractRewrite(content);
    if (candidate === null) {
      lastFailReason = 'malformed_output'; // no usable rewrite field this round
      break;
    }
    // Token corruption is the most specific, actionable failure signal — check it
    // before the generic length-sanity guard. (A non-empty rewrite is required
    // first so an empty string is reported as sanity, not token, failure.)
    // This integrity guard still drops to the original; we record the rejected
    // candidate's achieved FK/words so analytics can show attempted -> achieved.
    if (candidate.trim()) {
      if (enforceTokens && !tokensOk(text, candidate)) {
        return result(false, 'token_guard_failed', text, rounds, model, candidate);
      }
    }
    if (!passesSanity(current, candidate)) {
      return result(false, 'sanity_failed', text, rounds, model, candidate);
    }

    // Adopt the candidate as the new working text.
    current = candidate;
    currentWords = wordCount(clean(candidate));
    currentFk = fkGrade(clean(candidate));

    if (passesGate(current, cfg)) {
      return result(true, 'ok', current, rounds, model, current);
    }

    // DOK4 extra-pass policy: only continue past round 1 if still over threshold.
    if (cfg.extraPassOverWords !== undefined && currentWords <= cfg.extraPassOverWords) {
      break;
    }
  }

  // Gate not met within the allowed rounds. If we adopted at least one candidate
  // (it cleared sanity + token), keep the best one rather than dropping
  // to the grader original — the FK/length gate is no longer a drop reason.
  if (current !== text) {
    return result(true, 'accepted_below_target', current, rounds, lastModel, current);
  }
  // No usable candidate was ever produced (only malformed output): fall back.
  return result(false, lastFailReason, text, rounds, lastModel, null);
}
