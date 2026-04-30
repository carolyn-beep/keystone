import { tool } from 'ai';
import { z } from 'zod';
import {
  getDefaultChatSkillRegistry,
  type SkillRegistry,
} from '../skills';

export interface BuildChatSkillToolsArgs {
  skillRegistry?: SkillRegistry;
}

export function buildChatSkillTools(
  args: BuildChatSkillToolsArgs = {},
) {
  const skillRegistry = args.skillRegistry ?? getDefaultChatSkillRegistry();

  return {
    load_skill: tool({
      description: 'Load one repo-local skill by name when you need detailed workflow guidance.',
      inputSchema: z.object({
        name: z.string().trim().min(1).describe('The skill name from the available repo skill list'),
      }),
      execute: async ({ name }) => skillRegistry.loadSkill(name),
    }),
  };
}
