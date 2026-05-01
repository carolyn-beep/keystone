/**
 * AlphaX server-side brand config.
 *
 * Spec 01 only exports `ServerBrandConfig`. Prompt builders
 * (`buildAlphaXSystemPrompt`, `buildAlphaXBrainliftHeuristics`) are added in
 * Spec 03 alongside the dispatcher in `server/ai/chat/system-prompt.ts`.
 */

import type { ServerBrandConfig } from './types';

export const config: ServerBrandConfig = {
  id: 'alphax',
  productName: 'AlphaX Buddy',
  platformName: 'Brainlift Central',
};
