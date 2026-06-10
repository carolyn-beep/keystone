/**
 * Shared prompt-helper unit tests.
 *
 * Covers the formatters relocated from `server/ai/chat/system-prompt.ts` and
 * the transferable prose constants. No env stubbing or brand selection
 * happens here.
 */

import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatRecentBrainlifts,
  formatRecentConversations,
  formatActivePlans,
  formatSkillSummaries,
  TONE_HELPERS_SHARED,
  BRAINLIFT_OPERATING_PROTOCOLS,
  TOOLS_PROTOCOL,
} from '../shared/prompt-helpers';

describe('formatDate', () => {
  it('returns ISO YYYY-MM-DD slice', () => {
    expect(formatDate(new Date('2026-04-28T12:34:56.000Z'))).toBe('2026-04-28');
  });
});

describe('formatRecentBrainlifts', () => {
  it('returns "- none" for empty input', () => {
    expect(formatRecentBrainlifts([])).toEqual(['- none']);
  });

  it('formats one brainlift with title, slug, updated date, and permission tag', () => {
    const out = formatRecentBrainlifts([
      { slug: 'foo', title: 'Foo', updatedAt: new Date('2026-04-28T12:00:00.000Z'), permission: 'owner' },
    ]);
    expect(out).toEqual(['- Foo (foo) updated 2026-04-28 [owner]']);
  });

  it('formats multiple brainlifts in order with their respective permissions', () => {
    const out = formatRecentBrainlifts([
      { slug: 'a', title: 'A', updatedAt: new Date('2026-04-27T00:00:00.000Z'), permission: 'owner' },
      { slug: 'b', title: 'B', updatedAt: new Date('2026-04-26T00:00:00.000Z'), permission: 'editor' },
      { slug: 'c', title: 'C', updatedAt: new Date('2026-04-25T00:00:00.000Z'), permission: 'viewer' },
    ]);
    expect(out).toEqual([
      '- A (a) updated 2026-04-27 [owner]',
      '- B (b) updated 2026-04-26 [editor]',
      '- C (c) updated 2026-04-25 [viewer]',
    ]);
  });
});

describe('formatRecentConversations', () => {
  it('returns "- none" for empty input', () => {
    expect(formatRecentConversations([])).toEqual(['- none']);
  });

  it('formats with id and last-activity date', () => {
    const out = formatRecentConversations([
      { id: 42, title: 'Brainstorm', lastActivityAt: new Date('2026-04-29T08:00:00.000Z') },
    ]);
    expect(out).toEqual(['- Brainstorm (id 42) last activity 2026-04-29']);
  });
});

describe('formatActivePlans', () => {
  it('returns "- none" for empty input', () => {
    expect(formatActivePlans([])).toEqual(['- none']);
  });

  it('collapses an idle plan to a one-line marker', () => {
    const out = formatActivePlans([
      {
        brainliftSlug: 'foo',
        brainliftTitle: 'Foo',
        planId: 1,
        todayTasks: [],
        overdueTasks: [],
      },
    ]);
    expect(out).toEqual([
      '- Foo (foo) plan 1: active but no tasks due today and nothing overdue.',
    ]);
  });

  it('renders today and overdue tasks with flagship marker', () => {
    const out = formatActivePlans([
      {
        brainliftSlug: 'foo',
        brainliftTitle: 'Foo',
        planId: 1,
        todayTasks: [
          { id: 1, title: 'Today task', weekNumber: 2, isFlagship: false, scheduledDate: '2026-04-29' },
        ],
        overdueTasks: [
          { id: 2, title: 'Overdue flagship', weekNumber: 1, isFlagship: true, scheduledDate: '2026-04-25' },
        ],
      },
    ]);

    expect(out[0]).toBe('- Foo (foo) plan 1: 1 today, 1 overdue.');
    expect(out).toContain("  Today's tasks:");
    expect(out).toContain('    - week 2 · task 1 · Today task');
    expect(out).toContain('  Overdue tasks:');
    expect(out).toContain('    - scheduled 2026-04-25 · week 1 · task 2 · Overdue flagship [flagship]');
  });
});

describe('formatSkillSummaries', () => {
  it('returns "- none registered" for empty input', () => {
    expect(formatSkillSummaries([])).toEqual(['- none registered']);
  });

  it('formats skills as "- name: description"', () => {
    expect(
      formatSkillSummaries([
        { name: 'foo', description: 'Foo skill.' },
        { name: 'bar', description: 'Bar skill.' },
      ]),
    ).toEqual([
      '- foo: Foo skill.',
      '- bar: Bar skill.',
    ]);
  });
});

