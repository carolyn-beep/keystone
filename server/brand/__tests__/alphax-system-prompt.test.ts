/**
 * AlphaX prompt regression suite.
 *
 * Migrated from the pre-Spec-03 `server/ai/chat/__tests__/system-prompt.test.ts`.
 * Calls `buildAlphaXSystemPrompt` directly; no env stubbing required.
 * The `buildChatSystemPrompt` dispatcher is exercised separately by
 * `server/ai/chat/__tests__/system-prompt.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import { buildAlphaXSystemPrompt } from '../alphax';

const zeroBrainliftContext: ChatUserContext = {
  userId: 'user-0',
  userName: 'Zero User',
  isAdmin: false,
  brainliftCount: 0,
  recentBrainlifts: [],
  recentConversations: [],
  activePlans: [],
};

const oneBrainliftContext: ChatUserContext = {
  userId: 'user-1',
  userName: 'Solo User',
  isAdmin: false,
  brainliftCount: 1,
  recentBrainlifts: [
    {
      slug: 'solo-brainlift',
      title: 'Solo Brainlift',
      updatedAt: new Date('2026-04-28T12:00:00.000Z'),
    },
  ],
  recentConversations: [],
  activePlans: [
    {
      brainliftSlug: 'solo-brainlift',
      brainliftTitle: 'Solo Brainlift',
      planId: 99,
      todayTasks: [
        { id: 7, title: 'Draft customer interview script', weekNumber: 3, isFlagship: false, scheduledDate: '2026-04-29' },
      ],
      overdueTasks: [
        { id: 4, title: 'Map competitive landscape', weekNumber: 1, isFlagship: true, scheduledDate: '2026-04-25' },
      ],
    },
  ],
};

const multiBrainliftContext: ChatUserContext = {
  userId: 'user-2',
  userName: 'Pat Planner',
  isAdmin: true,
  brainliftCount: 3,
  recentBrainlifts: [
    {
      slug: 'ai-systems',
      title: 'AI Systems',
      updatedAt: new Date('2026-04-27T12:00:00.000Z'),
    },
    {
      slug: 'founder-notes',
      title: 'Founder Notes',
      updatedAt: new Date('2026-04-26T12:00:00.000Z'),
    },
  ],
  recentConversations: [
    {
      id: 42,
      title: 'GTM brainstorm',
      lastActivityAt: new Date('2026-04-29T08:00:00.000Z'),
    },
    {
      id: 41,
      title: 'Investor positioning',
      lastActivityAt: new Date('2026-04-25T14:00:00.000Z'),
    },
  ],
  activePlans: [
    {
      brainliftSlug: 'sample-user-8',
      brainliftTitle: 'Sample User',
      planId: 200,
      todayTasks: [
        { id: 50, title: 'Segment studios by integration willingness', weekNumber: 2, isFlagship: false, scheduledDate: '2026-04-30' },
      ],
      overdueTasks: [
        { id: 33, title: 'Map the studio decision chain', weekNumber: 1, isFlagship: true, scheduledDate: '2026-04-23' },
        { id: 34, title: 'Decompose SPOVs into testable claims', weekNumber: 1, isFlagship: false, scheduledDate: '2026-04-24' },
      ],
    },
  ],
};

describe('buildAlphaXSystemPrompt', () => {
  it('renders identity, user context, tool guidance, and skill summaries', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [
        { name: 'onboarding', description: 'Help new users get to a first BrainLift quickly.' },
        { name: 'sprint-execution', description: 'Keep sprint work concrete and deliverable-driven.' },
      ],
    });

    expect(prompt).toContain('You are AlphaX Buddy');
    expect(prompt).toContain('Admin access: yes');
    expect(prompt).toContain('Pat Planner');
    expect(prompt).toContain('AI Systems (ai-systems)');
    expect(prompt).toContain('Founder Notes (founder-notes)');
    expect(prompt).toContain('grading tools');
    expect(prompt).toContain('load_skill');
    expect(prompt).toContain('ask_user_question');
    expect(prompt).toContain('onboarding: Help new users get to a first BrainLift quickly.');
    expect(prompt).toContain('sprint-execution: Keep sprint work concrete and deliverable-driven.');
  });

  it('renders recent conversations under user context with last-activity dates', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('- Recent conversations:');
    expect(prompt).toContain('GTM brainstorm (id 42) last activity 2026-04-29');
    expect(prompt).toContain('Investor positioning (id 41) last activity 2026-04-25');
  });

  it("emits '- none' when the user has no recent conversations", () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    const conversationsBlock = prompt.split('- Recent conversations:')[1] ?? '';
    expect(conversationsBlock.trimStart().startsWith('- none')).toBe(true);
  });

  it('emits the zero-brainlift heuristic that hands off to the onboarding skill', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [{ name: 'onboarding', description: 'Help new users get started.' }],
    });

    expect(prompt).toContain('The user currently has zero brainlifts');
    expect(prompt).toContain('`onboarding`');
  });

  it('locks the single-brainlift heuristic to the resolved slug', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [{ name: 'onboarding', description: 'Help new users get started.' }],
    });

    expect(prompt).toContain('exactly one brainlift, with slug `solo-brainlift`');
    expect(prompt).toContain('get_brainlift_assessment');
    expect(prompt).toContain('ALL FOUR DOK LEVELS');
  });

  it('refuses to guess a slug when multiple brainlifts exist', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [{ name: 'sprint-execution', description: 'Keep sprint work concrete and deliverable-driven.' }],
    });

    expect(prompt).toContain('multiple brainlifts');
    expect(prompt).toContain('Do not guess the slug');
    expect(prompt).toContain('activePlans');
    expect(prompt).toContain('Sample User (sample-user-8)');
    expect(prompt).toContain('Map the studio decision chain');
  });

  it('renders active sprint plans with today and overdue tasks inline', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('Active sprint plans (across ALL brainlifts');
    expect(prompt).toContain('Solo Brainlift (solo-brainlift) plan 99: 1 today, 1 overdue.');
    expect(prompt).toContain("Today's tasks:");
    expect(prompt).toContain('Draft customer interview script');
    expect(prompt).toContain('Overdue tasks:');
    expect(prompt).toContain('Map competitive landscape');
    expect(prompt).toContain('[flagship]');
  });

  it('renders multiple active plans across different brainlifts', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('Sample User (sample-user-8) plan 200: 1 today, 2 overdue.');
    expect(prompt).toContain('Segment studios by integration willingness');
    expect(prompt).toContain('Map the studio decision chain');
    expect(prompt).toContain('Decompose SPOVs into testable claims');
  });

  it('emits "- none" when the user has no active plans', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    const block = prompt.split('Active sprint plans (across ALL brainlifts, with today/overdue tasks):')[1] ?? '';
    expect(block.trimStart().startsWith('- none')).toBe(true);
  });

  it('collapses an active plan with no today or overdue tasks to a one-line idle marker', () => {
    const idleContext: ChatUserContext = {
      ...oneBrainliftContext,
      activePlans: [
        {
          brainliftSlug: 'solo-brainlift',
          brainliftTitle: 'Solo Brainlift',
          planId: 99,
          todayTasks: [],
          overdueTasks: [],
        },
      ],
    };

    const prompt = buildAlphaXSystemPrompt({
      userContext: idleContext,
      skills: [],
    });

    expect(prompt).toContain('Solo Brainlift (solo-brainlift) plan 99: active but no tasks due today and nothing overdue.');
    expect(prompt).not.toContain("Today's tasks:");
    expect(prompt).not.toContain('Overdue tasks:');
  });

  it('contains the AlphaX Journey section', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('=== START OF THE ALPHAX JOURNEY ===');
    expect(prompt).toContain('## The AlphaX Journey');
    expect(prompt).toContain('Business Brainlift');
  });

  it('contains the AlphaX MAIN OPERATIONAL POSTURE Socratic language', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('MAIN OPERATIONAL POSTURE — SOCRATIC');
    expect(prompt).toContain("the knowledge passes through the student's brain");
    expect(prompt).toContain('the refusal IS the work');
  });

  it('renders the CURRENT PROJECT block when the conversation is bound to a brainlift', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [],
      mode: 'authoring',
      conversation: {
        conversationId: 99,
        brainliftId: 7,
        brainlift: {
          id: 7,
          slug: 'solo-brainlift',
          title: 'Solo Brainlift',
          phase: 'authoring',
        } as never,
      },
    } as never);

    expect(prompt).toContain('=== START OF CURRENT PROJECT ===');
    expect(prompt).toContain('"Solo Brainlift"');
    expect(prompt).toContain('slug: `solo-brainlift`');
    expect(prompt).toContain('phase: authoring');
    expect(prompt).toContain('Do NOT ask the user which project they mean');
  });

  it('omits the CURRENT PROJECT block when the conversation is unbound', () => {
    const prompt = buildAlphaXSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).not.toContain('CURRENT PROJECT');
  });
});
