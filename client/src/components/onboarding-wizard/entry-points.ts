/**
 * Pure routing/decision helpers for the onboarding wizard entry points
 * (features/ux-redesign/onboarding-wizard FR5): the Home CTA target, library
 * card resume routing, and the zero-project auto-open decision.
 */

export const NEW_PROJECT_ROUTE = '/new-project';

/**
 * Where a library card should link. Mid-onboarding projects
 * (`onboardingStep != null`) resume into the wizard; finished projects open
 * the grading view exactly as today (preserving the admin param).
 */
export function buildCardHref(args: {
  slug: string;
  onboardingStep: number | null | undefined;
  adminView?: boolean;
}): string {
  if (args.onboardingStep != null) {
    // The wizard has no admin view; resume straight into it.
    return `${NEW_PROJECT_ROUTE}/${args.slug}`;
  }
  return `/grading/${args.slug}${args.adminView ? '?admin=true' : ''}`;
}

/**
 * Whether the post-login landing should auto-open the wizard. Fires only on a
 * confirmed zero count (query resolved successfully with no projects); never
 * while loading or erroring, and never for users who already have projects.
 */
export function shouldAutoOpenWizard(args: {
  status: 'pending' | 'error' | 'success';
  count: number;
}): boolean {
  return args.status === 'success' && args.count === 0;
}
