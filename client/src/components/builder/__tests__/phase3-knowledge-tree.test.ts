/**
 * Tests for 03-list-view: Phase 3 Knowledge Tree List View
 *
 * FR1: useKnowledgeTree hook logic (query config, mutation behavior, defaults)
 * FR2: Phase3KnowledgeTree shell (section ordering, header, loading)
 * FR3: UnprocessedCard (Keep=bookmark, Discard=remove, card click=navigate)
 * FR4: TriagedCard and SavedItemCard (display, navigation)
 * FR5: SwarmStatusBar (visibility based on research.isRunning)
 * FR6: ManualSourceForm (validation, submit, duplicate error)
 * FR7: Empty states and relaunch (conditions, messages)
 *
 * Tests pure logic extracted into knowledge-tree-helpers.ts.
 * React rendering is a thin layer tested manually.
 */

import { describe, it, expect } from 'vitest';
import {
  computeEmptyState,
  validateManualSource,
  buildItemDetailUrl,
  buildMissionDashboardUrl,
  computeSectionCounts,
  computeSwarmVisibility,
  computeRelaunchState,
  formatExtractionCounts,
} from '../knowledge-tree-helpers';

// ─── Test Data ──────────────────────────────────────────────────────────────

const samplePendingItem = {
  id: 1,
  brainliftId: 5,
  type: 'Substack',
  author: 'Alice',
  topic: 'AI Research',
  time: '5 min',
  facts: 'Key findings about AI advances in 2026.',
  url: 'https://example.com/ai-research',
  status: 'pending' as const,
  source: 'quick-search' as const,
  categoryId: null,
  createdAt: '2026-03-18T00:00:00Z',
  updatedAt: '2026-03-18T00:00:00Z',
};

const sampleBookmarkedItem = {
  ...samplePendingItem,
  id: 2,
  status: 'bookmarked' as const,
  topic: 'ML Advances',
  url: 'https://example.com/ml',
};

const sampleSavedItem = {
  id: 3,
  title: 'Deep Learning',
  url: 'https://example.com/dl',
  type: 'Academic Paper',
  author: 'Bob',
  excerpt: 'Comprehensive overview of DL.',
  createdAt: '2026-03-17T00:00:00Z',
  factCount: 3,
  summaryCount: 2,
  hasSavedMinimum: true,
  categoryId: 1,
  categoryName: 'Machine Learning',
};

// ─── FR1: Hook Logic (Defaults, Query Config) ──────────────────────────────

describe('FR1: useKnowledgeTree defaults', () => {
  it('computeSectionCounts returns zero for empty arrays', () => {
    const counts = computeSectionCounts([], [], []);
    expect(counts).toEqual({ unprocessed: 0, triaged: 0, saved: 0 });
  });

  it('computeSectionCounts returns correct counts', () => {
    const counts = computeSectionCounts(
      [samplePendingItem, { ...samplePendingItem, id: 10 }],
      [sampleBookmarkedItem],
      [sampleSavedItem, { ...sampleSavedItem, id: 4 }]
    );
    expect(counts).toEqual({ unprocessed: 2, triaged: 1, saved: 2 });
  });
});

// ─── FR2: Phase3KnowledgeTree Shell ─────────────────────────────────────────

describe('FR2: Section counts and header', () => {
  it('section labels include correct counts', () => {
    const counts = computeSectionCounts(
      [samplePendingItem],
      [sampleBookmarkedItem],
      [sampleSavedItem]
    );
    expect(counts.unprocessed).toBe(1);
    expect(counts.triaged).toBe(1);
    expect(counts.saved).toBe(1);
  });
});

// ─── FR3: UnprocessedCard Open/Skip ─────────────────────────────────────────

describe('FR3: Keep/Discard actions and card navigation', () => {
  it('card click navigates to item detail URL with screen=3 and item param', () => {
    const url = buildItemDetailUrl(42);
    expect(url).toContain('screen=3');
    expect(url).toContain('item=42');
  });

  it('detail URL preserves screen param', () => {
    const url = buildItemDetailUrl(7);
    expect(url).toBe('?screen=3&item=7');
  });
});

// ─── FR4: TriagedCard and SavedItemCard ─────────────────────────────────────

describe('FR4: Card display helpers', () => {
  it('buildItemDetailUrl works for triaged item navigation', () => {
    const url = buildItemDetailUrl(sampleBookmarkedItem.id);
    expect(url).toBe('?screen=3&item=2');
  });

  it('buildItemDetailUrl works for saved item navigation', () => {
    const url = buildItemDetailUrl(sampleSavedItem.id);
    expect(url).toBe('?screen=3&item=3');
  });

  it('formatExtractionCounts formats singular and plural correctly', () => {
    expect(formatExtractionCounts(1, 1)).toBe('1 fact, 1 summary');
    expect(formatExtractionCounts(3, 2)).toBe('3 facts, 2 summaries');
    expect(formatExtractionCounts(0, 0)).toBe('0 facts, 0 summaries');
    expect(formatExtractionCounts(1, 5)).toBe('1 fact, 5 summaries');
  });
});

// ─── FR5: SwarmStatusBar ────────────────────────────────────────────────────

