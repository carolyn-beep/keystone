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
  config as keystoneConfig,
  promptBuilders as keystonePromptBuilders,
} from './keystone';
import {
  keystoneResearchPromptBuilders,
} from './keystone-research';
import {
  config as brainliftConfig,
  promptBuilders as brainliftPromptBuilders,
} from './brainlift';
import type { BrandId, BrandPromptBuilders, ChatMode, ServerBrandConfig } from './types';

const id = process.env.BRAND;

if (id !== 'keystone' && id !== 'brainlift') {
  throw new Error(
    `[brand] BRAND must be 'keystone' or 'brainlift'; got: ${JSON.stringify(id)}. `
      + 'Set BRAND in your .env / Render env vars.'
  );
}

export const brandId: BrandId = id;

export const config: ServerBrandConfig = id === 'keystone' ? keystoneConfig : brainliftConfig;

export const promptBuilders: BrandPromptBuilders =
  id === 'keystone' ? keystonePromptBuilders : brainliftPromptBuilders;

export function getPromptBuilders(mode: ChatMode): BrandPromptBuilders {
  if (id === 'keystone') {
    return mode === 'research' ? keystoneResearchPromptBuilders : keystonePromptBuilders;
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
