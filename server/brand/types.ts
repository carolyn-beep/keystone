/**
 * Server-side brand-module type contracts.
 *
 * Spec 03 tightens `BrandPromptBuilders` from the Spec 01 forward-declared
 * placeholder to the concrete shape: typed against `ChatUserContext` and
 * `SkillSummary`, plus a `formatUserContext` slot since AlphaX renders a
 * sprint-plans block that BC omits.
 */

import type { Brainlift, ChatUserContext } from '../storage/base';
import type { SkillSummary } from '../ai/chat/skills';

export type BrandId = 'alphax' | 'brainlift';

export interface ServerBrandConfig {
  id: BrandId;
  /** Product name (e.g. "AlphaX Buddy" or "Brainlift Central"). */
  productName: string;
  /** Platform name -- identical for both brands today. */
  platformName: string;
}

export type ChatMode = 'research' | 'authoring';

export interface ConversationContext {
  conversationId: number;
  brainliftId: number | null;
  brainlift: Brainlift | null;
}

export interface BuildSystemPromptArgs {
  userContext: ChatUserContext;
  skills: SkillSummary[];
  mode: ChatMode;
  conversation: ConversationContext;
}

export interface BrandPromptBuilders {
  buildSystemPrompt: (args: BuildSystemPromptArgs) => string;
  buildBrainliftHeuristics: (args: {
    userContext: ChatUserContext;
    conversation: ConversationContext;
  }) => string[];
  formatUserContext: (userContext: ChatUserContext) => string[];
}
