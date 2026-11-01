import type { AuthContext } from '@shared/schema';
import type { SkillDraft } from '@shared/chat-skill-draft';
import type { SkillQualityReview } from '@shared/chat-skill-review';
import { listKnownChatToolNames } from '../chat/tools/known-tool-names';
import { storage } from '../../storage';
import { reviewSkillDraft } from './review-skill-draft';

/**
 * Default wiring for a skill quality review: the catalogue this user can see
 * (so the trigger test competes against real skills) and the tool names the
 * runtime exposes. Shared by the REST endpoint and the review_skill_draft tool.
 */
export async function runSkillDraftReview(authContext: AuthContext, draft: SkillDraft): Promise<SkillQualityReview> {
  const skills = await storage.listSkillsForUser(authContext, { includeDisabled: true });
  return reviewSkillDraft({
    draft,
    catalogue: skills.map((skill) => ({ name: skill.name, description: skill.description })),
    knownToolNames: listKnownChatToolNames(authContext),
  });
}
