/**
 * Keystone Central brand configuration.
 *
 * Spec 01 ships this with concrete (not TBD) strings so the type contract is
 * fully satisfied and the module type-checks. Final copy is a Spec 02 design
 * pass; the strings here are intentionally neutral peer-researcher tone.
 *
 * Note: `loginPlateCaption` is null because BC's login plate has no
 * frontispiece-style caption (square plate, no Plate-I treatment).
 */

import type { BrandConfig } from '../types';

export const config: BrandConfig = {
  id: 'brainlift',
  productName: 'Keystone Central',
  tagline: 'Build knowledge',
  taglineEmphasis: "that's actually yours",
  loginEyebrow: 'A peer-research workspace',
  loginHeading: 'Welcome back',
  loginTitle: 'Sign in to your workspace',
  loginSubheading:
    'Pick up where you left off across your brainlifts, drafts, and reviews.',
  chatPlaceholder:
    'Ask the assistant to draft, analyse, extract, or grade. Engagement is enforced downstream.',
  metaDescription:
    'Keystone Central: a grading and verification workspace for adult researchers and professionals.',
  loginPlateCaption: null,
  chatOpenerInstruction:
    'This is the user landing on the chat homepage. Greet them as a capable peer-research '
    + 'assistant: introduce yourself briefly as Keystone Central, then meet them where they '
    + 'are. Use the User Context block (brainlift count, recent brainlifts, recent '
    + 'conversations) to tailor the opener. Returning users with active work get a focused, '
    + 'no-fluff continuation prompt grounded in their current work; new users get a short, '
    + 'candid capability preview. If the user has at least one brainlift, land the proactive '
    + '`web_search_exa` offer here per the PROACTIVE RESEARCH OFFER section of the system '
    + 'prompt. Keep the tone neutral and adult.',
  // Plain label, no character — Keystone Central's wizard rail.
  wizardPersona: { name: 'Brainlift Assistant' },
};
