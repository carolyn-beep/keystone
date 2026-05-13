import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import type { ConversationContext } from '../types';
import {
  alphaxResearchPromptBuilders,
  buildAlphaXResearchHeuristics,
  buildAlphaXResearchSystemPrompt,
  formatAlphaXResearchUserContext,
} from '../alphax-research';

const baseUserContext: ChatUserContext = {
  userId: 'user-1',
  userName: 'Research Student',
  isAdmin: false,
  brainliftCount: 0,
  recentBrainlifts: [],
  recentConversations: [],
  activePlans: [],
};

const unboundConversation: ConversationContext = {
  conversationId: 10,
  brainliftId: null,
  brainlift: null,
};

const boundConversation: ConversationContext = {
  conversationId: 10,
  brainliftId: 7,
  brainlift: {
    id: 7,
    slug: 'battery-chemistry',
    title: 'Battery Chemistry',
    phase: 'research',
  } as ConversationContext['brainlift'],
};

describe('AlphaX research prompt heuristics', () => {
  it('guides new unbound students through project discovery and project-idea-generator', () => {
    const lines = buildAlphaXResearchHeuristics({
      userContext: baseUserContext,
      conversation: unboundConversation,
    }).join('\n');

    expect(lines).toContain('no projects yet');
    expect(lines).toContain('project-idea-generator');
    expect(lines).toContain('create_blank_project');
  });

  it('asks repeat unbound students to start new or continue existing', () => {
    const lines = buildAlphaXResearchHeuristics({
      userContext: {
        ...baseUserContext,
        brainliftCount: 2,
      },
      conversation: unboundConversation,
    }).join('\n');

    expect(lines).toContain('start a new research project or continue an existing one');
    expect(lines).toContain('list_brainlifts');
    expect(lines).toContain('change_conversation_project');
  });

  it('gives active research guidance when a project is bound', () => {
    const lines = buildAlphaXResearchHeuristics({
      userContext: {
        ...baseUserContext,
        brainliftCount: 1,
      },
      conversation: boundConversation,
    }).join('\n');

    expect(lines).toContain('active research partner');
    expect(lines).toContain('save_source');
    expect(lines).toContain("Never compose notes yourself");
    expect(lines).toContain('Avoid DOK1');
  });
});

describe('AlphaX research prompt', () => {
  it('renders the required research-mode sections and guardrails', () => {
    const prompt = buildAlphaXResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [{ name: 'project-idea-generator', description: 'Help students choose a project.' }],
      mode: 'research',
      conversation: unboundConversation,
    });

    expect(prompt).toContain('=== START OF IDENTITY ===');
    expect(prompt).toContain('=== START OF TONE ===');
    expect(prompt).toContain('=== START OF MAIN OPERATIONAL POSTURE ===');
    expect(prompt).toContain('=== START OF SECOND BRAIN MODEL ===');
    expect(prompt).toContain('=== START OF CONTEXT-AWARE HEURISTICS ===');
    expect(prompt).toContain('=== START OF TOOLS AVAILABLE ===');
    expect(prompt).toContain('=== START OF REFUSE WARMLY ===');
    expect(prompt).toContain('Never compose notes yourself');
    expect(prompt).toContain('Never push DOK1, DOK2, DOK3, DOK4');
    expect(prompt).toContain('project-idea-generator');
  });

  it('uses the research-mode user-context formatter (sprint-plan suppressed)', () => {
    expect(alphaxResearchPromptBuilders.formatUserContext).toBe(formatAlphaXResearchUserContext);
  });

  it('suppresses activePlans/sprint plan context in research mode', () => {
    const today = new Date().toISOString().slice(0, 10);
    const userContext: ChatUserContext = {
      ...baseUserContext,
      brainliftCount: 1,
      recentBrainlifts: [
        {
          slug: 'battery-chemistry',
          title: 'Battery Chemistry',
          updatedAt: new Date(),
          permission: 'owner',
        },
      ],
      activePlans: [
        {
          brainliftSlug: 'battery-chemistry',
          brainliftTitle: 'Battery Chemistry',
          planId: 42,
          todayTasks: [
            { id: 1, title: 'Draft market analysis intro', weekNumber: 2, isFlagship: true, scheduledDate: today },
          ],
          overdueTasks: [
            { id: 2, title: 'Validate ICP with 3 interviews', weekNumber: 1, isFlagship: false, scheduledDate: '2026-05-09' },
          ],
        },
      ],
    };

    const prompt = buildAlphaXResearchSystemPrompt({
      userContext,
      skills: [],
      mode: 'research',
      conversation: boundConversation,
    });

    // None of the sprint-plan markers should appear in the rendered research prompt.
    expect(prompt).not.toContain('Active sprint plans');
    expect(prompt).not.toContain('today,');
    expect(prompt).not.toContain('overdue.');
    expect(prompt).not.toContain('flagship');
    expect(prompt).not.toContain('Draft market analysis intro');
    expect(prompt).not.toContain('Validate ICP with 3 interviews');
    expect(prompt).not.toContain('plan 42');
  });

  it('renders the CURRENT PROJECT block with title/slug/phase when a project is bound', () => {
    const prompt = buildAlphaXResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: boundConversation,
    });

    expect(prompt).toContain('=== START OF CURRENT PROJECT ===');
    expect(prompt).toContain('"Battery Chemistry"');
    expect(prompt).toContain('slug: `battery-chemistry`');
    expect(prompt).toContain('phase: research');
    expect(prompt).toContain('Do NOT ask the user which project they mean');
    expect(prompt).toContain('Do NOT call `list_brainlifts`');
    expect(prompt).toContain('change_conversation_project');
    expect(prompt).toContain('=== END OF CURRENT PROJECT ===');
  });

  it('omits the CURRENT PROJECT block entirely when unbound', () => {
    const prompt = buildAlphaXResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: unboundConversation,
    });

    expect(prompt).not.toContain('CURRENT PROJECT');
  });
});
