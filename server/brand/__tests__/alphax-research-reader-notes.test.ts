/**
 * Tests for spec 01-backend-atomic-save FR4:
 * One-line heuristic addition acknowledging reader-originated notes.
 *
 * The added line lives inside the SECOND BRAIN MODEL block so the agent
 * treats list_notes deltas it didn't author with save_note as student-
 * driven signal between turns.
 */

import { describe, expect, it } from 'vitest';
import type { ChatUserContext } from '../../storage/base';
import type { ConversationContext } from '../types';
import { buildAlphaXResearchSystemPrompt } from '../alphax-research';

const baseUserContext: ChatUserContext = {
  userId: 'user-1',
  userName: 'Reader Notes Student',
  isAdmin: false,
  brainliftCount: 1,
  recentBrainlifts: [],
  recentConversations: [],
  activePlans: [],
};

const boundConversation: ConversationContext = {
  conversationId: 99,
  brainliftId: 7,
  brainlift: {
    id: 7,
    slug: 'reader-notes-coverage',
    title: 'Reader Notes Coverage',
    phase: 'research',
  } as ConversationContext['brainlift'],
};

describe('alphax-research SECOND BRAIN MODEL — reader-originated notes heuristic (FR4)', () => {
  function renderPrompt(): string {
    return buildAlphaXResearchSystemPrompt({
      userContext: baseUserContext,
      conversation: boundConversation,
      skills: [],
    });
  }

  it('acknowledges that save_note rows can arrive from the reader between agent turns', () => {
    const prompt = renderPrompt();

    // The heuristic must reference both `list_notes` (how the agent observes
    // the delta) and the "reader" origin (so the agent attributes it to the
    // student rather than to itself).
    expect(prompt).toMatch(/reader/i);
    expect(prompt).toMatch(/list_notes/);
  });

  it('places the new line inside the SECOND BRAIN MODEL block (not in TOOLS or HEURISTICS)', () => {
    const prompt = renderPrompt();

    const startMarker = '=== START OF SECOND BRAIN MODEL ===';
    const endMarker = '=== END OF SECOND BRAIN MODEL ===';
    const startIdx = prompt.indexOf(startMarker);
    const endIdx = prompt.indexOf(endMarker);
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const block = prompt.slice(startIdx, endIdx);

    // The new line must live INSIDE the SECOND BRAIN MODEL block.
    expect(block).toMatch(/reader/i);
    expect(block).toMatch(/list_notes/);
  });

  it('does not duplicate the heuristic outside the SECOND BRAIN MODEL block', () => {
    const prompt = renderPrompt();
    const startMarker = '=== START OF SECOND BRAIN MODEL ===';
    const endMarker = '=== END OF SECOND BRAIN MODEL ===';
    const startIdx = prompt.indexOf(startMarker);
    const endIdx = prompt.indexOf(endMarker);
    const block = prompt.slice(startIdx, endIdx + endMarker.length);
    const outside = prompt.replace(block, '');

    // "list_notes" should appear at most as part of the TOOLS list outside;
    // the phrase coupling "reader" with "list_notes" (the FR4 sentence) must
    // not show up twice.
    const readerListNotesCount = (outside.match(/reader.*list_notes|list_notes.*reader/gi) || []).length;
    expect(readerListNotesCount).toBe(0);
  });
});
