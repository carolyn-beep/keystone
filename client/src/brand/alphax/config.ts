/**
 * Keystone (student) brand configuration.
 *
 * Consumers read these display strings from here instead of hardcoding them.
 * `id` remains the internal `alphax` selector pending the brand-selector rename.
 */

import type { BrandConfig } from '../types';

export const config: BrandConfig = {
  id: 'alphax',
  productName: 'Keystone',
  tagline: 'Bring the idea. Ship the business.',
  loginEyebrow: 'Your Keystone in-app coach',
  loginHeading: 'Welcome back',
  loginTitle: "Let’s get back to building",
  loginSubheading:
    "Sign in to keep building the body of work you’re graduating with.",
  chatPlaceholder:
    'Ask about grading, curation, sprint execution, or the brainlifts in your workspace.',
  metaDescription:
    'Keystone: your in-app coach for building deep, defensible knowledge — brainlift building, sprint execution, and grading guidance.',
  // No login plate caption (Alpha's "Plate I. / Builds at night" removed); null omits it, matching Keystone Central.
  loginPlateCaption: null,
  chatOpenerInstruction:
    'The user just landed on the Keystone chat homepage with a fresh empty conversation. '
    + 'Open per your system prompt. The User Context block is your ground truth for who they are.',
  // The barrel (index.ts) augments this with the relaxed-mascot component; the
  // plain config object can't import the asset without coupling to a bundler.
  wizardPersona: { name: 'Keystone' },
};
