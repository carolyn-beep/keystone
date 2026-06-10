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
  | 'resources'
  | 'done';

export interface WizardStep {
  id: number; // 1-indexed; mirrors brainlifts.onboarding_step
  key: WizardStepKey;
  title: string;
  /** Steps 5-6 remain placeholder slots filled by specs 05-06. */
  placeholder: boolean;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 1, key: 'topic', title: 'Add Topic', placeholder: false },
  { id: 2, key: 'in-scope', title: 'In Scope', placeholder: false },
  { id: 3, key: 'out-of-scope', title: 'Out of Scope', placeholder: false },
  { id: 4, key: 'categories', title: 'Categories', placeholder: false },
  { id: 5, key: 'experts', title: 'Experts', placeholder: true },
  { id: 6, key: 'resources', title: 'Resources', placeholder: true },
  { id: 7, key: 'done', title: 'Done', placeholder: false },
] as const;

export const FIRST_STEP = WIZARD_STEPS[0].id;
export const LAST_STEP = WIZARD_STEPS[WIZARD_STEPS.length - 1].id;

/** Clamp an arbitrary step into the valid 1..7 range. */
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

/** Done-step handoff: land on the brainlift's Second Brain tab. */
export function buildLandingLocation(slug: string): string {
  return `/${slug}?tab=second-brain`;
}

/** Topic CONFIRM is enabled once the trimmed topic reaches 3 chars. */
export function canConfirmTopic(topic: string): boolean {
  return topic.trim().length >= 3;
}
