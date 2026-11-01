/**
 * Guards the DOK4 golden set without calling a model: the file must parse,
 * cover every rubric level plus the rejection gate, and the context builder
 * must reproduce production foundation math (the ceiling probe depends on it).
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { goldenSetSchema } from '../golden-schema';
import { buildEvaluationContext, traceabilitySources } from '../context';

const golden = goldenSetSchema.parse(
  JSON.parse(readFileSync(path.join(__dirname, '..', 'golden.json'), 'utf8')),
);

describe('DOK4 golden set', () => {
  it('has enough cases to be a meaningful pass rate', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(20);
  });

  it('covers every quality level and the rejection gate', () => {
    const levelsCovered = new Set<number>();
    for (const c of golden.cases) {
      if (!c.expected.accept) continue;
      for (let s = c.expected.minScore!; s <= c.expected.maxScore!; s++) levelsCovered.add(s);
    }
    expect([...levelsCovered].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(golden.cases.some((c) => !c.expected.accept)).toBe(true);
  });

  it('keeps expected bands narrow enough to catch drift', () => {
    for (const c of golden.cases) {
      if (!c.expected.accept) continue;
      const width = c.expected.maxScore! - c.expected.minScore!;
      expect(width, `${c.id} band is too wide`).toBeLessThanOrEqual(2);
    }
  });

  it('includes a foundation-ceiling probe whose chain caps the score at 2', () => {
    const probe = golden.cases.find((c) => c.id === 'spaced-weak-foundation-ceiling');
    expect(probe).toBeDefined();
    const context = buildEvaluationContext(probe!);
    expect(context.foundationIndex).toBeLessThan(2);
    expect(context.foundationCeiling).toBe(2);
    expect(probe!.expected.maxScore).toBe(2);
  });

  it('gives strong chains a ceiling that does not bind the top band', () => {
    for (const c of golden.cases) {
      if (!c.expected.accept || c.expected.maxScore! < 4) continue;
      const context = buildEvaluationContext(c);
      expect(context.foundationCeiling, `${c.id} ceiling`).toBeGreaterThanOrEqual(c.expected.maxScore!);
    }
  });
});

describe('buildEvaluationContext', () => {
  const sample = golden.cases.find((c) => c.id === 'bike-sharp')!;
  const context = buildEvaluationContext(sample);

  it('assigns unique ids across DOK levels so prompt markers are unambiguous', () => {
    const ids = [
      context.primaryDok3.id,
      ...context.additionalDok3s.map((d) => d.id),
      ...context.linkedDok2s.map((d) => d.id),
      ...context.linkedDok2s.flatMap((d) => d.dok1Facts.map((f) => f.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('computes foundation metrics with the shared production formula', () => {
    // bike chain: DOK1 scores 5,4,4 -> 4.33; DOK2 grades 4,4 -> 4.0; DOK3 4
    expect(context.dok1FoundationScore).toBeCloseTo(4.33, 2);
    expect(context.dok2FoundationScore).toBeCloseTo(4.0, 2);
    expect(context.dok3FoundationScore).toBe(4);
    expect(context.foundationIndex).toBeCloseTo(4.33 * 0.25 + 4.0 * 0.35 + 4 * 0.4, 1);
    expect(context.foundationCeiling).toBe(5);
  });

  it('starts with traceability and divergence unset, as production does before those steps', () => {
    expect(context.traceabilityResult).toBeNull();
    expect(context.divergenceResult).toBeNull();
  });

  it('exposes traceability sources with their cached content', () => {
    const sources = traceabilitySources(context);
    expect(sources).toHaveLength(sample.linkedDok2s.length);
    expect(sources[0]).toMatchObject({
      sourceName: sample.linkedDok2s[0].sourceName,
      dok2Points: sample.linkedDok2s[0].points,
      content: sample.linkedDok2s[0].content,
    });
  });
});
