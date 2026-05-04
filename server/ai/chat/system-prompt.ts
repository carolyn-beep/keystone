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

import { promptBuilders } from '../../brand';
import type { ChatUserContext } from '../../storage/base';
import {
  getDefaultChatSkillRegistry,
  type SkillRegistry,
  type SkillSummary,
} from './skills';

export interface BuildChatSystemPromptArgs {
  userContext: ChatUserContext;
  skills: SkillSummary[];
}

export interface BuildChatSystemPromptFromRegistryArgs {
  userContext: ChatUserContext;
  skillRegistry?: SkillRegistry;
}

export function buildChatSystemPrompt(args: BuildChatSystemPromptArgs): string {
  return promptBuilders.buildSystemPrompt(args);
}

export async function buildChatSystemPromptFromRegistry(
  args: BuildChatSystemPromptFromRegistryArgs,
): Promise<string> {
  const skillRegistry = args.skillRegistry ?? getDefaultChatSkillRegistry();
  const skills = await skillRegistry.listSkills();

  return buildChatSystemPrompt({
    userContext: args.userContext,
    skills,
  });
}
