/**
 * Spec 04 - NotesTab orchestrator tests.
 *
 * Project convention: file-source assertions in Vitest `node` env
 * (no jsdom). We also unit-test the pure helpers (filter/sort/group/
 * paginate/computeStats) which are exported for that purpose.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyNoteFilters,
  sortNotes,
  computeNoteStats,
  groupBySource,
  groupByCategory,
  paginate,
} from '../NotesTab';
import type { Category, Note, Source } from '@/types/second-brain';

const tabSource = fs.readFileSync(
  new URL('../NotesTab.tsx', import.meta.url),
  'utf8',
);

const navSource = fs.readFileSync(
  new URL('../shared/navigation.ts', import.meta.url),
  'utf8',
);

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 1,
    brainliftId: 1,
    sourceId: null,
    categoryId: null,
    content: 'hello world',
    createdAt: '2026-05-18T10:00:00.000Z',
    updatedAt: '2026-05-18T10:00:00.000Z',
    ...over,
  };
}

function makeSource(over: Partial<Source> = {}): Source {
  return {
    id: 1,
    brainliftId: 1,
    title: 'Source One',
    url: 'https://example.com',
    author: 'A',
    categoryId: 1,
    extractedContent: null,
    learningStreamItemId: null,
    type: 'article',
    keyInsights: null,
    length: null,
    whyMatters: null,
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    ...over,
  };
}

function makeCategory(over: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Things',
    sortOrder: 0,
    ...over,
  };
}

describe('FR1 NotesTab shell wiring', () => {
  it('exports the orchestrator with the slug-only props contract', () => {
    expect(tabSource).toContain('export interface NotesTabProps');
    expect(tabSource).toMatch(/slug: string/);
    expect(tabSource).toContain('export function NotesTab');
  });

  it('reads ?filterSource / ?filterCategory once on mount and clears the URL', () => {
    expect(tabSource).toContain('useSearch');
    expect(tabSource).toContain("params.get('filterSource')");
    expect(tabSource).toContain("params.get('filterCategory')");
    expect(tabSource).toContain("params.delete('filterSource')");
    expect(tabSource).toContain("params.delete('filterCategory')");
    expect(tabSource).toContain('window.history.replaceState');
    expect(tabSource).toContain("new PopStateEvent('popstate')");
  });

  it('defaults view mode to by-source (research Decision 1)', () => {
    expect(tabSource).toMatch(/useState<NotesViewMode>\('by-source'\)/);
  });

  it('resets page on filter changes and resets page + clears selection on view-mode change', () => {
    expect(tabSource).toMatch(/setCurrentPage\(1\)[\s\S]*search, categoryFilter, sourceFilter, linkedStatus, sortBy/);
    expect(tabSource).toMatch(/setSelectedIds\(new Set\(\)\)[\s\S]*\[viewMode\]/);
  });
});

describe('FR2 stat strip computations', () => {
  it('computeNoteStats counts total / linked / standalone / connectedSources', () => {
    const notes = [
      makeNote({ id: 1, sourceId: 10 }),
      makeNote({ id: 2, sourceId: 10 }),
      makeNote({ id: 3, sourceId: 20 }),
      makeNote({ id: 4, sourceId: null }),
      makeNote({ id: 5, sourceId: null }),
    ];
    expect(computeNoteStats(notes)).toEqual({
      total: 5,
      linked: 3,
      standalone: 2,
      connectedSources: 2,
    });
  });

  it('handles empty list', () => {
    expect(computeNoteStats([])).toEqual({
      total: 0, linked: 0, standalone: 0, connectedSources: 0,
    });
  });
});

describe('FR3 filter helpers', () => {
  const notes = [
    makeNote({ id: 1, content: 'apples are great', sourceId: 10, categoryId: 1 }),
    makeNote({ id: 2, content: 'bananas yellow',   sourceId: 20, categoryId: 2 }),
    makeNote({ id: 3, content: 'apple pie',        sourceId: null, categoryId: 1 }),
    makeNote({ id: 4, content: 'cherry tart',      sourceId: null, categoryId: null }),
  ];

  it('search filters case-insensitively over content', () => {
    const result = applyNoteFilters(notes, {
      search: 'APPLE', categoryFilter: null, sourceFilter: null, linkedStatus: 'all',
    });
    expect(result.map((n) => n.id)).toEqual([1, 3]);
  });

  it('categoryFilter narrows by categoryId', () => {
    const result = applyNoteFilters(notes, {
      search: '', categoryFilter: 1, sourceFilter: null, linkedStatus: 'all',
    });
    expect(result.map((n) => n.id)).toEqual([1, 3]);
  });

  it('sourceFilter narrows by sourceId', () => {
    const result = applyNoteFilters(notes, {
      search: '', categoryFilter: null, sourceFilter: 10, linkedStatus: 'all',
    });
    expect(result.map((n) => n.id)).toEqual([1]);
  });

  it("linkedStatus='linked' keeps only sourceId != null", () => {
    const result = applyNoteFilters(notes, {
      search: '', categoryFilter: null, sourceFilter: null, linkedStatus: 'linked',
    });
    expect(result.map((n) => n.id)).toEqual([1, 2]);
  });

  it("linkedStatus='standalone' keeps only sourceId == null", () => {
    const result = applyNoteFilters(notes, {
      search: '', categoryFilter: null, sourceFilter: null, linkedStatus: 'standalone',
    });
    expect(result.map((n) => n.id)).toEqual([3, 4]);
  });

  it('filters compose with AND', () => {
    const result = applyNoteFilters(notes, {
      search: 'apple', categoryFilter: 1, sourceFilter: null, linkedStatus: 'standalone',
    });
    expect(result.map((n) => n.id)).toEqual([3]);
  });
});

describe('sortNotes', () => {
  const a = makeNote({ id: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-10T00:00:00Z' });
  const b = makeNote({ id: 2, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-01-15T00:00:00Z' });

  it('newest sorts by createdAt desc', () => {
    expect(sortNotes([a, b], 'newest').map((n) => n.id)).toEqual([2, 1]);
  });
  it('oldest sorts by createdAt asc', () => {
    expect(sortNotes([a, b], 'oldest').map((n) => n.id)).toEqual([1, 2]);
  });
  it('last-edited sorts by updatedAt desc', () => {
    expect(sortNotes([a, b], 'last-edited').map((n) => n.id)).toEqual([1, 2]);
  });
});

describe('FR4 group helpers', () => {
  it('groupBySource emits one group per source with notes, standalone last, empty omitted', () => {
    const notes = [
      makeNote({ id: 1, sourceId: 10 }),
      makeNote({ id: 2, sourceId: 20 }),
      makeNote({ id: 3, sourceId: null }),
    ];
    const sources = [
      makeSource({ id: 10, title: 'Ten' }),
      makeSource({ id: 20, title: 'Twenty' }),
      makeSource({ id: 30, title: 'Thirty (empty)' }), // should be omitted
    ];
    const groups = groupBySource(notes, sources);
    expect(groups.map((g) => g.key)).toEqual(['source-10', 'source-20', 'standalone']);
    expect(groups.find((g) => g.key === 'source-30')).toBeUndefined();
    expect(groups[2].badge).toBe('STANDALONE');
  });

  it('groupByCategory emits one group per category, uncategorized last, empty omitted', () => {
    const notes = [
      makeNote({ id: 1, categoryId: 1 }),
      makeNote({ id: 2, categoryId: 2 }),
      makeNote({ id: 3, categoryId: null }),
    ];
    const categories = [
      makeCategory({ id: 1, name: 'Alpha', sortOrder: 0 }),
      makeCategory({ id: 2, name: 'Beta', sortOrder: 1 }),
      makeCategory({ id: 99, name: 'Empty', sortOrder: 2 }), // omitted
    ];
    const groups = groupByCategory(notes, categories);
    expect(groups.map((g) => g.key)).toEqual(['category-1', 'category-2', 'uncategorized']);
  });

  it('groupByCategory respects sortOrder', () => {
    const notes = [
      makeNote({ id: 1, categoryId: 1 }),
      makeNote({ id: 2, categoryId: 2 }),
    ];
    const categories = [
      makeCategory({ id: 1, name: 'Alpha', sortOrder: 5 }),
      makeCategory({ id: 2, name: 'Beta',  sortOrder: 1 }),
    ];
    const groups = groupByCategory(notes, categories);
    expect(groups.map((g) => g.key)).toEqual(['category-2', 'category-1']);
  });
});

describe('paginate', () => {
  it('returns the slice for a given page + computes totalPages', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const r1 = paginate(items, 1, 24);
    expect(r1.slice.length).toBe(24);
    expect(r1.slice[0]).toBe(0);
    expect(r1.totalPages).toBe(3);

    const r3 = paginate(items, 3, 24);
    expect(r3.slice.length).toBe(2);
  });

  it('clamps over-range pages', () => {
    expect(paginate([1, 2, 3], 99, 24).slice).toEqual([1, 2, 3]);
  });
});

describe('FR4 grid + group rendering hooks', () => {
  it('grid uses 4-col responsive breakpoints', () => {
    expect(tabSource).toContain('grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4');
  });

  it('renders 24 per page (PAGE_SIZE constant)', () => {
    expect(tabSource).toContain('const PAGE_SIZE = 24');
  });

  it('group disclosure threshold is 12', () => {
    expect(tabSource).toContain('const GROUP_DISCLOSURE_THRESHOLD = 12');
  });

  it('declares the view modes', () => {
    expect(tabSource).toContain("'by-source'");
    expect(tabSource).toContain("'by-category'");
  });
});

describe('FR9 bulk select wiring', () => {
  it('uses BulkActionBar with Recategorize + Delete (destructive)', () => {
    expect(tabSource).toContain("label: 'Recategorize'");
    expect(tabSource).toContain("label: 'Delete'");
    expect(tabSource).toContain("variant: 'destructive'");
  });

  it('imports both bulk mutation hooks', () => {
    expect(tabSource).toContain('useBulkDeleteNotes');
    expect(tabSource).toContain('useBulkRecategorizeNotes');
  });

  it('clears selection after successful bulk mutation', () => {
    // Two call-sites — one for delete, one for recategorize.
    const matches = tabSource.match(/clearSelection\(\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a recategorize modal with a Clear-category option (null = clear)', () => {
    expect(tabSource).toContain('Recategorize {selectedIds.size} note(s)');
    expect(tabSource).toContain('Clear category (Uncategorized)');
  });
});

describe('FR12 cross-tab nav out', () => {
  it('Jump to source dispatches navigateToSubTab to research-materials', () => {
    expect(tabSource).toMatch(/navigateToSubTab\('research-materials'\)/);
  });

  it('navigateToSubTab writes ?sb and dispatches popstate', () => {
    // The helper now lives in shared/navigation.ts and uses pushState so the
    // browser Back button returns the user to where they came from.
    expect(navSource).toContain("searchParams.set('sb', target)");
    expect(navSource).toContain('window.history.pushState');
    expect(navSource).toContain('new PopStateEvent');
  });
});

describe('Empty states', () => {
  it('zero notes shows initial empty copy', () => {
    expect(tabSource).toContain('Your notes will appear here.');
  });

  it('zero filtered shows filtered empty copy + Clear filters', () => {
    expect(tabSource).toContain('No notes match your filters.');
    expect(tabSource).toContain('Clear filters');
  });
});
