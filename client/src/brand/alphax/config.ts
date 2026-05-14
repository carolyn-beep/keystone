/**
 * AlphaX brand configuration.
 *
 * Strings are taken verbatim from the current Login page / AppSidebar /
 * `native-chat-thread-config.tsx`. AlphaX is byte-identical after Spec 01;
 * Spec 02 wires consumers to read these strings from here instead of
 * hardcoding them.
 */

import type { BrandConfig } from '../types';

export const config: BrandConfig = {
  id: 'alphax',
  productName: 'AlphaX Buddy',
  tagline: 'Bring the idea. Ship the business.',
  loginEyebrow: 'Your AlphaX in-app coach',
  loginHeading: 'Welcome back',
  loginTitle: "Let’s get back to building",
  loginSubheading:
    "Sign in to keep building the business you’re graduating with.",
  chatPlaceholder:
    'Ask about grading, curation, sprint execution, or the brainlifts in your workspace.',
  metaDescription:
    'AlphaX Buddy: your in-app coach for AlphaX High School. Brainlift building, sprint execution, and grading guidance.',
  loginPlateCaption: {
    numeral: 'Plate I.',
    title: 'Builds at night',
  },
  chatOpenerInstruction:
    'The user just landed on the AlphaX chat homepage with a fresh empty conversation. '
    + 'Open per your system prompt. The User Context block is your ground truth for who they are.',
};
