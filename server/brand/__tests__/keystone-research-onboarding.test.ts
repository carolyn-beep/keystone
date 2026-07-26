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
  it('frames the opener as a real introduction, not a brochure or a word-capped form', () => {
    const lines = onboardingLines();

    expect(lines).toContain('brand new: no projects yet, no conversation binding');
    // Vocabulary discipline: "projects" not "brainlifts" in the student-facing framing.
    expect(lines).not.toContain('(no brainlifts)');
    // Length is explicitly not the lever; template-style recitation is the problem.
    expect(lines).toContain('length is not the issue, template-style recitation is');
    expect(lines).toContain('SPEAK the introduction, do not recite it');
    // The opener has to plant the rambling/listening stance, not just describe it.
    expect(lines).toContain('think out loud');
    expect(lines).toContain('ramble');
    expect(lines).toContain('Loose-and-unsure is welcome');
    expect(lines).toContain('honest curiosity is the only ticket');
    // The student-facing arc still gets named in the introduction.
    expect(lines).toContain('becoming an expert in the field their project will live in');
    expect(lines).toContain('a brainlift they can defend');
  });

  it('offers project-idea-generator on opt-in terms and names the fallback questions', () => {
    const lines = onboardingLines();

    // Skill is introduced by description before being fired, not just dropped on a "vague" answer.
    expect(lines).toContain('skill that walks through finding a direction worth investing in');
    expect(lines).toContain("load_skill('project-idea-generator')");
    expect(lines).toContain('what problem domain interests them');
    expect(lines).toContain('what kind of impact they want to have');
    expect(lines).toContain("what they've already explored");
  });

  it('creates a blank project only after concrete student commitment, then yields to the student pace', () => {
    const lines = onboardingLines();

    expect(lines).toContain('Once the student commits to a concrete domain');
    expect(lines).toContain('something researchable');
    expect(lines).toContain('call `create_blank_project`');
    expect(lines).toContain("Don't fire it speculatively");
    // No mechanical post-create sequence: organic research at the student's pace.
    expect(lines).toContain("at the student's pace");
    expect(lines).toContain('No mechanical sequence');
  });

  it('forbids authoring terminology during onboarding but permits brainlift as the long-arc destination', () => {
    const lines = onboardingLines();

    expect(lines).toContain('The TOPIC must come from the student');
    // 'brainlift' is intentionally NOT in the forbidden list - it can appear lightly as the long-arc destination.
    expect(lines).toContain("Don't mention 'DOK', 'insights', 'SPOVs', 'sprint plans'");
    expect(lines).not.toContain("Don't mention 'DOK', 'brainlift'");
    expect(lines).toContain('this research will eventually become your brainlift');
  });
});
