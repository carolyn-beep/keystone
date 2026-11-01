import { describe, it, expect } from 'vitest';
import { buildTokenResolver } from '../useTokenResolver';

const facts = [
  { id: 100, fact: 'Athletes earn revenue share.', score: 4, source: 'https://example.com/a' },
  { id: 101, fact: 'No source fact.', score: 2 },
];
const dok2Summaries = [
  { id: 200, displayTitle: 'Compensation findings', category: 'Money', grade: 3 },
  { id: 201, displayTitle: null, category: 'Fairness', grade: 5 },
  { id: 202, displayTitle: null, category: null, grade: null },
];
const dok3Insights = [
  { id: 300, text: 'Cross-source pattern on pay.', score: 5 },
];

describe('buildTokenResolver', () => {
  const resolve = buildTokenResolver({ facts, dok2Summaries, dok3Insights });

  it('resolves a DOK1 fact with text, score, and sourceUrl', () => {
    const r = resolve(1, 100);
    expect(r).toEqual({
      level: 1,
      id: 100,
      text: 'Athletes earn revenue share.',
      score: 4,
      sourceUrl: 'https://example.com/a',
    });
  });

  it('resolves a DOK1 fact with no source to sourceUrl null', () => {
    expect(resolve(1, 101)?.sourceUrl).toBeNull();
  });

  it('resolves a DOK2 summary using displayTitle and grade as score', () => {
    const r = resolve(2, 200);
    expect(r?.text).toBe('Compensation findings');
    expect(r?.score).toBe(3);
  });

  it('falls back to category when DOK2 displayTitle is null', () => {
    expect(resolve(2, 201)?.text).toBe('Fairness');
  });

  it('resolves a DOK3 insight with text and score', () => {
    const r = resolve(3, 300);
    expect(r?.text).toBe('Cross-source pattern on pay.');
    expect(r?.score).toBe(5);
  });

  it('returns null for unknown ids at each level', () => {
    expect(resolve(1, 999)).toBeNull();
    expect(resolve(2, 999)).toBeNull();
    expect(resolve(3, 999)).toBeNull();
  });

  it('returns null for everything with empty inputs and does not throw', () => {
    const empty = buildTokenResolver({ facts: [], dok2Summaries: [], dok3Insights: [] });
    expect(empty(1, 1)).toBeNull();
    expect(empty(2, 1)).toBeNull();
    expect(empty(3, 1)).toBeNull();
  });
});
