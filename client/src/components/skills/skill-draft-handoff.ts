/**
 * Hand a chat skill draft to the Skill editor.
 *
 * The draft card in chat stashes the draft in sessionStorage and navigates to
 * `/skills?view=create&from=chat`; the Skills page consumes it once on mount
 * and opens the editor prefilled. Same mechanism as the research-stream
 * proposal handoff.
 */

import { skillDraftSchema, type SkillDraft } from '@shared/chat-skill-draft';

const STORAGE_KEY = 'skills:draft-handoff';
export const SKILL_DRAFT_HANDOFF_PARAM = 'from';
export const SKILL_DRAFT_HANDOFF_VALUE = 'chat';

/** Opening message for the Skills page "Draft with Chat" button. */
export const SKILL_DRAFT_CHAT_PROMPT =
  'I want to draft a new skill. Load the create-skill skill first, then interview me about what the skill should do, when it should fire and what it produces, and show me the first draft on a card.';

export function buildSkillDraftEditorUrl(): string {
  return `/skills?view=create&${SKILL_DRAFT_HANDOFF_PARAM}=${SKILL_DRAFT_HANDOFF_VALUE}`;
}

export function buildSkillDraftChatUrl(): string {
  return `/?ask=${encodeURIComponent(SKILL_DRAFT_CHAT_PROMPT)}`;
}

export function stashSkillDraftHandoff(draft: SkillDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or blocked storage: the editor simply opens empty.
  }
}

export function consumeSkillDraftHandoff(): SkillDraft | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return skillDraftSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
