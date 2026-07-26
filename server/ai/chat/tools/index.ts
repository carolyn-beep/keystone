import type { AuthContext } from '@shared/schema';
import { brandId } from '../../../brand';
import type { ChatMode, ConversationContext } from '../../../brand/types';
import { buildAskUserQuestionTool } from './ask-user';
import { buildChatCurationTools } from './curation';
import { buildChatGradingTools } from './grading';
import { buildAdminSkillManagementTools, buildChatSkillTools } from './load-skill';
import {
  buildResearchOnlyProjectChatTools,
  buildSharedProjectChatTools,
} from './project';
import { buildResearchChatTools } from './research';
import { buildResearchStreamChatTools } from './research-stream';
import { buildSecondBrainChatTools } from './second-brain';
import { buildSprintChatTools } from './sprint';

export function buildNativeChatTools(
  authContext: AuthContext,
  mode: ChatMode,
  conversation: ConversationContext,
) {
  const gradingTools = buildChatGradingTools(authContext.userId);
  const isResearch = mode === 'research';
  const isAuthoring = mode === 'authoring';
  const researchBrainliftTools = {
    list_brainlifts: gradingTools.list_brainlifts,
  };

  // `propose_research_run` is Keystone-only (FEATURE.md D13: Brainlift Central
  // has no chat changes). It also requires a bound brainlift because the tool
  // execute checks `hasResearchJobPending(brainliftId)`; without a brainlift
  // there's nothing for the agent to propose a swarm against, so we skip it.
  const isKeystone = brandId === 'alphax';
  const researchStreamTools =
    isKeystone && conversation.brainliftId != null
      ? buildResearchStreamChatTools({ brainliftId: conversation.brainliftId })
      : {};

  return {
    ...buildChatSkillTools({ authContext }),
    ...(authContext.isAdmin ? buildAdminSkillManagementTools({ authContext }) : {}),
    ...buildResearchChatTools(),
    ...buildAskUserQuestionTool(),
    ...(isResearch ? researchBrainliftTools : gradingTools),
    ...buildSharedProjectChatTools(authContext, conversation),
    ...(isResearch ? buildResearchOnlyProjectChatTools(authContext, conversation) : {}),
    ...buildSecondBrainChatTools(authContext, conversation),
    ...(isAuthoring ? buildChatCurationTools(authContext) : {}),
    ...(isAuthoring ? buildSprintChatTools({ authContext }) : {}),
    ...researchStreamTools,
  };
}
