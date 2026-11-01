import { describe, it, expect } from 'vitest';
import { clean, wordCount, fkGrade, stripTokens } from '../readability';

// Fixed reference strings. Expected values are produced by the research harness
// (scripts/optimal-prompt/lib/readability.ts) using the SAME text-readability
// version (v1.1.1), same clean(), same FK 2-dp rounding, same lexicon counter.
// If these drift, the prod port no longer matches the experiment numbers.
const S1 =
  'The student demonstrates a sophisticated understanding of the underlying theoretical frameworks and articulates nuanced distinctions between competing methodological approaches.';
const S2 = 'This is a short clear sentence that a teen can read fast.';
const S3 = 'You did great work here. Add one more example to make it stronger.';

describe('clean', () => {
  it('strips markdown, links, and source tails to bare prose', () => {
    expect(
      clean(
        '**Bold** text with [link](https://x.com) and more.\nSource: [a](https://y.com)',
      ),
    ).toBe('Bold text with link and more.');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(clean(null)).toBe('');
    expect(clean(undefined)).toBe('');
    expect(clean('')).toBe('');
  });

  it('collapses bare urls and whitespace', () => {
    expect(clean('see   https://example.com/x   now')).toBe('see now');
  });
});

describe('citation tokens are excluded from scoring', () => {
  // The FE renders [DOKX:id] as inline chips, so they must not count as prose.
  const PROSE = 'You did great work here. Add one more example to make it stronger.';
  const WITH_INLINE = 'You did great work here [DOK1:1234]. Add one more example [DOK2:567] to make it stronger.';
  const WITH_DUMPED = `${PROSE} [DOK1:1234] [DOK2:567] [DOK3:8901]`;

  it('stripTokens removes well-formed tokens (tolerant of spaces/casing)', () => {
    expect(clean(stripTokens('a [DOK1:12] b [ dok2 : 34 ] c'))).toBe('a b c');
  });

  it('clean leaves no citation token in the scored text', () => {
    expect(clean(WITH_INLINE)).not.toMatch(/\[\s*DOK/i);
    expect(clean(WITH_DUMPED)).not.toMatch(/\[\s*DOK/i);
  });

  it('word count ignores tokens whether inline or dumped at the end', () => {
    const base = wordCount(clean(PROSE));
    expect(wordCount(clean(WITH_INLINE))).toBe(base);
    expect(wordCount(clean(WITH_DUMPED))).toBe(base);
  });

  it('FK grade ignores tokens whether inline or dumped at the end', () => {
    const base = fkGrade(clean(PROSE));
    expect(fkGrade(clean(WITH_INLINE))).toBe(base);
    expect(fkGrade(clean(WITH_DUMPED))).toBe(base);
  });
});

describe('wordCount', () => {
  it('reproduces harness lexicon word counts on fixed strings', () => {
    expect(wordCount(clean(S1))).toBe(19);
    expect(wordCount(clean(S2))).toBe(12);
    expect(wordCount(clean(S3))).toBe(13);
  });

  it('returns 0 for empty / null', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
    expect(wordCount(undefined)).toBe(0);
  });
});

describe('fkGrade', () => {
  it('reproduces harness Flesch-Kincaid grades (2-dp) on fixed strings', () => {
    expect(fkGrade(clean(S1))).toBe(24.9);
    expect(fkGrade(clean(S2))).toBe(2.1);
    expect(fkGrade(clean(S3))).toBe(1.1);
  });

  it('returns null for fewer than 5 words', () => {
    expect(fkGrade('too few words')).toBe(null); // 3 words
    expect(fkGrade('one two three four')).toBe(null); // 4 words
  });

  it('returns null for null/undefined/empty', () => {
    expect(fkGrade(null)).toBe(null);
    expect(fkGrade(undefined)).toBe(null);
    expect(fkGrade('')).toBe(null);
  });

  it('never throws and yields a finite number for normal prose', () => {
    const v = fkGrade(clean(S2));
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v as number)).toBe(true);
  });
});
