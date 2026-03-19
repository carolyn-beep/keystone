/**
 * Tests for 04-source-detail: Source Detail Workspace Helpers
 *
 * FR1: URL-driven item navigation (parseItemParam, buildListReturnUrl)
 * FR2: ExpandedItemView builder mode (tabs, badge, footer visibility)
 * FR3: ManualTab helpers (empty state computation)
 *
 * Tests pure logic extracted into source-detail-helpers.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  parseItemParam,
  buildListReturnUrl,
  isBuilderMode,
  getTabsForMode,
  getDefaultTab,
  formatExtractionBadge,
  shouldShowExtractionBadge,
  computeManualTabEmpty,
  shouldShowFooter,
} from '../source-detail-helpers';

// ─── FR1: URL-Driven Item Navigation ────────────────────────────────────────

describe('FR1: parseItemParam', () => {
  it('returns item ID when present and valid', () => {
    expect(parseItemParam('screen=3&item=42')).toBe(42);
  });

  it('returns null when item param is missing', () => {
    expect(parseItemParam('screen=3')).toBeNull();
  });

  it('returns null when item param is empty string', () => {
    expect(parseItemParam('screen=3&item=')).toBeNull();
  });

  it('returns null when item param is not a number', () => {
    expect(parseItemParam('screen=3&item=abc')).toBeNull();
  });

  it('returns null when item param is NaN-producing', () => {
    expect(parseItemParam('screen=3&item=foo123')).toBeNull();
  });

  it('handles leading ? in search string', () => {
    expect(parseItemParam('?screen=3&item=7')).toBe(7);
  });

  it('works with item param only', () => {
    expect(parseItemParam('item=99')).toBe(99);
  });
});

describe('FR1: buildListReturnUrl', () => {
  it('removes item param and keeps screen', () => {
    const url = buildListReturnUrl('screen=3&item=42');
    expect(url).toBe('?screen=3');
    expect(url).not.toContain('item');
  });

  it('removes item param from complex query', () => {
    const url = buildListReturnUrl('builderView=build&screen=3&item=42');
    expect(url).toContain('screen=3');
    expect(url).toContain('builderView=build');
    expect(url).not.toContain('item');
  });

  it('returns empty string when only item param existed', () => {
    const url = buildListReturnUrl('item=42');
    expect(url).toBe('');
  });

  it('handles already-clean URL (no item param)', () => {
    const url = buildListReturnUrl('screen=3');
    expect(url).toBe('?screen=3');
  });
});

// ─── FR2: ExpandedItemView Builder Mode ─────────────────────────────────────

describe('FR2: isBuilderMode', () => {
  it('returns true for builder mode', () => {
    expect(isBuilderMode('builder')).toBe(true);
  });

  it('returns false for stream mode', () => {
    expect(isBuilderMode('stream')).toBe(false);
  });

  it('returns false for undefined (default)', () => {
    expect(isBuilderMode(undefined)).toBe(false);
  });
});

describe('FR2: getTabsForMode', () => {
  it('returns Discussion and Manual tabs for builder mode', () => {
    const tabs = getTabsForMode('builder');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({ key: 'discuss', label: 'Discussion' });
    expect(tabs[1]).toEqual({ key: 'manual', label: 'Manual' });
  });

  it('returns Discuss and Quiz tabs for stream mode', () => {
    const tabs = getTabsForMode('stream');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toEqual({ key: 'discuss', label: 'Discuss' });
    expect(tabs[1]).toEqual({ key: 'quiz', label: 'Quiz' });
  });

  it('returns stream tabs for undefined mode', () => {
    const tabs = getTabsForMode(undefined);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].label).toBe('Discuss');
    expect(tabs[1].label).toBe('Quiz');
  });
});

describe('FR2: getDefaultTab', () => {
  it('returns discuss for all modes', () => {
    expect(getDefaultTab('builder')).toBe('discuss');
    expect(getDefaultTab('stream')).toBe('discuss');
    expect(getDefaultTab(undefined)).toBe('discuss');
  });
});

describe('FR2: formatExtractionBadge', () => {
  it('formats singular counts correctly', () => {
    expect(formatExtractionBadge({ facts: 1, summaries: 1 })).toBe('1 fact, 1 summary');
  });

  it('formats plural counts correctly', () => {
    expect(formatExtractionBadge({ facts: 3, summaries: 2 })).toBe('3 facts, 2 summaries');
  });

  it('formats zero counts', () => {
    expect(formatExtractionBadge({ facts: 0, summaries: 0 })).toBe('0 facts, 0 summaries');
  });

  it('handles mixed singular/plural', () => {
    expect(formatExtractionBadge({ facts: 1, summaries: 5 })).toBe('1 fact, 5 summaries');
    expect(formatExtractionBadge({ facts: 7, summaries: 1 })).toBe('7 facts, 1 summary');
  });
});

describe('FR2: shouldShowExtractionBadge', () => {
  it('returns true for builder mode', () => {
    expect(shouldShowExtractionBadge('builder')).toBe(true);
  });

  it('returns false for stream mode', () => {
    expect(shouldShowExtractionBadge('stream')).toBe(false);
  });

  it('returns false for undefined mode', () => {
    expect(shouldShowExtractionBadge(undefined)).toBe(false);
  });
});

describe('FR2: shouldShowFooter', () => {
  it('shows footer in builder mode when actions exist (Keep/Discard for pending items)', () => {
    expect(shouldShowFooter('builder', true, true)).toBe(true);
    expect(shouldShowFooter('builder', true, false)).toBe(true);
  });

  it('hides footer in builder mode when no actions (already triaged/saved items)', () => {
    expect(shouldShowFooter('builder', false, false)).toBe(false);
  });

  it('shows footer in stream mode when actions exist', () => {
    expect(shouldShowFooter('stream', true, false)).toBe(true);
    expect(shouldShowFooter('stream', false, true)).toBe(true);
    expect(shouldShowFooter('stream', true, true)).toBe(true);
  });

  it('hides footer in stream mode when no actions or navigation', () => {
    expect(shouldShowFooter('stream', false, false)).toBe(false);
  });

  it('shows footer when mode is undefined and has actions', () => {
    expect(shouldShowFooter(undefined, true, false)).toBe(true);
  });
});

// ─── FR3: ManualTab Empty State ─────────────────────────────────────────────

describe('FR3: computeManualTabEmpty', () => {
  it('returns empty state message when no facts or summaries', () => {
    const result = computeManualTabEmpty({ facts: [], summaries: [] });
    expect(result).toBe('No facts or summaries yet. Start extracting from this source.');
  });

  it('returns null when facts exist', () => {
    const result = computeManualTabEmpty({
      facts: [{ id: 1, fact: 'test' }],
      summaries: [],
    });
    expect(result).toBeNull();
  });

  it('returns null when summaries exist', () => {
    const result = computeManualTabEmpty({
      facts: [],
      summaries: [{ id: 1, text: ['test'] }],
    });
    expect(result).toBeNull();
  });

  it('returns null when both facts and summaries exist', () => {
    const result = computeManualTabEmpty({
      facts: [{ id: 1, fact: 'test' }],
      summaries: [{ id: 1, text: ['test'] }],
    });
    expect(result).toBeNull();
  });
});
