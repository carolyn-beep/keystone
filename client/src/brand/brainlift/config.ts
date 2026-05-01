/**
 * Brainlift Central brand configuration.
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
  productName: 'Brainlift Central',
  tagline: 'A grading and verification engine for adult researchers.',
  loginEyebrow: 'A peer-research workspace',
  loginHeading: 'Welcome back',
  loginTitle: 'Sign in to keep working',
  loginSubheading:
    'Pick up where you left off across your brainlifts, drafts, and reviews.',
  chatPlaceholder:
    'Ask the assistant to draft, analyse, extract, or grade. Engagement is enforced downstream.',
  metaDescription:
    'Brainlift Central: a grading and verification workspace for adult researchers and professionals.',
  loginPlateCaption: null,
  chatOpenerInstruction:
    'This is the user landing on the chat homepage. Greet them as a capable peer-research '
    + 'assistant: introduce yourself briefly as Brainlift Central, then meet them where they '
    + 'are. Use the User Context block (brainlift count, recent brainlifts, recent '
    + 'conversations, and `activePlans`) to tailor the opener. Returning users with active '
    + 'work get a focused, no-fluff continuation prompt grounded in their current work; new '
    + 'users get a short, candid capability preview. Keep the tone neutral and adult; do not '
    + 'use coaching or pedagogical-gatekeeping language.',
};
