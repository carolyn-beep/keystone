/**
 * Pure step-machine logic for the onboarding wizard
 * (features/ux-redesign/onboarding-wizard). Kept framework-free so the
 * resume/advance/redirect/handoff decisions are unit-testable without JSX.
 */

export type WizardStepKey =
  | 'topic'
  | 'in-scope'
  | 'out-of-scope'
  | 'categories'
  | 'experts'
  | 'resources';

export interface WizardStep {
  id: number; // 1-indexed; mirrors brainlifts.onboarding_step
  key: WizardStepKey;
  title: string;
  /** No remaining placeholder steps — spec 05 filled Resources (the last one). */
  placeholder: boolean;
}

// 2026-06-11 amendment: the step-7 "Done" screen was removed. Resources is the
// last step; its Finish fires complete and hands off to the brainlift page,
// where the success beat shows as a modal (SetupCompleteModal). Rows persisted
// with a stale step 7 (pre-amendment) clamp back to 6 on resume.
export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 1, key: 'topic', title: 'Add Topic', placeholder: false },
  { id: 2, key: 'in-scope', title: 'In Scope', placeholder: false },
  { id: 3, key: 'out-of-scope', title: 'Out of Scope', placeholder: false },
  { id: 4, key: 'categories', title: 'Expertise Areas', placeholder: false },
  { id: 5, key: 'experts', title: 'Experts', placeholder: false },
  { id: 6, key: 'resources', title: 'Resources', placeholder: false },
] as const;

export const FIRST_STEP = WIZARD_STEPS[0].id;
export const LAST_STEP = WIZARD_STEPS[WIZARD_STEPS.length - 1].id;

/** Clamp an arbitrary step into the valid 1..6 range. */
export function clampStep(step: number): number {
  if (step < FIRST_STEP) return FIRST_STEP;
  if (step > LAST_STEP) return LAST_STEP;
  return step;
}

/**
 * Which step the wizard should land on. Fresh runs (no slug, no persisted
 * step) start at step 1; resuming a slug jumps to the persisted high-water
 * mark (clamped). While the resume row is still loading the step is undefined
 * and we hold at step 1.
 */
export function resolveActiveStep(args: {
  hasSlug: boolean;
  onboardingStep: number | null | undefined;
}): number {
  if (!args.hasSlug) return FIRST_STEP;
  if (args.onboardingStep === null || args.onboardingStep === undefined) {
    return FIRST_STEP;
  }
  return clampStep(args.onboardingStep);
}

/**
 * Whether moving to `target` should PATCH the server. Only forward moves past
 * the persisted high-water mark are written; same-step and backward
 * (edit-an-earlier-step) navigation render locally without a PATCH.
 */
export function isForwardStep(args: { target: number; highWater: number }): boolean {
  return args.target > args.highWater;
}

/**
 * `/new-project/:slug` for a brainlift whose onboarding is already finished
 * (step cleared) should bounce to the normal brainlift view. Never redirect
 * while the row is still loading.
 */
export function shouldRedirectCompleted(args: {
  loaded: boolean;
  onboardingStep: number | null | undefined;
}): boolean {
  return args.loaded && args.onboardingStep === null;
}

/**
 * Finish handoff: land on the brainlift's Second Brain tab. `setup=done` is
 * the one-shot trigger for the setup-complete modal — Dashboard shows the
 * modal once and strips the param so refresh/back doesn't re-trigger it.
 */
export function buildLandingLocation(slug: string): string {
  return `/${slug}?tab=second-brain&setup=done`;
}

/** Topic CONFIRM is enabled once the trimmed topic reaches 3 chars. */
export function canConfirmTopic(topic: string): boolean {
  return topic.trim().length >= 3;
}

/**
 * Manual expert add (step 5) requires both a name and a `where` (handle / URL /
 * affiliation); `who` / `why` / `focus` are optional. Mirrors the server's
 * `createExpertsInput` contract.
 */
export function canAddManualExpert(name: string, where: string): boolean {
  return name.trim().length > 0 && where.trim().length > 0;
}
