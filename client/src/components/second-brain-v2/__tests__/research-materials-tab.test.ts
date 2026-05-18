/**
 * Spec 03 FR11 — ResearchMaterialsTab orchestrator tests.
 *
 * File-source assertions. The orchestrator composes shared primitives
 * (toolbar, stat strip, chip strip, grid, drawer, bulk bar) and owns
 * local UI state (filters, selection, drawer-open id, modals).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const tab = fs.readFileSync(
  new URL('../ResearchMaterialsTab.tsx', import.meta.url),
  'utf8',
);

describe('FR11 ResearchMaterialsTab', () => {
  it('consumes the three data hooks', () => {
    expect(tab).toContain('useSources');
    expect(tab).toContain('useNotes');
    expect(tab).toContain('useCategories');
  });

  it('imports the shared spec-02 primitives it composes', () => {
    expect(tab).toContain('RightDrawer');
    expect(tab).toContain('StatCardStrip');
    expect(tab).toContain('CategoryChipStrip');
    expect(tab).toContain('FilterBar');
    expect(tab).toContain('BulkActionBar');
  });

  it('imports the spec-03 components it composes', () => {
    expect(tab).toContain('SourceGridCard');
    expect(tab).toContain('SourceDetailPanel');
    expect(tab).toContain('AddCategoryModal');
    expect(tab).toContain('RecategorizeModal');
    expect(tab).toContain('AddSourceModal');
  });

  it('owns the local filter / selection / drawer state', () => {
    // Each piece of state has a useState binding for it (destructured pair).
    expect(tab).toMatch(/\[search,\s*setSearch\]\s*=\s*useState/);
    expect(tab).toMatch(/\[categoryFilter,\s*setCategoryFilter\]\s*=\s*useState/);
    expect(tab).toMatch(/\[typeFilter,\s*setTypeFilter\]\s*=\s*useState/);
    expect(tab).toMatch(/\[sortBy,\s*setSortBy\]\s*=\s*useState/);
    expect(tab).toMatch(/\[currentPage,\s*setCurrentPage\]\s*=\s*useState/);
    expect(tab).toMatch(/\[selectedIds,\s*setSelectedIds\]\s*=\s*useState/);
    expect(tab).toMatch(/\[drawerSourceId,\s*setDrawerSourceId\]\s*=\s*useState/);
  });

  it('uses a Set for selectedIds so selection persists across pagination', () => {
    expect(tab).toMatch(/new Set<number>\(\)|Set<number>/);
  });

  it('renders the toolbar with search, category, type, sort, and trailing slots', () => {
    expect(tab).toMatch(/FilterBar\.Search/);
    expect(tab).toMatch(/FilterBar\.Select/);
    expect(tab).toMatch(/FilterBar\.Sort/);
    expect(tab).toMatch(/FilterBar\.Trailing/);
  });

  it('renders the 3-up stat strip (Saved sources / Notes / Categories)', () => {
    expect(tab).toMatch(/Saved sources|Sources/);
    expect(tab).toMatch(/Notes/);
    expect(tab).toMatch(/Categories/);
  });

  it('uses a 2-column responsive grid (md:grid-cols-2)', () => {
    expect(tab).toMatch(/md:grid-cols-2/);
  });

  it('paginates client-side at 12 per page', () => {
    expect(tab).toMatch(/12/);
    expect(tab).toMatch(/page/i);
  });

  it('syncs the chip strip and the category dropdown via a single categoryFilter state', () => {
    // Both surfaces read from / write to the same state setter.
    expect(tab).toMatch(/CategoryChipStrip/);
    // Either the same setter handles both, or both pipe through a single handler.
    expect(tab).toMatch(/setCategoryFilter|onCategoryChange/);
  });

  it('resets currentPage to 1 when any filter changes', () => {
    expect(tab).toMatch(/setCurrentPage\(1\)/);
  });

  it('opens the drawer with the clicked source id', () => {
    expect(tab).toMatch(/setDrawerSourceId/);
  });

  it('auto-closes the drawer when the open source disappears from the list', () => {
    // useEffect watches drawerSourceId + sources and clears when missing.
    expect(tab).toMatch(/useEffect[\s\S]*drawerSourceId/);
    expect(tab).toMatch(/setDrawerSourceId\(null\)/);
  });

  it('wires the "View linked notes" CTA through navigateToSubTab', () => {
    expect(tab).toContain('navigateToSubTab');
    expect(tab).toMatch(/filterSource/);
    expect(tab).toMatch(/['"]notes['"]/);
  });

  it('wires bulk delete via the bulkDeleteSources mutation', () => {
    expect(tab).toMatch(/bulkDeleteSources/);
    expect(tab).toMatch(/Array\.from\(selectedIds\)/);
  });

  it('wires bulk recategorize via the bulkRecategorizeSources mutation', () => {
    expect(tab).toMatch(/bulkRecategorizeSources/);
  });

  it('clears selection after a successful bulk action', () => {
    expect(tab).toMatch(/setSelectedIds\(new Set/);
  });

  it('renders an empty state when there are no sources', () => {
    expect(tab).toMatch(/No sources/i);
  });

  it('renders an empty state when filters reduce results to zero', () => {
    expect(tab).toMatch(/No sources match|no results/i);
  });

  it('passes a confirm gate before bulk delete (prevents accidental data loss)', () => {
    // window.confirm gate on bulk delete — selection is page-spanning,
    // so an accidental click could nuke many rows. The gate is required.
    expect(tab).toMatch(/window\.confirm/);
  });

  it('clamps currentPage when the filtered set shrinks below the current page', () => {
    // useEffect ensures currentPage stays within [1, totalPages].
    expect(tab).toMatch(/useEffect[\s\S]*currentPage\s*>\s*totalPages[\s\S]*setCurrentPage\(totalPages\)/);
  });

  it('wires the BulkActionBar with both move-to-category and delete actions', () => {
    // The BulkActionBar receives an actions array with 'Move to category' and 'Delete'.
    expect(tab).toMatch(/BulkActionBar/);
    expect(tab).toMatch(/Move to category/);
    expect(tab).toMatch(/['"]Delete['"]/);
    expect(tab).toMatch(/variant:\s*['"]destructive['"]/);
  });
});
