import type { AuthContext } from '@shared/schema';
import { buildAskUserQuestionTool } from './ask-user';
import { buildChatCurationTools } from './curation';
import { buildChatGradingTools } from './grading';
import { buildChatSkillTools } from './load-skill';
import { buildResearchChatTools } from './research';
import { buildSprintChatTools } from './sprint';

export function buildNativeChatTools(authContext: AuthContext) {
  return {
    ...buildChatGradingTools(authContext.userId),
    ...buildChatSkillTools(),
    ...buildResearchChatTools(),
    ...buildChatCurationTools(authContext),
    ...buildSprintChatTools({ authContext }),
    ...buildAskUserQuestionTool(),
  };
}
