/**
 * Keystone (student) brand configuration.
 *
 * Consumers read these display strings from here instead of hardcoding them.
 * `id` remains the internal `keystone` selector pending the brand-selector rename.
 */

import type { BrandConfig } from '../types';

export const config: BrandConfig = {
  id: 'keystone',
  productName: 'Keystone',
  // Login copy intentionally empty: the login page renders the wordmark and
  // illustration alone. Login.tsx skips each of these when blank.
  tagline: '',
  loginEyebrow: '',
  loginHeading: '',
  loginTitle: '',
  loginSubheading: '',
  chatPlaceholder:
    'Ask about grading, curation, sprint execution, or the documents in your workspace.',
  metaDescription:
    'Keystone: an AI learning platform that turns learners into experts by making them do the thinking.',
  // No login plate caption; null omits it, matching Keystone Central.
  loginPlateCaption: null,
  chatOpenerInstruction:
    'The user just landed on the Keystone chat homepage with a fresh empty conversation. '
    + 'Open per your system prompt. The User Context block is your ground truth for who they are.',
  // The barrel (index.ts) augments this with the relaxed-mascot component; the
  // plain config object can't import the asset without coupling to a bundler.
  wizardPersona: { name: 'Keystone' },
};
