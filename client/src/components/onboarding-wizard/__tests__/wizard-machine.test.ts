/**
 * Tests for 03-wizard-shell FR2-FR4: wizard step-machine pure logic.
 *
 * The step machine, resume jump, completed-redirect decision, landing
 * handoff target, and Topic confirm-enablement are extracted into pure
 * helpers so they can be tested in the node vitest environment (no JSX).
 */
import { describe, it, expect } from 'vitest';
import {
  WIZARD_STEPS,
  FIRST_STEP,
  LAST_STEP,
  clampStep,
  resolveActiveStep,
  isForwardStep,
  shouldRedirectCompleted,
  buildLandingLocation,
  canConfirmTopic,
} from '../wizard-machine';

describe('FR2: wizard step constants', () => {
  // 2026-06-11 amendment: the step-7 Done screen was removed — Resources is
  // the last step and the success beat moved to the SetupCompleteModal on the
  // landing page.
  it('has exactly 6 ordered steps Topic..Resources (no Done step)', () => {
    expect(WIZARD_STEPS).toHaveLength(6);
    expect(WIZARD_STEPS[0].id).toBe(1);
    expect(WIZARD_STEPS[0].key).toBe('topic');
    expect(WIZARD_STEPS[5].id).toBe(6);
    expect(WIZARD_STEPS[5].key).toBe('resources');
  });

  it('exposes first/last step bounds', () => {
    expect(FIRST_STEP).toBe(1);
    expect(LAST_STEP).toBe(6);
  });

  it('has no remaining placeholder steps (spec 05 filled Resources, the last one)', () => {
    const placeholders = WIZARD_STEPS.filter((s) => s.placeholder).map((s) => s.id);
    expect(placeholders).toEqual([]);
  });
});

describe('FR2: clampStep', () => {
  it('clamps below the floor to FIRST_STEP', () => {
    expect(clampStep(0)).toBe(1);
    expect(clampStep(-5)).toBe(1);
  });
  it('clamps above the ceiling to LAST_STEP', () => {
    expect(clampStep(99)).toBe(6);
  });

  it('clamps a stale persisted step 7 (pre-amendment Done rows) to 6', () => {
    expect(clampStep(7)).toBe(6);
  });
  it('passes valid steps through', () => {
    expect(clampStep(4)).toBe(4);
  });
});

describe('FR2: resolveActiveStep (resume jump)', () => {
  it('starts at step 1 when there is no slug / no persisted step', () => {
    expect(resolveActiveStep({ hasSlug: false, onboardingStep: undefined })).toBe(1);
  });

  it('jumps to the persisted onboardingStep when resuming a slug', () => {
    expect(resolveActiveStep({ hasSlug: true, onboardingStep: 4 })).toBe(4);
  });

  it('clamps an out-of-range persisted step', () => {
    expect(resolveActiveStep({ hasSlug: true, onboardingStep: 42 })).toBe(6);
  });

  it('falls back to step 1 while the resume row is still loading (step undefined)', () => {
    expect(resolveActiveStep({ hasSlug: true, onboardingStep: undefined })).toBe(1);
  });
});

describe('FR2: isForwardStep (PATCH only past high-water mark)', () => {
  it('returns true when advancing past the persisted step', () => {
    expect(isForwardStep({ target: 3, highWater: 2 })).toBe(true);
  });
  it('returns false for the same step (no PATCH)', () => {
    expect(isForwardStep({ target: 2, highWater: 2 })).toBe(false);
  });
  it('returns false for backward navigation (no regression PATCH)', () => {
    expect(isForwardStep({ target: 1, highWater: 4 })).toBe(false);
  });
});

describe('FR2: shouldRedirectCompleted (/new-project/:slug with onboardingStep null)', () => {
  it('redirects to /:slug when the loaded brainlift is already complete', () => {
    expect(shouldRedirectCompleted({ loaded: true, onboardingStep: null })).toBe(true);
  });
  it('does not redirect while still loading', () => {
    expect(shouldRedirectCompleted({ loaded: false, onboardingStep: null })).toBe(false);
  });
  it('does not redirect an in-progress onboarding', () => {
    expect(shouldRedirectCompleted({ loaded: true, onboardingStep: 3 })).toBe(false);
  });
});

describe('FR4: buildLandingLocation (Finish handoff)', () => {
  it('targets the Second Brain tab with the one-shot setup-complete modal trigger', () => {
    expect(buildLandingLocation('marine-biology')).toBe(
      '/marine-biology?tab=second-brain&setup=done',
    );
  });
});

describe('FR3: canConfirmTopic', () => {
  it('is false until the trimmed topic is >= 3 chars', () => {
    expect(canConfirmTopic('')).toBe(false);
    expect(canConfirmTopic('  ')).toBe(false);
    expect(canConfirmTopic('ab')).toBe(false);
    expect(canConfirmTopic(' ab ')).toBe(false);
  });
  it('is true once the trimmed topic reaches 3 chars', () => {
    expect(canConfirmTopic('Bio')).toBe(true);
    expect(canConfirmTopic('  Marine Biology  ')).toBe(true);
  });
});
