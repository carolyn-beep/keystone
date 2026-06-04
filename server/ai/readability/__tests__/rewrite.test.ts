import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the unified client. rewrite.ts imports callModelWithFallback from '../../client'.
vi.mock('../../client', () => ({
  callModelWithFallback: vi.fn(),
}));

import { callModelWithFallback } from '../../client';
import { AllModelsFailed, TimeoutError } from '../../client/errors';
import { rewriteField } from '../rewrite';
import { fkGrade, wordCount } from '../../../utils/readability';

const mockCall = vi.mocked(callModelWithFallback);

/** Build a CallModelResult-shaped object whose content is a JSON rewrite. */
function jsonResult(rewrite: string) {
  return {
    content: JSON.stringify({ rewrite }),
    model: 'qwen/qwen3-30b-a3b-instruct-2507',
    durationMs: 1,
    attempts: 1,
  };
}

/** Roughly N short simple words across many short sentences, so FK stays low. */
function simpleText(words: number): string {
  const sentence = 'The cat ran fast'; // 4 words, period adds a sentence break
  const reps = Math.ceil(words / 4);
  return Array.from({ length: reps }, () => sentence).join('. ') + '.';
}

// A genuinely long (~220-word), high-FK original so that rewrites down to
// 100-180 words stay within the 2x blowup guard and the gate has work to do.
const LONG_DOK3 = Array.from(
  { length: 4 },
  () =>
    'The insight demonstrates a sophisticated and nuanced understanding of the underlying ' +
    'theoretical frameworks, articulating distinctions between competing methodological ' +
    'approaches while synthesizing evidence from multiple disparate sources into a coherent ' +
    'and defensible analytical position that addresses the central research question with ' +
    'considerable rigor, depth, breadth, and intellectual honesty throughout the entire piece.',
).join(' ');

beforeEach(() => {
  mockCall.mockReset();
});

describe('rewriteField — happy path', () => {
  it('DOK3 long rationale becomes shorter + simpler, reason ok', async () => {
    const accepted = simpleText(120); // <140 words, low FK
    mockCall.mockResolvedValueOnce(jsonResult(accepted));

    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });

    expect(res.rewritten).toBe(true);
    expect(res.reason).toBe('ok');
    expect(res.metrics.wordsAfter).toBeLessThanOrEqual(140);
    expect(fkGrade(res.text)).toBeLessThanOrEqual(10);
    expect(mockCall).toHaveBeenCalledTimes(1);
    // caller string is always provided
    expect(mockCall.mock.calls[0][0].caller).toMatch(/readability\.rewrite/);
  });

  it('no-ops when the input already meets the gate (no model call)', async () => {
    const already = simpleText(40); // under DOK1 89 cap, low FK
    const res = await rewriteField({ level: 'DOK1', text: already });

    expect(res.text).toBe(already);
    expect(res.metrics.rounds).toBe(0);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('rewriteField — DOK4 loop policy', () => {
  it('runs a second pass when round-1 stays over 170 words', async () => {
    const round1 = simpleText(180); // still > 170
    const round2 = simpleText(150); // now under 160 cap
    mockCall.mockResolvedValueOnce(jsonResult(round1));
    mockCall.mockResolvedValueOnce(jsonResult(round2));

    const res = await rewriteField({ level: 'DOK4', text: LONG_DOK3 });

    expect(res.metrics.rounds).toBe(2);
    expect(mockCall).toHaveBeenCalledTimes(2);
  });

  it('single pass when round-1 is already under the extra-pass threshold', async () => {
    const round1 = simpleText(150); // <=170 and <=160 cap
    mockCall.mockResolvedValueOnce(jsonResult(round1));

    const res = await rewriteField({ level: 'DOK4', text: LONG_DOK3 });

    expect(res.metrics.rounds).toBe(1);
    expect(mockCall).toHaveBeenCalledTimes(1);
  });
});

describe('rewriteField — token guard (DOK3/DOK4)', () => {
  const tokenText =
    'This insight builds on [DOK2:5] and [DOK1:7]. ' + LONG_DOK3;

  it('includes the token-preservation line only when a token is present', async () => {
    mockCall.mockResolvedValueOnce(
      jsonResult('Short clear take. Builds on [DOK2:5] and [DOK1:7].'),
    );
    await rewriteField({ level: 'DOK3', text: tokenText });

    const system = mockCall.mock.calls[0][0].system ?? '';
    expect(system).toMatch(/REFERENCE TOKENS/);
  });

  it('allows dropped tokens', async () => {
    mockCall.mockResolvedValueOnce(jsonResult(simpleText(100))); // drops both tokens
    const res = await rewriteField({ level: 'DOK3', text: tokenText });
    expect(res.rewritten).toBe(true);
  });

  it('falls back when a token is renumbered/invented', async () => {
    mockCall.mockResolvedValue(jsonResult('Take. Builds on [DOK1:9999].'));
    const res = await rewriteField({ level: 'DOK3', text: tokenText });
    expect(res.rewritten).toBe(false);
    expect(res.reason).toBe('token_guard_failed');
    expect(res.text).toBe(tokenText);
  });

  it('NEVER adds the token line for DOK1', async () => {
    const dok1Text = LONG_DOK3; // long, no tokens (DOK1 never carries tokens)
    mockCall.mockResolvedValueOnce(jsonResult(simpleText(70)));
    await rewriteField({ level: 'DOK1', text: dok1Text, protectedTokens: true });
    const system = mockCall.mock.calls[0][0].system ?? '';
    expect(system).not.toMatch(/REFERENCE TOKENS/);
  });
});

describe('rewriteField — error / fallback paths', () => {
  it('AllModelsFailed -> model_failed, returns original, no throw', async () => {
    mockCall.mockRejectedValue(new AllModelsFailed(['qwen/qwen3-30b-a3b-instruct-2507'], []));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.rewritten).toBe(false);
    expect(res.reason).toBe('model_failed');
    expect(res.text).toBe(LONG_DOK3);
  });

  it('TimeoutError -> model_failed, returns original', async () => {
    mockCall.mockRejectedValue(new TimeoutError('qwen', 1000));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.reason).toBe('model_failed');
    expect(res.text).toBe(LONG_DOK3);
  });

  it('empty rewrite -> sanity_failed, fallback', async () => {
    mockCall.mockResolvedValue(jsonResult('   '));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.reason).toBe('sanity_failed');
    expect(res.text).toBe(LONG_DOK3);
  });

  it('blown-up rewrite (>2x) -> sanity_failed, fallback', async () => {
    const blown = simpleText(wordCount(LONG_DOK3) * 3);
    mockCall.mockResolvedValue(jsonResult(blown));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.reason).toBe('sanity_failed');
    expect(res.text).toBe(LONG_DOK3);
  });

  it('gate unmet after max rounds -> keeps best candidate (accepted_below_target)', async () => {
    // valid + sane + tokens-ok, but FK stays high (never meets gate). With the gate no
    // longer a drop reason, the best adopted candidate is kept, not the original.
    const candidate = LONG_DOK3.slice(0, LONG_DOK3.length - 1) + ' indeed.';
    mockCall.mockResolvedValue(jsonResult(candidate));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.rewritten).toBe(true);
    expect(res.reason).toBe('accepted_below_target');
    expect(res.text).toBe(candidate);
  });

  it('malformed JSON -> malformed_output, fallback to original', async () => {
    mockCall.mockResolvedValue({
      content: 'not json at all',
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
      durationMs: 1,
      attempts: 1,
    });
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.rewritten).toBe(false);
    expect(res.reason).toBe('malformed_output');
    expect(res.text).toBe(LONG_DOK3);
  });

  it('input under 5 words does not crash', async () => {
    mockCall.mockResolvedValue(jsonResult('still tiny'));
    const res = await rewriteField({ level: 'DOK1', text: 'tiny note' });
    expect(res).toBeTruthy();
    expect(res.text).toBeTypeOf('string');
  });
});

