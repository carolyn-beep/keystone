import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { BookOpen, ChevronLeft, ChevronRight, FolderEdit, FolderPlus, NotebookPen, Plus, Trash2 } from 'lucide-react';
import type { RetrievalType } from '@shared/research-stream';
import type { Source } from '@/types/second-brain';
import { useSources } from '@/hooks/useSources';
import { useNotes } from '@/hooks/useNotes';
import { useCategories } from '@/hooks/useCategories';
import { useToast } from '@/hooks/use-toast';
import { TactileButton } from '@/components/ui/tactile-button';
import { AddSourceModal } from '@/components/second-brain/AddSourceModal';
import { cn } from '@/lib/utils';
import { RightDrawer } from './shared/RightDrawer';
import { StatCardStrip } from './shared/StatCardStrip';
import { CategoryChipStrip } from './shared/CategoryChipStrip';
import { FilterBar } from './shared/FilterBar';
import { BulkActionBar } from './shared/BulkActionBar';
import { navigateToSubTab } from './shared/navigation';
import { SourceGridCard } from './cards/SourceGridCard';
import { SourceDetailPanel } from './drawer/SourceDetailPanel';
import { AddCategoryModal } from './modals/AddCategoryModal';
import { RecategorizeModal } from './modals/RecategorizeModal';

export interface ResearchMaterialsTabProps {
  slug: string;
}

type SortBy = 'newest' | 'oldest' | 'most-notes';

const PAGE_SIZE = 12;

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'most-notes', label: 'Most notes' },
];

const TYPE_OPTIONS: ReadonlyArray<{ value: RetrievalType; label: string }> = [
  { value: 'Podcast', label: 'Podcast' },
  { value: 'AcademicPaper', label: 'Academic paper' },
  { value: 'Video', label: 'Video' },
  { value: 'Substack', label: 'Substack' },
  { value: 'News', label: 'News' },
  { value: 'Twitter', label: 'X / Twitter' },
];

function caseInsensitiveContains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

