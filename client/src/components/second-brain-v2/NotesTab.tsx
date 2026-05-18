import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import {
  Plus,
  FileText,
  Link2,
  Unlink,
  BookOpen,
  Trash2,
  Tag,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { useNotes, useBulkDeleteNotes, useBulkRecategorizeNotes } from '@/hooks/useNotes';
import { useSources } from '@/hooks/useSources';
import { useCategories } from '@/hooks/useCategories';
import type { Category, Note, Source } from '@/types/second-brain';
import { RightDrawer } from './shared/RightDrawer';
import { StatCardStrip } from './shared/StatCardStrip';
import { CategoryChipStrip } from './shared/CategoryChipStrip';
import { FilterBar } from './shared/FilterBar';
import { SubTabStrip } from './shared/SubTabStrip';
import { BulkActionBar } from './shared/BulkActionBar';
import { NoteGridCard } from './cards/NoteGridCard';
import { NoteDetailPanel } from './drawer/NoteDetailPanel';
import { NewNoteModal } from './modals/NewNoteModal';

// ─── Types ──────────────────────────────────────────────────────────────

export interface NotesTabProps {
  slug: string;
}

export type NotesViewMode =
  | 'all-notes'
  | 'by-source'
  | 'by-category'
  | 'standalone'
  | 'recent';

export type NotesSort = 'newest' | 'oldest' | 'last-edited';
export type NotesLinkedStatus = 'all' | 'linked' | 'standalone';

const PAGE_SIZE = 24;
const GROUP_DISCLOSURE_THRESHOLD = 12;

const VIEW_MODE_TABS: ReadonlyArray<{ id: NotesViewMode; label: string }> = [
  { id: 'all-notes', label: 'All Notes' },
  { id: 'by-source', label: 'By Source' },
  { id: 'by-category', label: 'By Category' },
  { id: 'standalone', label: 'Standalone' },
  { id: 'recent', label: 'Recent' },
];

// ─── Pure helpers (testable from file-source assertions) ────────────────

/**
 * Apply search, category, source and linked-status filters with AND
 * semantics across axes. Sort is applied separately so view-mode
 * overrides (e.g., 'recent') can short-circuit.
 */
export function applyNoteFilters(
  notes: Note[],
  filters: {
    search: string;
    categoryFilter: number | null;
    sourceFilter: number | null;
    linkedStatus: NotesLinkedStatus;
  },
): Note[] {
  const search = filters.search.trim().toLowerCase();
  return notes.filter((n) => {
    if (search && !n.content.toLowerCase().includes(search)) return false;
    if (filters.categoryFilter != null && n.categoryId !== filters.categoryFilter) return false;
    if (filters.sourceFilter != null && n.sourceId !== filters.sourceFilter) return false;
    if (filters.linkedStatus === 'linked' && n.sourceId == null) return false;
    if (filters.linkedStatus === 'standalone' && n.sourceId != null) return false;
    return true;
  });
}

/**
 * Sort a note list. Returns a new array.
 */
export function sortNotes(notes: Note[], sort: NotesSort): Note[] {
  const copy = notes.slice();
  if (sort === 'newest') {
    copy.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  } else if (sort === 'oldest') {
    copy.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  } else if (sort === 'last-edited') {
    copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }
  return copy;
}

/**
 * Compute the 4 stat-strip numbers off the unfiltered note set.
 */
export function computeNoteStats(notes: Note[]): {
  total: number;
  linked: number;
  standalone: number;
  connectedSources: number;
} {
  let linked = 0;
  let standalone = 0;
  const sourceIds = new Set<number>();
  for (const n of notes) {
    if (n.sourceId != null) {
      linked += 1;
      sourceIds.add(n.sourceId);
    } else {
      standalone += 1;
    }
  }
  return {
    total: notes.length,
    linked,
    standalone,
    connectedSources: sourceIds.size,
  };
}

export interface NoteGroup {
  /** Stable key for React. */
  key: string;
  /** Display label. */
  label: string;
  /** Optional sub-label (e.g., source type). */
  badge?: string;
  /** Optional source id (for the 'Open in Research Materials' link). */
  sourceId?: number;
  /** Cards in this group, already sorted. */
  notes: Note[];
}

/**
 * Group notes by source. Empty groups are not rendered. Standalone is
 * always last. Group order follows `sources` array order (caller sorts
 * by createdAt desc when needed).
 */
export function groupBySource(
  notes: Note[],
  sources: Source[],
): NoteGroup[] {
  const bySource = new Map<number, Note[]>();
  const standalone: Note[] = [];
  for (const n of notes) {
    if (n.sourceId == null) {
      standalone.push(n);
    } else {
      const bucket = bySource.get(n.sourceId);
      if (bucket) {
        bucket.push(n);
      } else {
        bySource.set(n.sourceId, [n]);
      }
    }
  }

  const groups: NoteGroup[] = [];
  for (const source of sources) {
    const bucket = bySource.get(source.id);
    if (bucket && bucket.length > 0) {
      groups.push({
        key: `source-${source.id}`,
        label: source.title,
        badge: source.type ?? undefined,
        sourceId: source.id,
        notes: bucket,
      });
    }
  }
  if (standalone.length > 0) {
    groups.push({
      key: 'standalone',
      label: 'Standalone notes',
      badge: 'STANDALONE',
      notes: standalone,
    });
  }
  return groups;
}

/**
 * Group notes by category. Empty groups not rendered. Uncategorized last.
 */
export function groupByCategory(
  notes: Note[],
  categories: Category[],
): NoteGroup[] {
  const byCategory = new Map<number, Note[]>();
  const uncategorized: Note[] = [];
  for (const n of notes) {
    if (n.categoryId == null) {
      uncategorized.push(n);
    } else {
      const bucket = byCategory.get(n.categoryId);
      if (bucket) {
        bucket.push(n);
      } else {
        byCategory.set(n.categoryId, [n]);
      }
    }
  }

  const sorted = categories
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const groups: NoteGroup[] = [];
  for (const category of sorted) {
    const bucket = byCategory.get(category.id);
    if (bucket && bucket.length > 0) {
      groups.push({
        key: `category-${category.id}`,
        label: category.name,
        notes: bucket,
      });
    }
  }
  if (uncategorized.length > 0) {
    groups.push({
      key: 'uncategorized',
      label: 'Uncategorized',
      notes: uncategorized,
    });
  }
  return groups;
}

/**
 * Slice a flat list into a page. Returns the slice + total page count.
 */
export function paginate<T>(items: T[], page: number, pageSize: number): {
  slice: T[];
  totalPages: number;
} {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { slice: items.slice(start, start + pageSize), totalPages };
}

/**
 * Inline equivalent of spec 03's `navigateToSubTab` for cross-tab nav.
 * Writes `?sb=<tab>` and triggers `popstate` so the shell picks it up.
 */
function navigateToSubTab(tab: string): void {
  const params = new URLSearchParams(window.location.search);
  params.set('sb', tab);
  // Drop one-shot params so they don't leak across tabs.
  params.delete('filterSource');
  params.delete('filterCategory');
  const search = params.toString();
  const url = search ? `?${search}` : window.location.pathname;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// ─── Component ──────────────────────────────────────────────────────────

export function NotesTab({ slug }: NotesTabProps) {
  const searchString = useSearch();
  const { data: notes, updateNote, deleteNote } = useNotes(slug);
  const { data: sources } = useSources(slug);
  const { data: categories } = useCategories(slug);
  const bulkDelete = useBulkDeleteNotes(slug);
  const bulkRecategorize = useBulkRecategorizeNotes(slug);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [sourceFilter, setSourceFilter] = useState<number | null>(null);
  const [linkedStatus, setLinkedStatus] = useState<NotesLinkedStatus>('all');
  const [sortBy, setSortBy] = useState<NotesSort>('newest');
  const [viewMode, setViewMode] = useState<NotesViewMode>('by-source');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerNoteId, setDrawerNoteId] = useState<number | null>(null);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [recategorizeTarget, setRecategorizeTarget] = useState<number | null | undefined>(undefined);

  // One-shot read of ?filterSource / ?filterCategory on mount.
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const filterSource = params.get('filterSource');
    const filterCategory = params.get('filterCategory');
    let mutated = false;
    if (filterSource) {
      const id = Number(filterSource);
      if (Number.isFinite(id)) setSourceFilter(id);
      params.delete('filterSource');
      mutated = true;
    }
    if (filterCategory) {
      const id = Number(filterCategory);
      if (Number.isFinite(id)) setCategoryFilter(id);
      params.delete('filterCategory');
      mutated = true;
    }
    if (mutated) {
      // Preserve the ?sb=notes context (and anything else) but drop our one-shot params.
      const next = params.toString();
      const url = next ? `?${next}` : window.location.pathname;
      window.history.replaceState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset page on filter changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter, sourceFilter, linkedStatus, sortBy]);

  // Reset page + clear selection on view-mode change.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [viewMode]);

  const noteList = useMemo(() => notes ?? [], [notes]);
  const sourceList = useMemo(() => sources ?? [], [sources]);
  const categoryList = useMemo(() => categories ?? [], [categories]);

  const stats = useMemo(() => computeNoteStats(noteList), [noteList]);

  // Source / Category lookup maps.
  const sourceById = useMemo(() => {
    const m = new Map<number, Source>();
    for (const s of sourceList) m.set(s.id, s);
    return m;
  }, [sourceList]);
  const categoryById = useMemo(() => {
    const m = new Map<number, Category>();
    for (const c of categoryList) m.set(c.id, c);
    return m;
  }, [categoryList]);

  // Filtered + sorted base list (filters apply regardless of view).
  const filtered = useMemo(() => {
    const f = applyNoteFilters(noteList, {
      search,
      categoryFilter,
      sourceFilter,
      linkedStatus,
    });
    // 'recent' view forces newest sort regardless of dropdown.
    return sortNotes(f, viewMode === 'recent' ? 'newest' : sortBy);
  }, [noteList, search, categoryFilter, sourceFilter, linkedStatus, sortBy, viewMode]);

  // Standalone-only narrowing for the 'standalone' view.
  const flatForView = useMemo(() => {
    if (viewMode === 'standalone') {
      return filtered.filter((n) => n.sourceId == null);
    }
    return filtered;
  }, [filtered, viewMode]);

  // Pagination (flat views only).
  const { slice: pageSlice, totalPages } = useMemo(
    () => paginate(flatForView, currentPage, PAGE_SIZE),
    [flatForView, currentPage],
  );

  // Source ordering for groups: createdAt desc.
  const sourcesByRecent = useMemo(() => {
    return sourceList
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [sourceList]);

  const groups = useMemo<NoteGroup[]>(() => {
    if (viewMode === 'by-source') return groupBySource(filtered, sourcesByRecent);
    if (viewMode === 'by-category') return groupByCategory(filtered, categoryList);
    return [];
  }, [viewMode, filtered, sourcesByRecent, categoryList]);

  const isGroupView = viewMode === 'by-source' || viewMode === 'by-category';

  // Categories prop for chip strip / select.
  const categoryChips = useMemo(
    () => categoryList.map((c) => ({ id: c.id, name: c.name })),
    [categoryList],
  );

  const categorySelectOptions = useMemo(
    () => categoryList.map((c) => ({ value: String(c.id), label: c.name })),
    [categoryList],
  );

  const sourceSelectOptions = useMemo(
    () => sourceList.map((s) => ({ value: String(s.id), label: s.title })),
    [sourceList],
  );

  // Selection helpers.
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Drawer wiring.
  const drawerNote = useMemo<Note | null>(() => {
    if (drawerNoteId == null) return null;
    return noteList.find((n) => n.id === drawerNoteId) ?? null;
  }, [drawerNoteId, noteList]);
  const drawerLinkedSource: Source | null = drawerNote?.sourceId != null
    ? sourceById.get(drawerNote.sourceId) ?? null
    : null;
  const drawerCategory: Category | null = drawerNote?.categoryId != null
    ? categoryById.get(drawerNote.categoryId) ?? null
    : null;

  const handleDrawerSave = useCallback(
    async (patch: { content?: string; categoryId?: number | null; sourceId?: number | null }) => {
      if (drawerNoteId == null) return;
      await updateNote(drawerNoteId, patch);
    },
    [drawerNoteId, updateNote],
  );

  const handleDrawerDelete = useCallback(async () => {
    if (drawerNoteId == null) return;
    await deleteNote(drawerNoteId);
    setDrawerNoteId(null);
  }, [drawerNoteId, deleteNote]);

  const handleJumpToSource = useCallback((_sourceId: number) => {
    setDrawerNoteId(null);
    navigateToSubTab('research-materials');
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = window.confirm(`Delete ${selectedIds.size} note(s)? This cannot be undone.`);
    if (!ok) return;
    await bulkDelete.mutateAsync(Array.from(selectedIds));
    clearSelection();
  }, [selectedIds, bulkDelete, clearSelection]);

  const handleOpenRecategorize = useCallback(() => {
    setRecategorizeTarget(null);
  }, []);

  const handleConfirmRecategorize = useCallback(async () => {
    if (selectedIds.size === 0 || recategorizeTarget === undefined) return;
    await bulkRecategorize.mutateAsync({
      ids: Array.from(selectedIds),
      categoryId: recategorizeTarget,
    });
    setRecategorizeTarget(undefined);
    clearSelection();
  }, [selectedIds, recategorizeTarget, bulkRecategorize, clearSelection]);

  // Render helpers.
  const renderCard = (note: Note) => (
    <NoteGridCard
      key={note.id}
      note={note}
      category={note.categoryId != null ? categoryById.get(note.categoryId) ?? null : null}
      isLinked={note.sourceId != null}
      isSelected={selectedIds.has(note.id)}
      onToggleSelect={() => toggleSelect(note.id)}
      onOpenDetail={() => setDrawerNoteId(note.id)}
    />
  );

  const empty = noteList.length === 0;
  const filteredEmpty = !empty && flatForView.length === 0 && !isGroupView;
  const groupsEmpty = !empty && isGroupView && groups.length === 0;

  return (
    <section className="flex flex-col gap-6">
      <StatCardStrip
        cards={[
          { icon: FileText, count: stats.total, label: 'Total notes', accent: 'muted' },
          { icon: Link2, count: stats.linked, label: 'Linked notes', accent: 'info' },
          { icon: Unlink, count: stats.standalone, label: 'Standalone notes', accent: 'primary' },
          { icon: BookOpen, count: stats.connectedSources, label: 'Connected sources', accent: 'success' },
        ]}
      />

      <CategoryChipStrip
        categories={categoryChips}
        activeCategoryId={categoryFilter}
        onChange={setCategoryFilter}
      />

      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search notes"
          ariaLabel="Search notes"
        />
        <FilterBar.Select
          value={categoryFilter == null ? null : String(categoryFilter)}
          options={categorySelectOptions}
          onChange={(v) => setCategoryFilter(v == null ? null : Number(v))}
          placeholder="Category"
          ariaLabel="Filter by category"
        />
        <FilterBar.Select
          value={sourceFilter == null ? null : String(sourceFilter)}
          options={sourceSelectOptions}
          onChange={(v) => setSourceFilter(v == null ? null : Number(v))}
          placeholder="Source"
          ariaLabel="Filter by source"
        />
        <FilterBar.Segment
          value={linkedStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'linked', label: 'Linked' },
            { value: 'standalone', label: 'Standalone' },
          ]}
          onChange={(v) => setLinkedStatus(v as NotesLinkedStatus)}
          ariaLabel="Linked status"
        />
        <FilterBar.Sort
          value={sortBy}
          options={[
            { value: 'newest', label: 'Newest' },
            { value: 'oldest', label: 'Oldest' },
            { value: 'last-edited', label: 'Last edited' },
          ]}
          onChange={(v) => setSortBy(v as NotesSort)}
          ariaLabel="Sort notes"
        />
        <FilterBar.Trailing>
          <button
            type="button"
            onClick={() => setIsNewNoteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 font-sans text-[13px] font-medium text-primary-foreground shadow-card hover:bg-primary/90"
          >
            <Plus size={14} aria-hidden /> New Note
          </button>
        </FilterBar.Trailing>
      </FilterBar>

      <SubTabStrip
        tabs={VIEW_MODE_TABS}
        active={viewMode}
        onChange={setViewMode}
        layoutIdPrefix="notes-view-mode"
      />

      {empty ? (
        <div className="rounded-xl bg-card-elevated p-10 text-center shadow-card">
          <p className="m-0 font-serif text-[16px] italic text-muted-foreground">
            Your notes will appear here. Capture an idea with + New Note.
          </p>
        </div>
      ) : null}

      {filteredEmpty || groupsEmpty ? (
        <div className="rounded-xl bg-card-elevated p-10 text-center shadow-card">
          <p className="m-0 font-serif text-[16px] italic text-muted-foreground">
            No notes match your filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategoryFilter(null);
              setSourceFilter(null);
              setLinkedStatus('all');
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-foreground shadow-card hover:bg-muted"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {!empty && !isGroupView && !filteredEmpty ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageSlice.map(renderCard)}
          </div>
          {totalPages > 1 ? (
            <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Pagination">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-foreground shadow-card hover:bg-muted disabled:opacity-50"
              >
                Prev
              </button>
              <span className="font-sans text-[12px] uppercase tracking-[0.22em] text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-foreground shadow-card hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          ) : null}
        </>
      ) : null}

      {!empty && isGroupView && !groupsEmpty ? (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <NoteGroupSection
              key={group.key}
              group={group}
              renderCard={renderCard}
              onOpenSource={() => navigateToSubTab('research-materials')}
            />
          ))}
        </div>
      ) : null}

      <RightDrawer
        open={drawerNote != null}
        onClose={() => setDrawerNoteId(null)}
        ariaLabel="Note detail"
      >
        {drawerNote ? (
          <NoteDetailPanel
            slug={slug}
            note={drawerNote}
            linkedSource={drawerLinkedSource}
            category={drawerCategory}
            categories={categoryList}
            onClose={() => setDrawerNoteId(null)}
            onSave={handleDrawerSave}
            onDelete={handleDrawerDelete}
            onJumpToSource={handleJumpToSource}
          />
        ) : null}
      </RightDrawer>

      <BulkActionBar
        selectionCount={selectedIds.size}
        onClear={clearSelection}
        actions={[
          {
            label: 'Recategorize',
            icon: Tag,
            onClick: handleOpenRecategorize,
            disabled: bulkRecategorize.isPending,
          },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive',
            onClick: handleBulkDelete,
            disabled: bulkDelete.isPending,
          },
        ]}
      />

      {recategorizeTarget !== undefined ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Recategorize notes">
          <div
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setRecategorizeTarget(undefined)}
          />
          <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl bg-card shadow-card-hover">
            <header className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="m-0 font-sans text-[16px] font-semibold text-foreground">
                Recategorize {selectedIds.size} note(s)
              </h2>
              <button
                type="button"
                onClick={() => setRecategorizeTarget(undefined)}
                aria-label="Close modal"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
            </header>
            <div className="px-6 py-5">
              <label className="block">
                <span className="mb-1 block font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Move to category
                </span>
                <select
                  value={recategorizeTarget === null ? '' : String(recategorizeTarget)}
                  onChange={(event) => {
                    const v = event.target.value;
                    setRecategorizeTarget(v === '' ? null : Number(v));
                  }}
                  className="w-full appearance-none rounded-lg bg-card-elevated px-3 py-2.5 font-serif text-[14px] text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">Clear category (Uncategorized)</option>
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-border bg-card-elevated px-6 py-3">
              <button
                type="button"
                onClick={() => setRecategorizeTarget(undefined)}
                disabled={bulkRecategorize.isPending}
                className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground shadow-card hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRecategorize}
                disabled={bulkRecategorize.isPending}
                className="rounded-md bg-primary px-3 py-1.5 font-sans text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {bulkRecategorize.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <NewNoteModal
        slug={slug}
        open={isNewNoteOpen}
        onClose={() => setIsNewNoteOpen(false)}
        defaultCategoryId={categoryFilter ?? undefined}
        defaultSourceId={sourceFilter ?? undefined}
      />
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

