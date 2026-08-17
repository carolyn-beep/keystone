import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import type { ConversationContext } from '../types';
import { buildKeystoneResearchHeuristics } from '../keystone-research';

const brandNewUserContext: ChatUserContext = {
  userId: 'user-1',
  userName: 'Research Student',
  isAdmin: false,
  brainliftCount: 0,
  recentBrainlifts: [],
  recentConversations: [],
  activePlans: [],
};

const unboundConversation: ConversationContext = {
  conversationId: 12,
  brainliftId: null,
  brainlift: null,
};

function onboardingLines() {
  return buildKeystoneResearchHeuristics({
    userContext: brandNewUserContext,
    conversation: unboundConversation,
  }).join('\n');
}

describe('AlphaX research onboarding heuristic prose', () => {
  // NOTE: the brand-new onboarding heuristics were slimmed to state-aware
  // pointers — the durable introduction/tone prose now lives in the system
  // prompt's IDENTITY/TONE/OPERATIONAL POSTURE sections. These tests assert on
  // what the per-state heuristic lines actually carry for a brand-new student.
  it('describes the brand-new onboarding state with project (not brainlift) vocabulary', () => {
    const lines = onboardingLines();

    expect(lines).toContain('brand-new student, no projects yet, no conversation binding');
    // Vocabulary discipline: "projects" not "brainlifts" in the student-facing framing.
    expect(lines).not.toContain('(no brainlifts)');
    // The synthetic opener has already fired; the student is replying to it.
    expect(lines).toContain('synthetic opener has already fired');
  });

  it('offers project-idea-generator on opt-in terms', () => {
    const lines = onboardingLines();

    // Skill is offered as an opt-in for guided exploration, not force-fired.
    expect(lines).toContain("load_skill('project-idea-generator')");
    expect(lines).toContain('if they want guided exploration');
  });

  it('creates a blank project only after concrete student commitment', () => {
    const lines = onboardingLines();

    expect(lines).toContain('create_blank_project');
    expect(lines).toContain('once they commit to a concrete direction');
  });

  it('gates Second Brain saves until the conversation is bound', () => {
    const lines = onboardingLines();

    // Authoring/capture tooling is unavailable pre-binding — saves are gated.
    expect(lines).toContain('are NOT available until binding happens');
    expect(lines).toContain('`save_source`, `save_note`, `create_category`');
  });
});
