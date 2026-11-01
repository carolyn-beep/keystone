/**
 * FR4: FactGradingPanel integration — onOpenExplainer? prop + help button mount.
 *
 * Source-string contract; mirrors the project's existing test style.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const panel = read('FactGradingPanel.tsx');

describe('FactGradingPanel — explainer wiring (FR4)', () => {
  it('imports Dok1ExplainerHelpButton from the dok1 folder', () => {
    expect(panel).toMatch(
      /import\s*\{\s*Dok1ExplainerHelpButton\s*\}\s*from\s*['"]@\/components\/grading-explainer\/dok1\/Dok1ExplainerHelpButton['"]/,
    );
  });

  it('declares onOpenExplainer?: () => void in FactGradingPanelProps', () => {
    expect(panel).toMatch(/onOpenExplainer\?:\s*\(\)\s*=>\s*void/);
  });

  it('destructures onOpenExplainer from props', () => {
    expect(panel).toMatch(/onOpenExplainer/);
  });

  it('renders the help button only when onOpenExplainer is provided', () => {
    expect(panel).toMatch(
      /\{\s*onOpenExplainer\s*&&\s*\(?\s*<Dok1ExplainerHelpButton/,
    );
  });

  it('passes onOpenExplainer as the button onClick', () => {
    expect(panel).toMatch(/<Dok1ExplainerHelpButton\s+onClick=\{onOpenExplainer\}\s*\/>/);
  });
});
