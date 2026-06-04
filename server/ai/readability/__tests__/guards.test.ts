import { describe, it, expect } from 'vitest';
import { passesGate, passesSanity, tokensOk } from '../guards';
import { REWRITE_CONFIG } from '../config';

describe('tokensOk (subset rule)', () => {
  const original = 'See [DOK1:1234] and [DOK2:567] for evidence.';

  it('passes when rewrite uses a subset of the original tokens', () => {
    expect(tokensOk(original, 'See [DOK1:1234] for evidence.')).toBe(true);
  });

  it('passes when all tokens are dropped', () => {
    expect(tokensOk(original, 'See the evidence above.')).toBe(true);
  });

  it('passes when text has no tokens at all', () => {
    expect(tokensOk('plain feedback', 'plainer feedback')).toBe(true);
  });

  it('fails on a renumbered token', () => {
    expect(tokensOk(original, 'See [DOK1:9999] for evidence.')).toBe(false);
  });

  it('fails on an invented token not in the original', () => {
    expect(tokensOk('plain feedback', 'See [DOK2:1] here.')).toBe(false);
  });

  it('fails on a corrupt / malformed token', () => {
    expect(tokensOk(original, 'See [DOK 1:1] for evidence.')).toBe(false);
  });
});

describe('passesGate', () => {
  const dok1 = REWRITE_CONFIG.DOK1; // fk<=10, words<=89

  it('accepts low-FK + under-cap text for DOK1', () => {
    // 80 words across 20 short sentences => FK well under 10, words <= 89
    const text = Array.from({ length: 20 }, () => 'The cat ran fast').join('. ') + '.';
    expect(passesGate(text, dok1)).toBe(true);
  });

  it('rejects when FK is over target', () => {
    const hard =
      'The student demonstrates a sophisticated understanding of the underlying theoretical frameworks and articulates nuanced distinctions between competing methodological approaches and epistemological commitments.';
    expect(passesGate(hard, dok1)).toBe(false); // FK >> 10
  });

  it('rejects when word count is over cap', () => {
    const long = Array.from({ length: 200 }, () => 'word').join(' ');
    expect(passesGate(long, dok1)).toBe(false);
  });

  it('rejects when FK is null (under 5 words)', () => {
    expect(passesGate('too few', dok1)).toBe(false);
  });
});

describe('passesSanity', () => {
  const original = Array.from({ length: 200 }, () => 'word').join(' ');

  it('rejects empty / whitespace-only rewrites', () => {
    expect(passesSanity(original, '')).toBe(false);
    expect(passesSanity(original, '   \n  ')).toBe(false);
  });

  it('rejects an absurdly short rewrite of a long original', () => {
    expect(passesSanity(original, 'ok')).toBe(false);
  });

  it('rejects a blown-up rewrite (> 2x original length)', () => {
    const short = 'a short original sentence here';
    const blown = Array.from({ length: 80 }, () => 'word').join(' ');
    expect(passesSanity(short, blown)).toBe(false);
  });

  it('accepts a reasonable shorter rewrite', () => {
    const rewrite = Array.from({ length: 60 }, () => 'word').join(' ');
    expect(passesSanity(original, rewrite)).toBe(true);
  });
});
