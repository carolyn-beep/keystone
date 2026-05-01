/**
 * Brainlift Central server-side brand config.
 *
 * Spec 01 only exports `ServerBrandConfig`. Prompt builders
 * (`buildBrainliftSystemPrompt`, `buildBrainliftBrainliftHeuristics`) are
 * added in Spec 03.
 */

import type { ServerBrandConfig } from './types';

export const config: ServerBrandConfig = {
  id: 'brainlift',
  productName: 'Brainlift Central',
  platformName: 'Brainlift Central',
};
