/**
 * Tests for Spec 03 FR5 + FR6: AI Writing Signal authoring-mode paragraph.
 *
 * FR5: The canonical paragraph appears in each of the three authoring
 *      prompts (AlphaX, Keystone Central, Discussion authoring branch) and
 *      preserves the "no grade impact" + "own voice" framing from
 *      decisions.md §11.
 *
 * FR6 (regression guard): research-mode prompts do NOT include the paragraph
 *      or the phrase "AI Writing Signal". The authoring-only snapshot for the
 *      discussion prompt (research vs authoring on the same brainlift) is the
 *      load-bearing assertion for the authoring-vs-research separation.
 *
 * Negative: "Pangram" (internal codename) appears NOWHERE in any rendered
 *      prompt — authoring or research.
 */

import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import type { LearningStreamItem, Brainlift } from '../../storage/base';
import { buildKeystoneSystemPrompt } from '../keystone';
import { buildKeystoneResearchSystemPrompt } from '../keystone-research';
import { buildBrainliftSystemPrompt } from '../brainlift';
import { buildDiscussionSystemPrompt } from '../../ai/discussion/system-prompt';
import { AI_WRITING_SIGNAL_AUTHORING_NOTE } from '../shared/prompt-helpers';
import type { ConversationContext } from '../types';

const CANONICAL_PARAGRAPH =
  'DOK2 summaries, DOK3 insights, and DOK4 SPOVs are analyzed for AI writing signals after submission. The signal does not affect platform grades -- it is informational, surfaced to reviewers (teachers / guides) who may apply their own policies off-platform. Help the user write in their own voice; do not paste prose for them.';

const baseContext: ChatUserContext = {
  userId: 'u',
  userName: 'Test User',
  isAdmin: false,
  brainliftCount: 1,
  recentBrainlifts: [
    { slug: 'b', title: 'B', updatedAt: new Date('2026-05-01T00:00:00.000Z') },
  ],
  recentConversations: [],
  activePlans: [],
};

const baseItem: LearningStreamItem = {
  id: 1,
  brainliftId: 1,
  type: 'Article',
  author: 'Author',
  topic: 'Topic',
  time: '5 min',
  facts: '',
  url: 'https://example.com',
  status: 'pending',
  source: 'manual',
  extractedContent: null,
  createdAt: new Date(),
} as LearningStreamItem;

const authoringBrainlift: Pick<Brainlift, 'displayPurpose' | 'description' | 'title' | 'phase'> = {
  displayPurpose: 'Purpose',
  description: 'Description',
  title: 'Title',
  phase: 'authoring',
};

const researchBrainlift: Pick<Brainlift, 'displayPurpose' | 'description' | 'title' | 'phase'> = {
  displayPurpose: 'Purpose',
  description: 'Description',
  title: 'Title',
  phase: 'research',
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  return haystack.split(needle).length - 1;
}

describe('FR5: AI_WRITING_SIGNAL_AUTHORING_NOTE shared constant', () => {
  it('exports the canonical paragraph as part of the joined block', () => {
    const joined = AI_WRITING_SIGNAL_AUTHORING_NOTE.join('\n');
    expect(joined).toContain(CANONICAL_PARAGRAPH);
  });

  it('does not mention "Pangram" anywhere in the shared block', () => {
    const joined = AI_WRITING_SIGNAL_AUTHORING_NOTE.join('\n').toLowerCase();
    expect(joined).not.toContain('pangram');
  });
});

describe('FR5: AlphaX authoring prompt contains the paragraph', () => {
  it('renders the canonical paragraph exactly once', () => {
    const prompt = buildKeystoneSystemPrompt({ userContext: baseContext, skills: [] });
    expect(countOccurrences(prompt, CANONICAL_PARAGRAPH)).toBe(1);
  });

  it('contains the no-grade-impact phrase', () => {
    const prompt = buildKeystoneSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt).toContain('does not affect platform grades');
  });

  it('contains the own-voice action implication', () => {
    const prompt = buildKeystoneSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt).toContain('Help the user write in their own voice');
  });

  it('contains the "AI WRITING SIGNAL" section heading', () => {
    const prompt = buildKeystoneSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt).toContain('AI WRITING SIGNAL');
  });

  it('does NOT mention "Pangram"', () => {
    const prompt = buildKeystoneSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });
});

describe('FR5: Keystone Central authoring prompt contains the paragraph', () => {
  it('renders the canonical paragraph exactly once', () => {
    const prompt = buildBrainliftSystemPrompt({ userContext: baseContext, skills: [] });
    expect(countOccurrences(prompt, CANONICAL_PARAGRAPH)).toBe(1);
  });

  it('contains the no-grade-impact phrase', () => {
    const prompt = buildBrainliftSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt).toContain('does not affect platform grades');
  });

  it('contains the own-voice action implication', () => {
    const prompt = buildBrainliftSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt).toContain('Help the user write in their own voice');
  });

  it('does NOT mention "Pangram"', () => {
    const prompt = buildBrainliftSystemPrompt({ userContext: baseContext, skills: [] });
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });
});

describe('FR5: Discussion authoring prompt contains the paragraph', () => {
  it('non-builder authoring renders the paragraph exactly once', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift);
    expect(countOccurrences(prompt, CANONICAL_PARAGRAPH)).toBe(1);
  });

  it('builder authoring renders the paragraph exactly once', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift, { mode: 'builder' });
    expect(countOccurrences(prompt, CANONICAL_PARAGRAPH)).toBe(1);
  });

  it('non-builder authoring contains the no-grade-impact phrase', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift);
    expect(prompt).toContain('does not affect platform grades');
    expect(prompt).toContain('Help the user write in their own voice');
  });

  it('builder authoring contains the no-grade-impact phrase', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift, { mode: 'builder' });
    expect(prompt).toContain('does not affect platform grades');
    expect(prompt).toContain('Help the user write in their own voice');
  });

  it('does NOT mention "Pangram" in authoring (non-builder)', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift);
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });

  it('does NOT mention "Pangram" in authoring (builder)', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, authoringBrainlift, { mode: 'builder' });
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });
});

describe('FR5+FR6 AUTHORING-ONLY SNAPSHOT: discussion research vs authoring', () => {
  it('discussion research branch does NOT contain the canonical paragraph', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, researchBrainlift);
    expect(prompt).not.toContain(CANONICAL_PARAGRAPH);
  });

  it('discussion research branch does NOT contain the phrase "AI Writing Signal"', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, researchBrainlift);
    expect(prompt.toLowerCase()).not.toContain('ai writing signal');
  });

  it('discussion research branch does NOT contain "does not affect platform grades"', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, researchBrainlift);
    expect(prompt).not.toContain('does not affect platform grades');
  });

  it('discussion research branch does NOT mention "Pangram"', () => {
    const prompt = buildDiscussionSystemPrompt(baseItem, researchBrainlift);
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });
});

describe('FR6: AlphaX research prompt does NOT contain the paragraph', () => {
  const unboundConversation: ConversationContext = {
    conversationId: 1,
    brainliftId: null,
    brainlift: null,
  };

  it('does not contain the canonical paragraph or "AI Writing Signal"', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseContext,
      skills: [],
      conversation: unboundConversation,
    });
    expect(prompt).not.toContain(CANONICAL_PARAGRAPH);
    expect(prompt.toLowerCase()).not.toContain('ai writing signal');
  });

  it('does NOT mention "Pangram"', () => {
    const prompt = buildKeystoneResearchSystemPrompt({
      userContext: baseContext,
      skills: [],
      conversation: unboundConversation,
    });
    expect(prompt.toLowerCase()).not.toContain('pangram');
  });
});
