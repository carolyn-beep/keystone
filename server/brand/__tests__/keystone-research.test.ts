import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import type { ConversationContext } from '../types';
import {
  keystoneResearchPromptBuilders,
  buildKeystoneResearchHeuristics,
  buildKeystoneResearchSystemPrompt,
  formatKeystoneResearchUserContext,
} from '../keystone-research';

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
    const lines = buildKeystoneResearchHeuristics({
      userContext: baseUserContext,
      conversation: unboundConversation,
    }).join('\n');

    expect(lines).toContain('no projects yet');
    expect(lines).toContain('project-idea-generator');
    expect(lines).toContain('create_blank_project');
  });

  it('asks repeat unbound students to start new or continue existing', () => {
    const lines = buildKeystoneResearchHeuristics({
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
    const lines = buildKeystoneResearchHeuristics({
      userContext: {
        ...baseUserContext,
        brainliftCount: 1,
      },
      conversation: boundConversation,
    }).join('\n');

    // Bound state advertises the now-actionable research toolset and points
    // back at the persistent operational posture (the durable guidance —
    // "Never compose notes yourself", DOK guardrails — lives in the system
    // prompt sections, not in these per-state heuristic lines).
    expect(lines).toContain('CURRENT STATE: bound');
    expect(lines).toContain('save_source');
    expect(lines).toContain('propose_research_run');
    expect(lines).toContain('operational posture as written');
  });
});

describe('AlphaX research prompt', () => {
  it('renders the required research-mode sections and guardrails', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
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

  it('nudges the agent to populate Second Brain v2 enrichment fields when saving sources (FR5)', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: boundConversation,
    });

    // The new sentence under "Surfacing a source for the student to read".
    expect(prompt).toContain('save_source');
    expect(prompt).toContain('keyInsights');
    expect(prompt).toContain('whyMatters');
    expect(prompt).toContain('length');
    // All six retrieval-type tokens enumerated for the agent's reference.
    expect(prompt).toContain('Podcast');
    expect(prompt).toContain('AcademicPaper');
    expect(prompt).toContain('Video');
    expect(prompt).toContain('Substack');
    expect(prompt).toContain('News');
    expect(prompt).toContain('Twitter');
  });

  it('uses the research-mode user-context formatter (sprint-plan suppressed)', () => {
    expect(keystoneResearchPromptBuilders.formatUserContext).toBe(formatKeystoneResearchUserContext);
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

    const prompt = buildKeystoneResearchSystemPrompt({
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
    const prompt = buildKeystoneResearchSystemPrompt({
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

  it('renders in/out scope inside the CURRENT PROJECT block when the bound brainlift has scope (01-scope-foundation FR4)', () => {
    const scopedConversation: ConversationContext = {
      ...boundConversation,
      brainlift: {
        id: 7,
        slug: 'battery-chemistry',
        title: 'Battery Chemistry',
        phase: 'research',
        inScope: ['solid-state electrolytes'],
        outOfScope: ['EV market analysis'],
      } as ConversationContext['brainlift'],
    };

    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: scopedConversation,
    });

    const currentProjectBlock = prompt.slice(
      prompt.indexOf('=== START OF CURRENT PROJECT ==='),
      prompt.indexOf('=== END OF CURRENT PROJECT ==='),
    );
    expect(currentProjectBlock).toContain('solid-state electrolytes');
    expect(currentProjectBlock).toContain('EV market analysis');
  });

  it('omits the CURRENT PROJECT block entirely when unbound', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: unboundConversation,
    });

    expect(prompt).not.toContain('CURRENT PROJECT');
    expect(prompt).not.toContain('Second Brain state');
  });

  it('renders the ambient Second Brain summary when bound with populated state', () => {
    const conversation: ConversationContext = {
      ...boundConversation,
      secondBrainSummary: {
        sourceCount: 12,
        noteCount: 8,
        linkedNoteCount: 5,
        unlinkedNoteCount: 3,
        categoryCount: 3,
        categories: [
          { id: 1, name: 'Industry Players', sourceCount: 5 },
          { id: 2, name: 'Chemistry Basics', sourceCount: 4 },
          { id: 3, name: 'Policy Landscape', sourceCount: 3 },
        ],
      },
    };

    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation,
    });

    expect(prompt).toContain('Second Brain state: 12 sources across 3 categories');
    expect(prompt).toContain('Industry Players: 5');
    expect(prompt).toContain('Chemistry Basics: 4');
    expect(prompt).toContain('Policy Landscape: 3');
    expect(prompt).toContain('8 notes (5 linked to a source, 3 free-form)');
  });

  it('renders the empty Second Brain variant when zero sources and zero notes', () => {
    const conversation: ConversationContext = {
      ...boundConversation,
      secondBrainSummary: {
        sourceCount: 0,
        noteCount: 0,
        linkedNoteCount: 0,
        unlinkedNoteCount: 0,
        categoryCount: 2,
        categories: [],
      },
    };

    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation,
    });

    expect(prompt).toContain('Second Brain state: empty (no sources or notes yet).');
  });

  it('does NOT render the Second Brain summary when the conversation is unbound', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: {
        ...unboundConversation,
        secondBrainSummary: {
          sourceCount: 12,
          noteCount: 8,
          linkedNoteCount: 5,
          unlinkedNoteCount: 3,
          categoryCount: 3,
          categories: [],
        },
      },
    });

    expect(prompt).not.toContain('Second Brain state');
  });

  it('does NOT render the Second Brain summary when the bound brainlift is in authoring phase', () => {
    const authoringConversation: ConversationContext = {
      conversationId: 10,
      brainliftId: 9,
      brainlift: {
        id: 9,
        slug: 'authored-brainlift',
        title: 'Authored Brainlift',
        phase: 'authoring',
      } as ConversationContext['brainlift'],
      secondBrainSummary: {
        sourceCount: 4,
        noteCount: 2,
        linkedNoteCount: 1,
        unlinkedNoteCount: 1,
        categoryCount: 2,
        categories: [{ id: 1, name: 'Cat', sourceCount: 4 }],
      },
    };

    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseUserContext,
      skills: [],
      mode: 'research',
      conversation: authoringConversation,
    });

    expect(prompt).not.toContain('Second Brain state');
  });
});
