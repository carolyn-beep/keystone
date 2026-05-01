/**
 * Server brand selector.
 *
 * Reads `process.env.BRAND` at module top level and throws on missing /
 * unknown values. The throw fires before any consumer can read an undefined
 * brand, and (when imported from `server/index.ts`) before the HTTP server
 * starts accepting requests.
 *
 * Spec 01 has no live consumer of this module; spec 03 adds the dispatcher
 * in `server/ai/chat/system-prompt.ts` that reads `brandId`.
 */

import { config as alphaxConfig } from './alphax';
import { config as brainliftConfig } from './brainlift';
import type { BrandId, ServerBrandConfig } from './types';

const id = process.env.BRAND;

if (id !== 'alphax' && id !== 'brainlift') {
  throw new Error(
    `[brand] BRAND must be 'alphax' or 'brainlift'; got: ${JSON.stringify(id)}. `
      + 'Set BRAND in your .env / Render env vars.'
  );
}

export const brandId: BrandId = id;

export const config: ServerBrandConfig = id === 'alphax' ? alphaxConfig : brainliftConfig;

export type { BrandId, ServerBrandConfig, BrandPromptBuilders } from './types';
