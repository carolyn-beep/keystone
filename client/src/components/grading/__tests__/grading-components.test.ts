import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Source-level contracts for the grading token components and their wiring.
 *
 * The repo has no jsdom / @testing-library/react, and the existing FE test
 * convention (see client/src/components/sprint/__tests__/sprint-tab.test.tsx)
 * asserts on component source for structural guarantees while pure logic is
 * unit-tested directly. These tests guard the FR3/FR4/FR7 contracts that are
 * not expressible as pure-function tests.
 */

const read = (rel: string) =>
  fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('CitationChip (FR3)', () => {
  const src = read('../CitationChip.tsx');

  it('renders the raw token as inert text when unresolvable (no chip)', () => {
    expect(src).toMatch(/if \(!entity\)\s*{\s*return <span>{token\.raw}<\/span>/);
  });

  it('renders a focusable button trigger with an aria-label naming the item', () => {
    expect(src).toContain('Popover.Trigger');
    expect(src).toContain('<button');
    expect(src).toMatch(/aria-label=\{ariaLabel\}/);
    expect(src).toMatch(/citation \$\{index\}: \$\{entity\.text\}/);
  });

  it('opens on hover and focus', () => {
    expect(src).toMatch(/onMouseEnter=\{\(\) => setOpen\(true\)\}/);
    expect(src).toMatch(/onFocus=\{\(\) => setOpen\(true\)\}/);
  });

  it('shows score and a DOK1 source link, and a go-to-item control calling onNavigate', () => {
    expect(src).toMatch(/\{entity\.score\}\/5/);
    expect(src).toMatch(/entity\.sourceUrl/);
    expect(src).toMatch(/onNavigate\(token\.level, token\.id\)/);
  });

  it('uses a Radix Popover for Esc-dismiss + keyboard semantics', () => {
    expect(src).toContain("@radix-ui/react-popover");
  });
});

describe('RationaleText (FR4)', () => {
  const src = read('../RationaleText.tsx');

  it('segments the text and renders token segments as CitationChip', () => {
    expect(src).toContain('segmentText');
    expect(src).toContain('<CitationChip');
  });

  it('does not fetch data (pure renderer over props)', () => {
    expect(src).not.toContain('useQuery');
    expect(src).not.toContain('fetch(');
  });
});

describe('InsightsTab wiring (FR7 / DOK3)', () => {
  const src = read('../../InsightsTab.tsx');

  it('renders DOK3 rationale via RationaleText', () => {
    expect(src).toContain('RationaleText');
  });
  it('uses the raw/simplified toggle', () => {
    expect(src).toMatch(/RawSimplifiedToggle|useRawSimplified/);
  });
  it('adds navigateToInsight and resolves tokens', () => {
    expect(src).toContain('navigateToInsight');
    expect(src).toMatch(/buildTokenResolver|useTokenResolver/);
  });
});

describe('DOK4Tab wiring (FR7 / DOK4 + data gap)', () => {
  const src = read('../../DOK4Tab.tsx');

  it('renders DOK4 rationale via RationaleText', () => {
    expect(src).toContain('RationaleText');
  });
  it('uses the raw/simplified toggle', () => {
    expect(src).toMatch(/RawSimplifiedToggle|useRawSimplified/);
  });
  it('builds a resolver from facts + dok2 + dok3 (closes the DOK4 data gap)', () => {
    expect(src).toMatch(/buildTokenResolver|useTokenResolver/);
    expect(src).toContain('dok3Insights');
  });
});

describe('SummariesTab wiring (FR7 / DOK2 toggle, no chips)', () => {
  const src = read('../../SummariesTab.tsx');

  it('wraps DOK2 diagnosis in the raw/simplified toggle', () => {
    expect(src).toMatch(/RawSimplifiedToggle|useRawSimplified/);
  });
});

describe('FactRow wiring (FR7 / DOK1 toggle, preserves structured render)', () => {
  const src = read('../../fact-grading/FactRow.tsx');

  it('keeps parseAnalysisStructured', () => {
    expect(src).toContain('parseAnalysisStructured');
  });
  it('adds the raw/simplified toggle and selects note vs noteRaw', () => {
    expect(src).toMatch(/RawSimplifiedToggle|useRawSimplified/);
    expect(src).toContain('noteRaw');
  });
});

describe('Backend getters expose *_raw (FR6)', () => {
  const dok2 = fs.readFileSync(new URL('../../../../../server/storage/dok2.ts', import.meta.url), 'utf8');
  const dok3 = fs.readFileSync(new URL('../../../../../server/storage/dok3.ts', import.meta.url), 'utf8');
  const dok4 = fs.readFileSync(new URL('../../../../../server/storage/dok4.ts', import.meta.url), 'utf8');

  it('getDOK2Summaries returns diagnosisRaw', () => {
    expect(dok2).toMatch(/diagnosisRaw:\s*summary\.diagnosisRaw/);
  });
  it('getDOK3Insights returns rationaleRaw', () => {
    expect(dok3).toMatch(/rationaleRaw:\s*insight\.rationaleRaw/);
  });
  it('getDOK4Spovs returns rationaleRaw', () => {
    expect(dok4).toMatch(/rationaleRaw:\s*spov\.rationaleRaw/);
  });
});
