/**
 * FR6 + FR7 + FR8: source-string contract tests for the explainer components.
 *
 * Mirrors useSkills.test.ts pattern (grep the source for the contract).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const shell = read('ExplainerShell.tsx');
const screen = read('ExplainerScreen.tsx');
const orchestrator = read('GradingExplainer.tsx');

describe('ExplainerShell source (FR6)', () => {
  it('uses @radix-ui/react-dialog primitives (free a11y)', () => {
    expect(shell).toContain("from '@radix-ui/react-dialog'");
    expect(shell).toMatch(/DialogPrimitive\.Root/);
    expect(shell).toMatch(/DialogPrimitive\.Portal/);
    expect(shell).toMatch(/DialogPrimitive\.Overlay/);
    expect(shell).toMatch(/DialogPrimitive\.Content/);
    expect(shell).toMatch(/DialogPrimitive\.Close/);
  });

  it('renders Back / Next / Finish buttons', () => {
    expect(shell).toContain('explainer-back-button');
    expect(shell).toContain('explainer-next-button');
    expect(shell).toContain('explainer-finish-button');
  });

  it('disables Back on the first step (currentStep === 0)', () => {
    expect(shell).toMatch(/isFirstStep\s*=\s*currentStep === 0/);
    expect(shell).toMatch(/disabled=\{isFirstStep\}/);
    expect(shell).toMatch(/aria-disabled=\{isFirstStep\}/);
  });

  it('renders Finish on the last step, Next otherwise', () => {
    expect(shell).toMatch(/isLastStep\s*=\s*currentStep\s*>=\s*totalSteps\s*-\s*1/);
    expect(shell).toMatch(/isLastStep\s*\?/);
  });

  it('renders a step-dot indicator with totalSteps dots', () => {
    expect(shell).toContain('explainer-step-dots');
    expect(shell).toMatch(/Array\.from\(\{\s*length:\s*totalSteps\s*\}/);
  });

  it('renders "Step N of total" text in the footer above the dots', () => {
    expect(shell).toMatch(/Step \{currentStep \+ 1\} of \{totalSteps\}/);
  });

  it('uses parchment tokens (bg-card / text-foreground), not raw hex', () => {
    expect(shell).toContain('bg-card');
    expect(shell).toContain('text-foreground');
  });

  it('mounts inside a Portal (overlay + content)', () => {
    expect(shell).toMatch(/DialogPrimitive\.Portal/);
  });
});

describe('ExplainerScreen source (FR7)', () => {
  it('does not render a top-of-screen STEP label (step chrome lives in shell footer)', () => {
    expect(screen).not.toMatch(/Step \{stepNumber\}/);
    expect(screen).not.toMatch(/SectionLabel/);
  });

  it('centers the title and subtitle in the header', () => {
    expect(screen).toMatch(/items-center/);
    expect(screen).toMatch(/text-center/);
  });

  it('renders the title inside Dialog.Title for a11y', () => {
    expect(screen).toMatch(/DialogPrimitive\.Title/);
  });

  it('renders the title as a serif h2 (neo-editorial type)', () => {
    expect(screen).toMatch(/font-serif/);
    expect(screen).toMatch(/<h2/);
  });

  it('renders subtitle in Dialog.Description when provided', () => {
    expect(screen).toMatch(/subtitle\s*\?/);
    expect(screen).toMatch(/DialogPrimitive\.Description/);
  });

  it('renders a fallback hidden Description when subtitle is missing (a11y)', () => {
    expect(screen).toMatch(/sr-only/);
  });

  it('renders optional hero slot above children', () => {
    expect(screen).toMatch(/hero\s*\?/);
    expect(screen).toContain('data-slot="hero"');
    expect(screen).toContain('data-slot="body"');
  });
});

describe('GradingExplainer source (FR8)', () => {
  it('owns currentStep state (useState)', () => {
    expect(orchestrator).toMatch(/useState\(0\)/);
  });

  it('resets currentStep to 0 when reopened', () => {
    expect(orchestrator).toMatch(/if \(open\)/);
    expect(orchestrator).toMatch(/setCurrentStep\(0\)/);
  });

  it('guards onCompleteSeen behind a ref (fires exactly once per close)', () => {
    expect(orchestrator).toMatch(/completeSeenFiredRef/);
    expect(orchestrator).toMatch(/completeSeenFiredRef\.current = true/);
    expect(orchestrator).toMatch(/completeSeenFiredRef\.current = false/);
  });

  it('Finish calls both fireCompleteSeenOnce and onOpenChange(false)', () => {
    expect(orchestrator).toMatch(/handleFinish\s*=/);
    expect(orchestrator).toMatch(/fireCompleteSeenOnce\(\);\s*\n\s*onOpenChange\(false\)/);
  });

  it('handleOpenChange(false) triggers fireCompleteSeenOnce', () => {
    expect(orchestrator).toMatch(/if \(!nextOpen\)/);
    expect(orchestrator).toMatch(/fireCompleteSeenOnce\(\)/);
  });

  it('bounds Back at 0 and Next at screens.length - 1', () => {
    expect(orchestrator).toMatch(/Math\.max\(0,\s*s - 1\)/);
    expect(orchestrator).toMatch(/Math\.min\(screens\.length - 1,\s*s \+ 1\)/);
  });

  it('renders nothing when screens.length === 0 (defensive)', () => {
    expect(orchestrator).toMatch(/screens\.length === 0/);
    expect(orchestrator).toMatch(/return null/);
  });

  it('passes dokLevel through as a data attribute on the body wrapper', () => {
    expect(orchestrator).toMatch(/data-dok-level=\{dokLevel\}/);
  });

  it('clamps currentStep to the available screens', () => {
    expect(orchestrator).toMatch(/safeStep\s*=\s*Math\.min/);
  });
});