describe('rewriteField — achieved candidate metrics', () => {
  it('records the rejected candidate FK/words on a sanity fallback (not the original)', async () => {
    // Blown-up rewrite (>2x) is rejected by sanity, but its achieved metrics are captured.
    const blown = simpleText(wordCount(LONG_DOK3) * 3);
    mockCall.mockResolvedValue(jsonResult(blown));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });

    expect(res.reason).toBe('sanity_failed');
    expect(res.text).toBe(LONG_DOK3); // persisted = original
    // candidate metrics reflect the rejected candidate, not the persisted original
    expect(res.metrics.candidateWords).toBe(wordCount(blown));
    expect(res.metrics.candidateWords).not.toBe(res.metrics.wordsAfter);
    expect(res.metrics.candidateFk).toBe(fkGrade(blown));
  });

  it('records the rejected candidate metrics on a token-guard fallback', async () => {
    const tokenText = 'Builds on [DOK1:7]. ' + LONG_DOK3;
    // Long enough that FK computes, with an invented token that trips the guard.
    const candidate = simpleText(100) + ' Builds on [DOK1:9999].';
    mockCall.mockResolvedValue(jsonResult(candidate));
    const res = await rewriteField({ level: 'DOK3', text: tokenText });

    expect(res.reason).toBe('token_guard_failed');
    expect(res.metrics.candidateWords).toBeGreaterThan(0);
    expect(res.metrics.candidateFk).not.toBeNull();
  });

  it('null candidate metrics when no candidate is produced (model_failed)', async () => {
    mockCall.mockRejectedValue(new AllModelsFailed(['qwen/qwen3-30b-a3b-instruct-2507'], []));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.reason).toBe('model_failed');
    expect(res.metrics.candidateFk).toBeNull();
    expect(res.metrics.candidateWords).toBeNull();
  });

  it('null candidate metrics on malformed output', async () => {
    mockCall.mockResolvedValue({
      content: 'totally not json',
      model: 'qwen/qwen3-30b-a3b-instruct-2507',
      durationMs: 1,
      attempts: 1,
    });
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.reason).toBe('malformed_output');
    expect(res.metrics.candidateFk).toBeNull();
    expect(res.metrics.candidateWords).toBeNull();
  });

  it('accepted candidate metrics equal the persisted metrics on success', async () => {
    const accepted = simpleText(120);
    mockCall.mockResolvedValueOnce(jsonResult(accepted));
    const res = await rewriteField({ level: 'DOK3', text: LONG_DOK3 });
    expect(res.rewritten).toBe(true);
    expect(res.metrics.candidateFk).toBe(res.metrics.fkAfter);
    expect(res.metrics.candidateWords).toBe(res.metrics.wordsAfter);
  });
});
