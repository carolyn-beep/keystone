/**
 * Keystone Central prompt suite.
 *
 * Asserts the BC prompt has the permissive peer-researcher posture, the
 * BRAINLIFT LOOP section (replacing Keystone Journey), and that AlphaX-only
 * gatekeeping language and `activePlans` rendering are absent.
 *
 * Calls `buildBrainliftSystemPrompt` directly. The dispatcher is exercised
 * separately by `server/ai/chat/__tests__/system-prompt.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import { buildBrainliftSystemPrompt } from '../brainlift';

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
  activePlans: [],
};

const multiBrainliftContext: ChatUserContext = {
  userId: 'user-2',
  userName: 'Pat Researcher',
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
      title: 'Synthesis review',
      lastActivityAt: new Date('2026-04-29T08:00:00.000Z'),
    },
  ],
  activePlans: [],
};

// Cross-domain user fixture: BC user happens to have populated activePlans
// from prior AlphaX activity. BC must not surface them.
const crossBrandContext: ChatUserContext = {
  userId: 'user-3',
  userName: 'Cross User',
  isAdmin: false,
  brainliftCount: 1,
  recentBrainlifts: [
    {
      slug: 'cross-brainlift',
      title: 'Cross Brainlift',
      updatedAt: new Date('2026-04-28T12:00:00.000Z'),
    },
  ],
  recentConversations: [],
  activePlans: [
    {
      brainliftSlug: 'cross-brainlift',
      brainliftTitle: 'Cross Brainlift',
      planId: 99,
      todayTasks: [
        { id: 7, title: 'Should not appear', weekNumber: 3, isFlagship: false, scheduledDate: '2026-04-29' },
      ],
      overdueTasks: [
        { id: 4, title: 'Should also not appear', weekNumber: 1, isFlagship: true, scheduledDate: '2026-04-25' },
      ],
    },
  ],
};

describe('buildBrainliftSystemPrompt: identity', () => {
  it('describes Keystone Central and a knowledge-verification platform', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('Keystone Central');
    expect(prompt).toContain('knowledge-verification');
  });

  it('does not contain AlphaX-specific identity terms', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    // Identity-section assertion: the IDENTITY block must not name AlphaX or
    // call the user a high-school student. Generic BRAINLIFT OPERATING
    // PROTOCOLS prose still uses the word "student"; restrict the check to
    // the IDENTITY block.
    const identityStart = prompt.indexOf('=== START OF IDENTITY ===');
    const identityEnd = prompt.indexOf('=== END OF IDENTITY ===');
    expect(identityStart).toBeGreaterThanOrEqual(0);
    expect(identityEnd).toBeGreaterThan(identityStart);
    const identity = prompt.slice(identityStart, identityEnd);

    expect(identity).not.toContain('AlphaX');
    expect(identity).not.toContain('Buddy');
    expect(identity).not.toContain('high school');
  });
});

describe('buildBrainliftSystemPrompt: tone', () => {
  it('introduces a peer-researcher register', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('peer-researcher');
  });

  it('includes the shared "match their energy" tone helper', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('match their energy');
  });
});

describe('buildBrainliftSystemPrompt: main operational posture', () => {
  it('declares a PERMISSIVE serve-the-user posture', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('## MAIN OPERATIONAL POSTURE');
    expect(prompt).toContain('Serve the user');
  });

  it('does not contain AlphaX gatekeeping language', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [],
    });

    // Restrict the gatekeeping-absent check to the MAIN OPERATIONAL POSTURE
    // block. Other shared sections (BRAINLIFT OPERATING PROTOCOLS) reference
    // the word "student" because that prose is brand-agnostic.
    const start = prompt.indexOf('=== START OF MAIN OPERATIONAL POSTURE ===');
    const end = prompt.indexOf('=== END OF MAIN OPERATIONAL POSTURE ===');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const posture = prompt.slice(start, end);

    expect(posture).not.toContain('Substantive thinking');
    expect(posture).not.toContain('pull them back in');
    expect(posture).not.toContain('AlphaX');
  });

  it('explicitly trusts the grader to enforce engagement downstream', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('grader');
    // Drafting / analysis / extraction are explicitly fair game in BC.
    expect(prompt).toContain('Drafting is fair game');
    expect(prompt).toContain('Analysis is fair game');
  });
});

describe('buildBrainliftSystemPrompt: brainlift loop', () => {
  it('contains the six-step BRAINLIFT LOOP section', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('=== START OF THE BRAINLIFT LOOP ===');
    expect(prompt).toContain('## The Brainlift Loop');
    expect(prompt).toContain('1. Import');
    expect(prompt).toContain('2. Verify');
    expect(prompt).toContain('3. Grade');
    expect(prompt).toContain('4. Refine');
    expect(prompt).toContain('5. Defend');
    expect(prompt).toContain('6. Iterate');
  });

  it('does not contain the Keystone Journey heading', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).not.toContain('## The Keystone Journey');
    expect(prompt).not.toContain('=== START OF THE KEYSTONE JOURNEY ===');
  });
});

describe('buildBrainliftSystemPrompt: shared blocks', () => {
  it('includes the BRAINLIFT OPERATING PROTOCOLS section', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('=== START OF BRAINLIFT OPERATING PROTOCOLS ===');
    expect(prompt).toContain('=== END OF BRAINLIFT OPERATING PROTOCOLS ===');
  });

  it('includes the TOOLS PROTOCOL section', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('=== START OF TOOLS PROTOCOL ===');
    expect(prompt).toContain('=== END OF TOOLS PROTOCOL ===');
    expect(prompt).toContain('grading tools');
    expect(prompt).toContain('ask_user_question');
  });
});

describe('buildBrainliftSystemPrompt: user context', () => {
  it('omits the Active sprint plans block when activePlans is empty', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [],
    });

    expect(prompt).not.toContain('Active sprint plans');
    expect(prompt).not.toContain('activePlans');
  });

  it('omits the Active sprint plans block even when activePlans is populated (cross-domain user)', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: crossBrandContext,
      skills: [],
    });

    expect(prompt).not.toContain('Active sprint plans');
    expect(prompt).not.toContain('activePlans');
    expect(prompt).not.toContain("Today's tasks:");
    expect(prompt).not.toContain('Overdue tasks:');
    expect(prompt).not.toContain('Should not appear');
    expect(prompt).not.toContain('Should also not appear');
  });

  it('renders user, admin, brainlift count, recent brainlifts, recent conversations', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('Pat Researcher');
    expect(prompt).toContain('Admin access: yes');
    expect(prompt).toContain('Brainlift count: 3');
    expect(prompt).toContain('AI Systems (ai-systems)');
    expect(prompt).toContain('Founder Notes (founder-notes)');
    expect(prompt).toContain('Synthesis review (id 42) last activity 2026-04-29');
  });
});

describe('buildBrainliftSystemPrompt: heuristics', () => {
  it('zero-brainlift branch mentions DOK pyramid, import path, and Discussion Agent', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('DOK pyramid');
    expect(prompt).toContain('WorkFlowy');
    expect(prompt).toContain('Discussion Agent');
    expect(prompt).not.toContain('Keystone Journey');
  });

  it('single-brainlift branch locks the slug and leads on refinement', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: oneBrainliftContext,
      skills: [{ name: 'defense', description: 'Stress-test SPOVs.' }],
    });

    expect(prompt).toContain('exactly one brainlift, with slug `solo-brainlift`');
    expect(prompt).toContain('refinement based on recent activity');
    // Heuristics never reference activePlans.
    const heuristicsStart = prompt.indexOf('=== START OF BRAINLIFT HEURISTICS ===');
    const heuristicsEnd = prompt.indexOf('=== END OF BRAINLIFT HEURISTICS ===');
    const heuristics = prompt.slice(heuristicsStart, heuristicsEnd);
    expect(heuristics).not.toContain('activePlans');
    expect(heuristics).not.toContain('sprint');
  });

  it('multi-brainlift branch triages by recency and never references activePlans', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: multiBrainliftContext,
      skills: [{ name: 'analysis', description: 'Analyse cross-source patterns.' }],
    });

    expect(prompt).toContain('multiple brainlifts');
    expect(prompt).toContain('Triage by recency');
    expect(prompt).toContain('recentBrainlifts');
    expect(prompt).toContain('recentConversations');

    const heuristicsStart = prompt.indexOf('=== START OF BRAINLIFT HEURISTICS ===');
    const heuristicsEnd = prompt.indexOf('=== END OF BRAINLIFT HEURISTICS ===');
    const heuristics = prompt.slice(heuristicsStart, heuristicsEnd);
    expect(heuristics).not.toContain('activePlans');
    expect(heuristics).not.toContain('sprint plan');
    expect(heuristics).not.toContain("today's tasks");
    expect(heuristics).not.toContain('overdue');
  });
});

describe('buildBrainliftSystemPrompt: skills', () => {
  it('renders Available Repo Skills', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [
        { name: 'analysis', description: 'Analyse cross-source patterns.' },
      ],
    });

    expect(prompt).toContain('analysis: Analyse cross-source patterns.');
  });

  it('emits "- none registered" when no skills are passed', () => {
    const prompt = buildBrainliftSystemPrompt({
      userContext: zeroBrainliftContext,
      skills: [],
    });

    expect(prompt).toContain('- none registered');
  });
});
