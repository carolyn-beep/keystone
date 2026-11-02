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

// The wizard is never auto-opened. A zero-project user lands in chat, where the
// opener offers to start a first document; the guided setup is reached from
// Projects → New Document or the New Document link in the section nav, and it
// can be left at any step with "Skip for now".
