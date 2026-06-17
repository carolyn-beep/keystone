/**
 * Tests for 06-expert-discovery FR4: ExpertsStep UI + useExpertDiscovery hook.
 *
 * The client test environment is `node` and only loads `.test.ts` (no JSX
 * render). Per the spec 03/04 convention we verify (a) pure helpers directly
 * and (b) component/hook wiring via source-pattern assertions. These confirm
 * the behaviour the FR4 success criteria require without a DOM renderer.
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canAddManualExpert } from '../wizard-machine';

function read(rel: string): string {
  return fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const stepSource = read('../ExpertsStep.tsx');
const hookSource = read('../../../hooks/useExpertDiscovery.ts');
const wizardSource = read('../../../pages/OnboardingWizard.tsx');
const machineSource = read('../wizard-machine.ts');

// ─── Pure helper: manual-add gating ───────────────────────────────────────────

describe('FR4: canAddManualExpert (manual-add gate)', () => {
  it('requires both name and where (non-empty, trimmed)', () => {
    expect(canAddManualExpert('Jane', '@jane')).toBe(true);
    expect(canAddManualExpert('  Jane  ', '  @jane  ')).toBe(true);
  });

  it('blocks when name is empty/whitespace', () => {
    expect(canAddManualExpert('', '@jane')).toBe(false);
    expect(canAddManualExpert('   ', '@jane')).toBe(false);
  });

  it('blocks when where is empty/whitespace', () => {
    expect(canAddManualExpert('Jane', '')).toBe(false);
    expect(canAddManualExpert('Jane', '   ')).toBe(false);
  });
});

// ─── useExpertDiscovery hook wiring ───────────────────────────────────────────

describe('FR4: useExpertDiscovery hook', () => {
  it('keys the discovery query per slug and is gated by enabled', () => {
    expect(hookSource).toMatch(/['"]onboarding-expert-discovery['"]/);
    expect(hookSource).toMatch(/enabled/);
  });

  it('does not retry and treats the result as fresh for the session', () => {
    expect(hookSource).toMatch(/retry:\s*false/);
    expect(hookSource).toMatch(/staleTime:\s*Infinity/);
  });

  it('POSTs the discovery + create endpoints', () => {
    expect(hookSource).toMatch(/\/onboarding\/expert-discovery/);
    expect(hookSource).toMatch(/\/experts/);
  });

  it('invalidates the brainlift query after a successful accept', () => {
    expect(hookSource).toMatch(/invalidateQueries/);
    expect(hookSource).toMatch(/['"]brainlift['"]/);
  });
});

// ─── ExpertsStep component wiring ─────────────────────────────────────────────

describe('FR4: ExpertsStep matches the screen4 restyle', () => {
  it('renders the "Add experts" header and the "Add 3-5 / do this later" intro copy', () => {
    expect(stepSource).toMatch(/Add experts/);
    expect(stepSource).toMatch(/Add 3\s*-?\s*5 experts/);
    expect(stepSource).toMatch(/later/);
  });

  it('renders an Add/Added affordance and a Dismiss affordance per candidate', () => {
    expect(stepSource).toMatch(/Added/);
    expect(stepSource).toMatch(/Add\b/);
    expect(stepSource).toMatch(/Dismiss/i);
  });

  it('opens evidence links in a new tab', () => {
    expect(stepSource).toMatch(/target=['"]_blank['"]/);
    expect(stepSource).toMatch(/evidenceUrls/);
  });

  it('gates the manual-add form on canAddManualExpert', () => {
    expect(stepSource).toMatch(/canAddManualExpert/);
  });

  it('keeps the CONFIRM / continue control always enabled (skip is first-class)', () => {
    expect(stepSource).toMatch(/CONFIRM|Confirm/);
    expect(stepSource).toMatch(/onNext/);
    // The continue control must NOT be disabled by loading / candidate state.
    expect(stepSource).not.toMatch(/disabled=\{[^}]*isLoading/);
  });

  it('shows a loading presentation while discovery is in flight', () => {
    expect(stepSource).toMatch(/isLoading|isPending|isFetching/);
  });

  it('does not import or revive the native authoring builder (anti-pattern)', () => {
    expect(stepSource).not.toMatch(/suggest-experts/);
    expect(stepSource).not.toMatch(/brainlift-builder/);
  });
});

// ─── Wizard wiring ────────────────────────────────────────────────────────────

describe('FR4: OnboardingWizard wires ExpertsStep at step 5', () => {
  it('imports and renders ExpertsStep', () => {
    expect(wizardSource).toMatch(/import\s*\{\s*ExpertsStep\s*\}/);
    expect(wizardSource).toMatch(/<ExpertsStep/);
  });

  it("dispatches the 'experts' step key to ExpertsStep, not PlaceholderStep", () => {
    expect(wizardSource).toMatch(/['"]experts['"]/);
  });

  it("flips the experts step out of placeholder state in the machine", () => {
    expect(machineSource).toMatch(/key:\s*['"]experts['"][^}]*placeholder:\s*false/);
  });
});