describe('TONE_HELPERS_SHARED', () => {
  it('is a non-empty string array', () => {
    expect(TONE_HELPERS_SHARED.length).toBeGreaterThan(0);
    expect(TONE_HELPERS_SHARED.every((line) => typeof line === 'string')).toBe(true);
  });

  it('does not include the AlphaX-only "older sibling, mentor, startup coach" persona line', () => {
    const joined = TONE_HELPERS_SHARED.join('\n');
    expect(joined).not.toContain('older sibling');
    expect(joined).not.toContain('startup coach');
  });

  it('includes a "match their energy" lead-in for cross-brand reuse', () => {
    const joined = TONE_HELPERS_SHARED.join('\n');
    expect(joined).toContain('match their energy');
  });
});

describe('BRAINLIFT_OPERATING_PROTOCOLS', () => {
  it('starts and ends with the section markers', () => {
    expect(BRAINLIFT_OPERATING_PROTOCOLS[0]).toBe('=== START OF BRAINLIFT OPERATING PROTOCOLS ===');
    expect(BRAINLIFT_OPERATING_PROTOCOLS[BRAINLIFT_OPERATING_PROTOCOLS.length - 1]).toBe(
      '=== END OF BRAINLIFT OPERATING PROTOCOLS ===',
    );
  });

  it('includes the four-DOK-levels enumeration', () => {
    const joined = BRAINLIFT_OPERATING_PROTOCOLS.join('\n');
    expect(joined).toContain('DOK1 facts');
    expect(joined).toContain('DOK2 summaries');
    expect(joined).toContain('DOK3 insights');
    expect(joined).toContain('DOK4 SPOVs');
  });
});

describe('TOOLS_PROTOCOL', () => {
  it('starts and ends with the section markers', () => {
    expect(TOOLS_PROTOCOL[0]).toBe('=== START OF TOOLS PROTOCOL ===');
    expect(TOOLS_PROTOCOL[TOOLS_PROTOCOL.length - 1]).toBe('=== END OF TOOLS PROTOCOL ===');
  });

  it('lists the named tool groups', () => {
    const joined = TOOLS_PROTOCOL.join('\n');
    expect(joined).toContain('grading tools');
    expect(joined).toContain('curation and expert tools');
    expect(joined).toContain('research tools');
    expect(joined).toContain('sprint tools');
    expect(joined).toContain('load_skill');
    expect(joined).toContain('ask_user_question');
  });
});

describe('formatCurrentProject scope rendering (01-scope-foundation FR4)', () => {
  const baseBrainlift = {
    id: 7,
    slug: 'battery-chemistry',
    title: 'Battery Chemistry',
    phase: 'authoring',
  };

  function conversationWith(brainlift: Record<string, unknown> | null) {
    return {
      conversationId: 99,
      brainliftId: brainlift ? 7 : null,
      brainlift,
    } as never;
  }

  it('renders in/out scope phrases inside the CURRENT PROJECT block for a scoped brainlift', async () => {
    const { formatCurrentProject } = await import('../shared/prompt-helpers');

    const lines = formatCurrentProject(conversationWith({
      ...baseBrainlift,
      inScope: ['solid-state electrolytes', 'anode materials'],
      outOfScope: ['EV market analysis'],
    }));
    const joined = lines.join('\n');

    expect(lines[0]).toBe('=== START OF CURRENT PROJECT ===');
    expect(lines[lines.length - 1]).toBe('=== END OF CURRENT PROJECT ===');
    expect(joined).toContain('In scope');
    expect(joined).toContain('solid-state electrolytes');
    expect(joined).toContain('anode materials');
    expect(joined).toContain('Out of scope');
    expect(joined).toContain('EV market analysis');
  });

  it('renders only the non-empty side when one array is empty', async () => {
    const { formatCurrentProject } = await import('../shared/prompt-helpers');

    const joined = formatCurrentProject(conversationWith({
      ...baseBrainlift,
      inScope: ['solid-state electrolytes'],
      outOfScope: [],
    })).join('\n');

    expect(joined).toContain('In scope');
    expect(joined).toContain('solid-state electrolytes');
    expect(joined).not.toContain('Out of scope');
  });

  it('renders the block exactly as today when scope is empty', async () => {
    const { formatCurrentProject } = await import('../shared/prompt-helpers');

    const withEmptyScope = formatCurrentProject(conversationWith({
      ...baseBrainlift,
      inScope: [],
      outOfScope: [],
    }));
    const legacyWithoutScopeFields = formatCurrentProject(conversationWith({ ...baseBrainlift }));

    expect(withEmptyScope).toEqual(legacyWithoutScopeFields);
    expect(withEmptyScope.join('\n')).not.toContain('In scope');
    expect(withEmptyScope.join('\n')).not.toContain('Out of scope');
  });

  it('still returns an empty array when unbound', async () => {
    const { formatCurrentProject } = await import('../shared/prompt-helpers');

    expect(formatCurrentProject(conversationWith(null))).toEqual([]);
    expect(formatCurrentProject(undefined)).toEqual([]);
  });
});