interface NoteGroupSectionProps {
  group: NoteGroup;
  renderCard: (note: Note) => JSX.Element;
  onOpenSource: () => void;
}

function NoteGroupSection({ group, renderCard, onOpenSource }: NoteGroupSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded
    ? group.notes
    : group.notes.slice(0, GROUP_DISCLOSURE_THRESHOLD);
  const hidden = Math.max(0, group.notes.length - visible.length);

  return (
    <section className="flex flex-col gap-3" data-testid="note-group">
      <header className="flex items-center gap-3 border-b border-border pb-2">
        {group.badge ? (
          <span className="inline-flex items-center rounded-full bg-card px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-card">
            {group.badge}
          </span>
        ) : null}
        <h3 className="m-0 truncate font-sans text-[15px] font-semibold text-foreground" title={group.label}>
          {group.label}
        </h3>
        <span className="font-sans text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          {group.notes.length} note{group.notes.length === 1 ? '' : 's'}
        </span>
        {group.sourceId != null ? (
          <button
            type="button"
            onClick={onOpenSource}
            className="ml-auto inline-flex items-center gap-1 font-sans text-[11px] font-medium text-primary hover:underline"
            data-testid="note-group-open-source"
          >
            Open source in Research Materials <ArrowUpRight size={11} aria-hidden />
          </button>
        ) : null}
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map(renderCard)}
      </div>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground shadow-card hover:text-foreground"
        >
          Show all ({group.notes.length})
        </button>
      ) : null}
    </section>
  );
}
