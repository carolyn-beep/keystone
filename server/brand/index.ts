/**
 * Server brand selector.
 *
 * Reads `process.env.BRAND` at module top level and throws on missing /
 * unknown values. The throw fires before any consumer can read an undefined
 * brand, and (when imported from `server/index.ts`) before the HTTP server
 * starts accepting requests.
 *
 * Spec 03 wires up `promptBuilders` -- the dispatcher in
 * `server/ai/chat/system-prompt.ts` reads this module and delegates to the
 * matching brand's prompt builder.
 */

import {
  config as alphaxConfig,
  promptBuilders as alphaxPromptBuilders,
} from './alphax';
import {
  alphaxResearchPromptBuilders,
} from './alphax-research';
import {
  config as brainliftConfig,
  promptBuilders as brainliftPromptBuilders,
} from './brainlift';
import type { BrandId, BrandPromptBuilders, ChatMode, ServerBrandConfig } from './types';

const id = process.env.BRAND;

if (id !== 'alphax' && id !== 'brainlift') {
  throw new Error(
    `[brand] BRAND must be 'alphax' or 'brainlift'; got: ${JSON.stringify(id)}. `
      + 'Set BRAND in your .env / Render env vars.'
  );
}

export const brandId: BrandId = id;

export const config: ServerBrandConfig = id === 'alphax' ? alphaxConfig : brainliftConfig;

export const promptBuilders: BrandPromptBuilders =
  id === 'alphax' ? alphaxPromptBuilders : brainliftPromptBuilders;

export function getPromptBuilders(mode: ChatMode): BrandPromptBuilders {
  if (id === 'alphax') {
    return mode === 'research' ? alphaxResearchPromptBuilders : alphaxPromptBuilders;
  }

  return brainliftPromptBuilders;
}

export type {
  BrandId,
  BrandPromptBuilders,
  ChatMode,
  ConversationContext,
  ServerBrandConfig,
} from './types';
