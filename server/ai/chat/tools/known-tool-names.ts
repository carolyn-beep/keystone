import type { AuthContext } from '@shared/schema';
import { buildNativeChatTools } from './index';

/**
 * Every tool name the chat runtime can expose to this user, across both chat
 * modes. Used by the skill quality review to catch procedures that lean on a
 * tool that does not exist. Builders only construct tool definitions, so this
 * performs no I/O; the placeholder conversation gets a bound document id so
 * document-scoped tools (propose_research_run) are counted too.
 */
export function listKnownChatToolNames(authContext: AuthContext): string[] {
  const conversation = { conversationId: 0, brainliftId: 0, brainlift: null };
  const names = new Set<string>([
    ...Object.keys(buildNativeChatTools(authContext, 'authoring', conversation)),
    ...Object.keys(buildNativeChatTools(authContext, 'research', conversation)),
  ]);
  return Array.from(names).sort();
}
