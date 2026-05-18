/**
 * Brand-aware chat system-prompt dispatcher.
 *
 * Spec 03 reduced this file to a thin dispatcher. Per-brand prompt prose
 * lives in `server/brand/{alphax,brainlift}.ts`; shared formatters and
 * transferable prose blocks live in `server/brand/shared/prompt-helpers.ts`.
 *
 * The exported function names (`buildChatSystemPrompt`,
 * `buildChatSystemPromptFromRegistry`) are unchanged so that
 * `server/routes/chat.ts` (and its test mocks) continue to work without
 * modification.
 */

import { getPromptBuilders } from '../../brand';
import type { ChatUserContext } from '../../storage/base';
import type { AuthContext } from '@shared/schema';
import type { ChatMode, ConversationContext } from '../../brand/types';
import {
  getDefaultChatSkillRegistry,
  type SkillRegistry,
  type SkillSummary,
} from './skills';

export interface BuildChatSystemPromptArgs {
  userContext: ChatUserContext;
  skills: SkillSummary[];
  mode: ChatMode;
  conversation: ConversationContext;
}

export interface BuildChatSystemPromptFromRegistryArgs {
  userContext: ChatUserContext;
  authContext: AuthContext;
  mode: ChatMode;
  conversation: ConversationContext;
  skillRegistry?: SkillRegistry;
}

export function buildChatSystemPrompt(args: BuildChatSystemPromptArgs): string {
  return getPromptBuilders(args.mode).buildSystemPrompt(args);
}

export async function buildChatSystemPromptFromRegistry(
  args: BuildChatSystemPromptFromRegistryArgs,
): Promise<string> {
  const skillRegistry = args.skillRegistry ?? getDefaultChatSkillRegistry();
  const skills = await skillRegistry.listSkills(args.authContext);

  return buildChatSystemPrompt({
    userContext: args.userContext,
    skills,
    mode: args.mode,
    conversation: args.conversation,
  });
}
