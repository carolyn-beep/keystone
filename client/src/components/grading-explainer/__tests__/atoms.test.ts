/**
 * FR5: shared atom source-string tests.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const scoreBadge = read('atoms/ScoreBadge.tsx');
const sectionLabel = read('atoms/SectionLabel.tsx');
const heroCard = read('atoms/HeroCard.tsx');
const types = read('types.ts');

describe('ScoreBadge source', () => {
  it('accepts a RubricScore (0..5) prop', () => {
    expect(scoreBadge).toMatch(/score:\s*RubricScore/);
  });

  it('accepts a size prop (sm | md | lg)', () => {
    expect(scoreBadge).toMatch(/'sm'\s*\|\s*'md'\s*\|\s*'lg'/);
  });

  it('handles the non-gradeable case (score 0) explicitly', () => {
    expect(scoreBadge).toMatch(/score === 0/);
  });

  it('uses chromatic CSS variables (not hardcoded hex)', () => {
    expect(scoreBadge).toMatch(/var\(--success-/);
    expect(scoreBadge).toMatch(/var\(--info-/);
    expect(scoreBadge).toMatch(/var\(--warning-/);
    expect(scoreBadge).toMatch(/var\(--danger-/);
  });

  it('sets an aria-label per score', () => {
    expect(scoreBadge).toMatch(/aria-label/);
    expect(scoreBadge).toMatch(/Non-gradeable/);
  });
});

describe('SectionLabel source', () => {
  it('renders uppercase + tracked', () => {
    expect(sectionLabel).toMatch(/uppercase/);
    expect(sectionLabel).toMatch(/tracking-\[0\.35em\]/);
  });

  it('uses text-muted-foreground (not a raw color)', () => {
    expect(sectionLabel).toContain('text-muted-foreground');
  });
});

describe('HeroCard source', () => {
  it('uses bg-card and a border', () => {
    expect(heroCard).toContain('bg-card');
    expect(heroCard).toContain('border-border');
  });

  it('accepts className override', () => {
    expect(heroCard).toMatch(/className\?:\s*string/);
  });
});

describe('grading-explainer types', () => {
  it('exports DokLevel union with dok1..dok4', () => {
    expect(types).toMatch(/DokLevel\s*=\s*'dok1'\s*\|\s*'dok2'\s*\|\s*'dok3'\s*\|\s*'dok4'/);
  });

  it('exports prop interfaces for Shell, Screen, Orchestrator', () => {
    expect(types).toMatch(/ExplainerShellProps/);
    expect(types).toMatch(/ExplainerScreenProps/);
    expect(types).toMatch(/GradingExplainerProps/);
  });

  it('GradingExplainerProps takes a screens array of React elements', () => {
    expect(types).toMatch(/screens:\s*React\.ReactElement\[\]/);
  });

  it('exports a RubricScore type with 0..5', () => {
    expect(types).toMatch(/RubricScore\s*=\s*0\s*\|\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5/);
  });
});
