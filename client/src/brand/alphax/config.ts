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
    'This is the user landing on the chat homepage. Open the conversation by '
    + 'briefly introducing yourself as AlphaX Buddy, then meet the student exactly where they '
    + 'are in their AlphaX journey. Follow the brainlift heuristics in your system prompt and '
    + 'use the User Context block (brainlift count, recent brainlifts, recent conversations, '
    + 'and `activePlans` -- every active sprint plan across ALL brainlifts with today/overdue '
    + 'tasks) to tailor the opener. If `activePlans` shows pending work, lead with that. '
    + 'Newcomers with no brainlifts get the capability preview; returning students get a '
    + 'personalized intro grounded in their brainlift, plan, and current tasks -- straight from '
    + 'the User Context, no extra tool calls needed for the opener. Do not give a generic '
    + 'platform pitch to a returning student.',
};
