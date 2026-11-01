/**
 * FR5: Dashboard wiring — auto-trigger state + useEffect + modal mount.
 *
 * Source-string contract following the existing component-test style
 * (vitest env: node, .test.ts only).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard = fs.readFileSync(
  new URL('../Dashboard.tsx', import.meta.url),
  'utf8',
);

describe('Dashboard explainer wiring (FR5)', () => {
  it('imports useHasSeenExplainer from @/hooks/useHasSeenExplainer', () => {
    expect(dashboard).toMatch(
      /import\s*\{\s*useHasSeenExplainer\s*\}\s*from\s*['"]@\/hooks\/useHasSeenExplainer['"]/,
    );
  });

  it('imports useIsMobile from @/hooks/use-mobile', () => {
    expect(dashboard).toMatch(
      /import\s*\{\s*useIsMobile\s*\}\s*from\s*['"]@\/hooks\/use-mobile['"]/,
    );
  });

  it('imports GradingExplainer', () => {
    expect(dashboard).toMatch(
      /import\s*\{\s*GradingExplainer\s*\}\s*from\s*['"]@\/components\/grading-explainer\/GradingExplainer['"]/,
    );
  });

  it('imports dok1Screens barrel', () => {
    expect(dashboard).toMatch(
      /import\s*\{\s*dok1Screens\s*\}\s*from\s*['"]@\/components\/grading-explainer\/dok1['"]/,
    );
  });

  it('imports useEffect (needed for the auto-trigger)', () => {
    expect(dashboard).toMatch(/\buseEffect\b/);
  });

  it('declares showExplainerModal state pair', () => {
    expect(dashboard).toMatch(
      /\[showExplainerModal,\s*setShowExplainerModal\]\s*=\s*useState\(false\)/,
    );
  });

  it('calls useHasSeenExplainer("dok1") only when the Facts tab is relevant', () => {
    expect(dashboard).toMatch(/useHasSeenExplainer\(['"]dok1['"],\s*\{\s*enabled:\s*activeTab === ['"]facts['"]/);
    expect(dashboard).toMatch(/isLoading\s*:\s*isLoadingSeen/);
    expect(dashboard).toMatch(/hasSeen/);
    expect(dashboard).toMatch(/markSeen/);
  });

  it('calls useIsMobile()', () => {
    expect(dashboard).toMatch(/useIsMobile\(\)/);
  });

  it('declares a triggeredRef = useRef(false) guard', () => {
    expect(dashboard).toMatch(/triggeredRef\s*=\s*useRef\(false\)/);
  });

  it('has a useEffect that gates on all five conditions and flips the ref', () => {
    // The effect references each of the gating conditions.
    expect(dashboard).toMatch(/activeTab === ['"]facts['"]/);
    expect(dashboard).toMatch(/!isLoadingSeen/);
    expect(dashboard).toMatch(/!hasSeen/);
    expect(dashboard).toMatch(/!isMobile/);
    expect(dashboard).toMatch(/!triggeredRef\.current/);
    expect(dashboard).toMatch(/triggeredRef\.current\s*=\s*true/);
    expect(dashboard).toMatch(/setShowExplainerModal\(true\)/);
  });

  it('renders <GradingExplainer> with the expected props', () => {
    expect(dashboard).toMatch(/<GradingExplainer\b/);
    expect(dashboard).toMatch(/open=\{showExplainerModal\}/);
    expect(dashboard).toMatch(/onOpenChange=\{setShowExplainerModal\}/);
    expect(dashboard).toMatch(/dokLevel=['"]dok1['"]/);
    expect(dashboard).toMatch(/screens=\{dok1Screens\}/);
    expect(dashboard).toMatch(/onCompleteSeen=\{markSeen\}/);
  });

  it('passes onOpenExplainer to <FactGradingPanel>', () => {
    expect(dashboard).toMatch(
      /onOpenExplainer=\{\(\)\s*=>\s*setShowExplainerModal\(true\)\}/,
    );
  });
});
