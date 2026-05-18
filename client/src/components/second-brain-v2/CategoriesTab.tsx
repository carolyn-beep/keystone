/**
 * CategoriesTab - Second Brain v2, Categories sub-tab orchestrator.
 *
 * Absorbs the v1 CategoriesManager CRUD wiring and reshapes the layout
 * into a toolbar + list-of-categories surface that matches the v2 mock:
 *   - <FilterBar.Search> · <FilterBar.Sort> · <FilterBar.Trailing>
 *     (`+ Add Category` button)
 *   - <CategoryRow> per category: inline rename, source + note counts,
 *     manual reorder (up/down arrows, manual sort only), delete (blocked
 *     when sourceCount > 0).
 *
 * Sort options:
 *   - 'manual'        sortOrder asc nulls last, then name
 *   - 'alphabetical'  name.localeCompare (case-insensitive)
 *   - 'most-sources'  sourceCount desc, then name
 *
 * Switching sort mode while a row is being edited cancels that edit.
 *
 * Reorder is optimistic via useReorderCategories. The reorder buttons
 * only appear when sortBy === 'manual' AND the row count exceeds 1.
 *
 */

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { FilterBar } from '@/components/second-brain-v2/shared/FilterBar';
import { AddCategoryModal } from '@/components/second-brain-v2/modals/AddCategoryModal';
import {
  useCategories,
  useReorderCategories,
  type CategoryResponse,
} from '@/hooks/useCategories';
import { CategoryRow } from './CategoryRow';

export interface CategoriesTabProps {
  slug: string;
}

type SortBy = 'manual' | 'alphabetical' | 'most-sources';

const SORT_OPTIONS: ReadonlyArray<{ value: SortBy; label: string }> = [
  { value: 'manual', label: 'Manual order' },
  { value: 'alphabetical', label: 'Alphabetical' },
  { value: 'most-sources', label: 'Most sources' },
];

const EMPTY_NO_CATEGORIES = 'No categories yet. Add one to organize your research.';
const EMPTY_SEARCH_NO_MATCH = 'No categories match.';

function filterAndSort(
  categories: CategoryResponse[],
  search: string,
  sortBy: SortBy,
): CategoryResponse[] {
  const needle = search.trim().toLowerCase();
  const filtered = needle.length === 0
    ? categories
    : categories.filter((c) => c.name.toLowerCase().includes(needle));

  if (sortBy === 'alphabetical') {
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  if (sortBy === 'most-sources') {
    return [...filtered].sort((a, b) => {
      const diff = (b.sourceCount ?? 0) - (a.sourceCount ?? 0);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
  }
  // manual
  return [...filtered].sort((a, b) => {
    const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

function extractDeleteErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not delete this category.';
  // Backend returns a JSON message for the 409 RESTRICT case; surface it.
  try {
    const jsonStart = error.message.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(error.message.slice(jsonStart));
      if (typeof parsed?.message === 'string') return parsed.message;
    }
  } catch {
    // fall through
  }
  return error.message.includes('409')
    ? 'Move sources to another category first.'
    : error.message;
}

export function CategoriesTab({ slug }: CategoriesTabProps) {
  const {
    categories,
    isLoading,
    renameCategory,
    deleteCategory,
  } = useCategories(slug);
  const reorder = useReorderCategories(slug);

  const [search, setSearch] = useState('');
  const [sortBy, setSortByState] = useState<SortBy>('manual');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Changing sort mode cancels any in-flight inline edit so the new order
  // never strands the edit row in a position the user didn't intend.
  const handleSortChange = (next: string) => {
    if (next === sortBy) return;
    setEditingId(null);
    setSortByState(next as SortBy);
  };

  const sorted = useMemo(
    () => filterAndSort(categories, search, sortBy),
    [categories, search, sortBy],
  );

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const ids = sorted.map((c) => c.id);
    const moved = ids[index];
    ids.splice(index, 1);
    ids.splice(target, 0, moved);
    try {
      await reorder.mutateAsync(ids);
    } catch {
      // Optimistic update already rolled back by the hook's onError.
    }
  };

  const handleSaveEdit = async (id: number, name: string) => {
    try {
      await renameCategory(id, name);
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (category: CategoryResponse) => {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    setDeleteError(null);
    try {
      await deleteCategory(category.id);
    } catch (error) {
      setDeleteError(extractDeleteErrorMessage(error));
    }
  };

  const totalCount = categories.length;
  const visibleCount = sorted.length;
  const showEmptyAll = !isLoading && totalCount === 0;
  const showEmptySearch = !isLoading && totalCount > 0 && visibleCount === 0;

  return (
    <section className="flex flex-col gap-6">
      <FilterBar>
        <FilterBar.Search
          value={search}
          onChange={setSearch}
          placeholder="Search categories"
        />
        <FilterBar.Sort
          value={sortBy}
          options={SORT_OPTIONS}
          onChange={handleSortChange}
          ariaLabel="Sort categories"
        />
        <FilterBar.Trailing>
          <TactileButton
            type="button"
            variant="raised"
            className="inline-flex items-center gap-2 text-[12px]"
            onClick={() => setIsAddOpen(true)}
          >
            <Plus size={14} strokeWidth={2.4} aria-hidden />
            Add Category
          </TactileButton>
        </FilterBar.Trailing>
      </FilterBar>

      {deleteError ? (
        <div
          role="alert"
          className="rounded-lg bg-warning-soft px-5 py-3 font-serif text-[13px] italic text-muted-foreground"
        >
          {deleteError}
        </div>
      ) : null}

      {isLoading ? (
        <p className="m-0 font-serif text-[14px] italic text-muted-foreground">
          Loading categories…
        </p>
      ) : null}

      {showEmptyAll ? (
        <p className="m-0 font-serif text-[15px] italic text-muted-foreground">
          {EMPTY_NO_CATEGORIES}
        </p>
      ) : null}

      {showEmptySearch ? (
        <p className="m-0 font-serif text-[15px] italic text-muted-foreground">
          {EMPTY_SEARCH_NO_MATCH}
        </p>
      ) : null}

      {!isLoading && sorted.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {sorted.map((category, index) => {
            const isEditing = editingId === category.id;
            const canDelete = (category.sourceCount ?? 0) === 0;
            // Manual reorder gates: only in manual sort mode AND when there
            // is somewhere to move to on each side.
            const enableMove = sortBy === 'manual' && sorted.length > 1;
            const onMoveUp = enableMove && index > 0
              ? () => { void handleMove(index, -1); }
              : undefined;
            const onMoveDown = enableMove && index < sorted.length - 1
              ? () => { void handleMove(index, 1); }
              : undefined;
            return (
              <CategoryRow
                key={category.id}
                category={category}
                isEditing={isEditing}
                canDelete={canDelete}
                onStartEdit={() => {
                  setDeleteError(null);
                  setEditingId(category.id);
                }}
                onSaveEdit={(name) => handleSaveEdit(category.id, name)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => { void handleDelete(category); }}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
              />
            );
          })}
        </ul>
      ) : null}

      <AddCategoryModal
        slug={slug}
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
      />
    </section>
  );
}