function sortSources(items: Source[], by: SortBy, notesCountById: Map<number, number>): Source[] {
  const copy = items.slice();
  switch (by) {
    case 'oldest':
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'most-notes':
      return copy.sort((a, b) => (notesCountById.get(b.id) ?? 0) - (notesCountById.get(a.id) ?? 0));
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/**
 * Spec 03 FR11 — Research Materials sub-tab orchestrator.
 *
 * Composes the spec-02 shared primitives (FilterBar, StatCardStrip,
 * CategoryChipStrip, BulkActionBar, RightDrawer) with the spec-03
 * components (SourceGridCard, SourceDetailPanel, AddCategoryModal,
 * RecategorizeModal). Owns local filter / selection / drawer state;
 * delegates data fetching to the existing useSources / useNotes /
 * useCategories hooks; uses navigateToSubTab to hop into the Notes
 * sub-tab with a source filter pre-applied.
 */
export function ResearchMaterialsTab({ slug }: ResearchMaterialsTabProps) {
  const { toast } = useToast();
  const {
    data: sources,
    bulkDeleteSources,
    bulkRecategorizeSources,
    deleteSource,
    isBulkDeleting,
    isBulkRecategorizing,
  } = useSources(slug);
  const { data: notes } = useNotes(slug);
  const { categories } = useCategories(slug);

  // --- local state ---
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<RetrievalType | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set<number>());
  const [drawerSourceId, setDrawerSourceId] = useState<number | null>(null);
  const [isReadingMode, setReadingMode] = useState<boolean>(false);
  const [isAddCategoryOpen, setAddCategoryOpen] = useState(false);
  const [isAddSourceOpen, setAddSourceOpen] = useState(false);
  const [isRecategorizeOpen, setRecategorizeOpen] = useState(false);

  // --- derived: notes-per-source map ---
  const notesCountById = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of notes ?? []) {
      if (note.sourceId != null) {
        map.set(note.sourceId, (map.get(note.sourceId) ?? 0) + 1);
      }
    }
    return map;
  }, [notes]);

  // --- derived: categoryId → name lookup ---
  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  // --- derived: filtered, sorted, paginated rows ---
  const filteredSources = useMemo<Source[]>(() => {
    const all = sources ?? [];
    const query = search.trim().toLowerCase();
    return all.filter((source) => {
      if (categoryFilter != null && source.categoryId !== categoryFilter) return false;
      if (typeFilter != null && source.type !== typeFilter) return false;
      if (query) {
        const inTitle = caseInsensitiveContains(source.title, query);
        const inAuthor = caseInsensitiveContains(source.author, query);
        const inInsights = caseInsensitiveContains(source.keyInsights, query);
        if (!inTitle && !inAuthor && !inInsights) return false;
      }
      return true;
    });
  }, [sources, search, categoryFilter, typeFilter]);

  const sortedSources = useMemo(
    () => sortSources(filteredSources, sortBy, notesCountById),
    [filteredSources, sortBy, notesCountById],
  );

  const totalPages = Math.max(1, Math.ceil(sortedSources.length / PAGE_SIZE));
  const showPagination = sortedSources.length > PAGE_SIZE;

  // Clamp currentPage when filtered set shrinks.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedSources = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedSources.slice(start, start + PAGE_SIZE);
  }, [sortedSources, currentPage]);

  // --- drawer auto-close if open source disappears ---
  useEffect(() => {
    if (drawerSourceId == null) return;
    const stillThere = (sources ?? []).some((s) => s.id === drawerSourceId);
    if (!stillThere) setDrawerSourceId(null);
  }, [sources, drawerSourceId]);

  // --- one-shot read of ?openSource=<id> on mount ---
  // Lets siblings (e.g. NotesTab's "Open source in Research Materials" CTA)
  // deep-link straight into a source's drawer instead of just switching
  // tabs. Param is consumed and stripped so refresh/share semantics match
  // the rest of the Second Brain navigation.
  const searchString = useSearch();
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const raw = params.get('openSource');
    if (!raw) return;
    const id = Number(raw);
    if (Number.isFinite(id)) setDrawerSourceId(id);
    params.delete('openSource');
    const next = params.toString();
    const url = next ? `?${next}` : window.location.pathname;
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- filter mutators (always reset to page 1) ---
  const setCategoryFilterAndReset = useCallback((id: number | null) => {
    setCategoryFilter(id);
    setCurrentPage(1);
  }, []);

  const setTypeFilterAndReset = useCallback((value: RetrievalType | null) => {
    setTypeFilter(value);
    setCurrentPage(1);
  }, []);

  const onSearchChange = useCallback((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, []);

  // --- selection ---
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set<number>()), []);

  // --- bulk actions ---
  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const ok = window.confirm(`Delete ${ids.length} ${ids.length === 1 ? 'source' : 'sources'} from Second Brain?`);
    if (!ok) return;
    try {
      await bulkDeleteSources(ids);
      clearSelection();
      toast({ title: `Deleted ${ids.length} ${ids.length === 1 ? 'source' : 'sources'}` });
    } catch (error) {
      toast({
        title: 'Could not delete sources',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [selectedIds, bulkDeleteSources, clearSelection, toast]);

  const handleBulkRecategorize = useCallback(async (categoryId: number) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await bulkRecategorizeSources({ ids, categoryId });
      clearSelection();
      toast({ title: `Moved ${ids.length} ${ids.length === 1 ? 'source' : 'sources'}` });
    } catch (error) {
      toast({
        title: 'Could not move sources',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [selectedIds, bulkRecategorizeSources, clearSelection, toast]);

  // --- drawer source + linked notes ---
  const drawerSource = useMemo(
    () => (sources ?? []).find((s) => s.id === drawerSourceId) ?? null,
    [sources, drawerSourceId],
  );
  const drawerCategory = drawerSource
    ? categories.find((c) => c.id === drawerSource.categoryId) ?? null
    : null;
  const drawerNotes = useMemo(
    () => (drawerSourceId == null
      ? []
      : (notes ?? []).filter((n) => n.sourceId === drawerSourceId)),
    [notes, drawerSourceId],
  );

  const handleViewLinkedNotes = useCallback(() => {
    if (drawerSourceId == null) return;
    const id = String(drawerSourceId);
    setDrawerSourceId(null);
    navigateToSubTab('notes', { filterSource: id });
  }, [drawerSourceId]);

  const handleDrawerDelete = useCallback(async () => {
    if (drawerSource == null) return;
    const ok = window.confirm(`Delete "${drawerSource.title}" from Second Brain?`);
    if (!ok) return;
    try {
      await deleteSource(drawerSource.id);
      setDrawerSourceId(null);
    } catch (error) {
      toast({
        title: 'Could not delete source',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [drawerSource, deleteSource, toast]);

  // --- toolbar primitives ---
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name }));
  const chipStripCategories = categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: c.sourceCount,
  }));

  // --- rendering ---
  const hasSources = (sources ?? []).length > 0;
  const hasFilteredResults = pagedSources.length > 0;
  const anySelected = selectedIds.size > 0;

  return (
    <div className="flex flex-col gap-5">
      <StatCardStrip
        cards={[
          { icon: BookOpen, count: (sources ?? []).length, label: 'Saved sources', accent: 'primary' },
          { icon: NotebookPen, count: (notes ?? []).length, label: 'Notes', accent: 'info' },
          { icon: FolderEdit, count: categories.length, label: 'Categories', accent: 'success' },
        ]}
      />

      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={onSearchChange}
          placeholder="Search saved sources…"
        />
        <FilterBar.Select
          value={categoryFilter == null ? null : String(categoryFilter)}
          options={categoryOptions}
          onChange={(value) =>
            setCategoryFilterAndReset(value == null ? null : Number(value))
          }
          placeholder={categories.length === 0 ? 'No categories' : 'Category'}
        />
        <FilterBar.Select
          value={typeFilter}
          options={TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          onChange={(value) => setTypeFilterAndReset(value as RetrievalType | null)}
          placeholder="Source Type"
        />
        <FilterBar.Sort
          value={sortBy}
          options={SORT_OPTIONS.map((opt) => ({ value: opt.value, label: `Sort by: ${opt.label}` }))}
          onChange={(value) => setSortBy(value as SortBy)}
        />
        <FilterBar.Trailing>
          <TactileButton
            type="button"
            variant="raised"
            className="inline-flex items-center gap-1.5 text-[12px]"
            onClick={() => setAddCategoryOpen(true)}
          >
            <FolderPlus size={13} />
            Add Category
          </TactileButton>
          <TactileButton
            type="button"
            variant="raised"
            className="inline-flex items-center gap-1.5 text-[12px]"
            onClick={() => setAddSourceOpen(true)}
          >
            <Plus size={13} />
            Add Source
          </TactileButton>
        </FilterBar.Trailing>
      </FilterBar>

      <CategoryChipStrip
        categories={chipStripCategories}
        activeCategoryId={categoryFilter}
        onChange={setCategoryFilterAndReset}
      />

      {/* Grid + empty states */}
      {!hasSources ? (
        <div className="rounded-xl bg-card-elevated p-10 text-center shadow-card">
          <p className="m-0 font-serif text-[16px] italic text-muted-foreground">
            No sources saved yet. Add one with{' '}
            <button
              type="button"
              onClick={() => setAddSourceOpen(true)}
              className="font-sans not-italic font-semibold uppercase tracking-[0.18em] text-primary underline-offset-2 hover:underline"
            >
              + Add source
            </button>
            .
          </p>
        </div>
      ) : !hasFilteredResults ? (
        <div className="rounded-xl bg-card-elevated p-10 text-center shadow-card">
          <p className="m-0 font-serif text-[16px] italic text-muted-foreground">
            No sources match your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {pagedSources.map((source) => (
            <SourceGridCard
              key={source.id}
              source={source}
              categoryName={
                source.categoryId != null
                  ? categoryNameById.get(source.categoryId) ?? null
                  : null
              }
              notesCount={notesCountById.get(source.id) ?? 0}
              isSelected={selectedIds.has(source.id)}
              anySelected={anySelected}
              onToggleSelect={() => toggleSelect(source.id)}
              onOpenDetail={() => {
                setReadingMode(false);
                setDrawerSourceId(source.id);
              }}
              onRead={() => {
                setReadingMode(true);
                setDrawerSourceId(source.id);
              }}
              onDelete={async () => {
                const ok = window.confirm(`Delete "${source.title}" from Second Brain?`);
                if (!ok) return;
                try {
                  await deleteSource(source.id);
                } catch (error) {
                  toast({
                    title: 'Could not delete source',
                    description: error instanceof Error ? error.message : 'Unknown error',
                    variant: 'destructive',
                  });
                }
              }}
            />
          ))}
        </div>
      )}

      {showPagination ? (
        <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted hover:text-foreground',
            )}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-sans text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40 hover:bg-muted hover:text-foreground',
            )}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}

      <BulkActionBar
        selectionCount={selectedIds.size}
        onClear={clearSelection}
        actions={[
          {
            label: 'Move to category',
            icon: FolderEdit,
            onClick: () => setRecategorizeOpen(true),
            disabled: isBulkRecategorizing || categories.length === 0,
          },
          {
            label: 'Delete',
            icon: Trash2,
            variant: 'destructive',
            onClick: handleBulkDelete,
            disabled: isBulkDeleting,
          },
        ]}
      />

      {/* Drawer — widens when reading mode is active so the inline reader
          has room for an article-width column. Reading-mode flag resets on
          close so the next open starts in detail mode. */}
      <RightDrawer
        open={drawerSourceId != null}
        onClose={() => {
          setDrawerSourceId(null);
          setReadingMode(false);
        }}
        ariaLabel="Source detail"
        wide={isReadingMode}
      >
        {drawerSource ? (
          <SourceDetailPanel
            slug={slug}
            source={drawerSource}
            category={drawerCategory}
            notes={drawerNotes}
            onClose={() => {
              setDrawerSourceId(null);
              setReadingMode(false);
            }}
            onOpenExternal={() => window.open(drawerSource.url, '_blank', 'noopener,noreferrer')}
            onEditCategory={() => setRecategorizeOpen(true)}
            onDelete={handleDrawerDelete}
            onViewLinkedNotes={handleViewLinkedNotes}
            isReading={isReadingMode}
            onToggleReading={setReadingMode}
          />
        ) : null}
      </RightDrawer>

      {/* Modals */}
      <AddCategoryModal
        slug={slug}
        open={isAddCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
      />
      <AddSourceModal
        slug={slug}
        open={isAddSourceOpen}
        onClose={() => setAddSourceOpen(false)}
      />
      <RecategorizeModal
        slug={slug}
        open={isRecategorizeOpen}
        selectionCount={Math.max(selectedIds.size, drawerSource ? 1 : 0)}
        onClose={() => setRecategorizeOpen(false)}
        onConfirm={async (categoryId) => {
          // If we're driving from the drawer's "Edit category" action,
          // operate on just the drawer-open source.
          if (selectedIds.size === 0 && drawerSource) {
            try {
              await bulkRecategorizeSources({ ids: [drawerSource.id], categoryId });
            } catch (error) {
              toast({
                title: 'Could not change category',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
              });
            }
            return;
          }
          await handleBulkRecategorize(categoryId);
        }}
      />
    </div>
  );
}