describe('FR5: SwarmStatusBar visibility', () => {
  it('visible when isRunning is true', () => {
    expect(computeSwarmVisibility({ isRunning: true, canRelaunch: false })).toBe(true);
  });

  it('hidden when isRunning is false', () => {
    expect(computeSwarmVisibility({ isRunning: false, canRelaunch: true })).toBe(false);
  });

  it('buildMissionDashboardUrl returns correct LS tab URL', () => {
    const url = buildMissionDashboardUrl('my-brainlift');
    expect(url).toBe('/grading/my-brainlift?tab=learning-stream');
  });
});

// ─── FR6: ManualSourceForm Validation ───────────────────────────────────────

describe('FR6: Manual source validation', () => {
  it('valid URL and title passes validation', () => {
    const result = validateManualSource('https://example.com/article', 'My Article');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('empty URL fails validation', () => {
    const result = validateManualSource('', 'Title');
    expect(result.valid).toBe(false);
    expect(result.errors.url).toBeDefined();
  });

  it('non-http URL fails validation', () => {
    const result = validateManualSource('javascript:alert(1)', 'XSS');
    expect(result.valid).toBe(false);
    expect(result.errors.url).toBeDefined();
  });

  it('ftp URL fails validation', () => {
    const result = validateManualSource('ftp://files.example.com/doc', 'FTP Doc');
    expect(result.valid).toBe(false);
    expect(result.errors.url).toBeDefined();
  });

  it('empty title fails validation', () => {
    const result = validateManualSource('https://example.com', '');
    expect(result.valid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it('whitespace-only title fails validation', () => {
    const result = validateManualSource('https://example.com', '   ');
    expect(result.valid).toBe(false);
    expect(result.errors.title).toBeDefined();
  });

  it('both fields invalid returns both errors', () => {
    const result = validateManualSource('', '');
    expect(result.valid).toBe(false);
    expect(result.errors.url).toBeDefined();
    expect(result.errors.title).toBeDefined();
  });

  it('malformed URL fails validation', () => {
    const result = validateManualSource('not-a-url', 'Title');
    expect(result.valid).toBe(false);
    expect(result.errors.url).toBeDefined();
  });
});

// ─── FR7: Empty States and Relaunch ─────────────────────────────────────────

describe('FR7: Empty state computation', () => {
  it('returns swarm-running state when research is active and no items', () => {
    const state = computeEmptyState({
      unprocessed: [],
      triaged: [],
      saved: [],
      research: { isRunning: true, canRelaunch: false },
    });
    expect(state).not.toBeNull();
    expect(state!.type).toBe('swarm-running');
    expect(state!.message).toContain('researched');
  });

  it('returns no-results state when swarm finished with zero items', () => {
    const state = computeEmptyState({
      unprocessed: [],
      triaged: [],
      saved: [],
      research: { isRunning: false, canRelaunch: true },
    });
    expect(state).not.toBeNull();
    expect(state!.type).toBe('no-results');
    expect(state!.message).toContain('didn');
  });

  it('returns null when triaged items exist (normal working state)', () => {
    const state = computeEmptyState({
      unprocessed: [],
      triaged: [sampleBookmarkedItem],
      saved: [],
      research: { isRunning: false, canRelaunch: true },
    });
    expect(state).toBeNull();
  });

  it('returns null when items exist across sections', () => {
    const state = computeEmptyState({
      unprocessed: [samplePendingItem],
      triaged: [sampleBookmarkedItem],
      saved: [sampleSavedItem],
      research: { isRunning: false, canRelaunch: false },
    });
    expect(state).toBeNull();
  });

  it('returns null when unprocessed items exist (not empty)', () => {
    const state = computeEmptyState({
      unprocessed: [samplePendingItem],
      triaged: [],
      saved: [],
      research: { isRunning: false, canRelaunch: false },
    });
    expect(state).toBeNull();
  });

  it('returns null when saved items exist (active workspace)', () => {
    const state = computeEmptyState({
      unprocessed: [],
      triaged: [],
      saved: [sampleSavedItem],
      research: { isRunning: false, canRelaunch: true },
    });
    expect(state).toBeNull();
  });
});

describe('FR7: Relaunch state', () => {
  it('ready when no unprocessed, has saved, triaged <= 10', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 3, savedCount: 2,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('ready');
  });

  it('hidden when unprocessed items exist', () => {
    const state = computeRelaunchState({
      unprocessedCount: 3, triagedCount: 0, savedCount: 0,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('hidden');
  });

  it('hidden when canRelaunch is false', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 0, savedCount: 1,
      canRelaunch: false, isRunning: false,
    });
    expect(state.type).toBe('hidden');
  });

  it('hidden when research is currently running', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 0, savedCount: 1,
      canRelaunch: true, isRunning: true,
    });
    expect(state.type).toBe('hidden');
  });

  it('needs-processing when triaged items exist but nothing saved yet', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 5, savedCount: 0,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('needs-processing');
    expect(state.message).toContain('extract');
  });

  it('backlog-too-large when triaged count exceeds 10', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 12, savedCount: 3,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('backlog-too-large');
    expect(state.message).toContain('12');
  });

  it('backlog-too-large when triaged is exactly 10 with saved items', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 10, savedCount: 1,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('backlog-too-large');
  });

  it('ready when triaged is 9 with saved items', () => {
    const state = computeRelaunchState({
      unprocessedCount: 0, triagedCount: 9, savedCount: 1,
      canRelaunch: true, isRunning: false,
    });
    expect(state.type).toBe('ready');
  });
});
