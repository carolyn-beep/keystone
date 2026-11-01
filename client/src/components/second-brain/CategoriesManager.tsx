import { FormEvent, KeyboardEvent, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useCategories } from '@/hooks/useCategories';
import type { Category } from '@/types/second-brain';

export interface CategoriesManagerProps {
  slug: string;
}

function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

function deleteErrorMessage(error: unknown, category?: Category): string {
  const fallback = category?.sourceCount && category.sourceCount > 0
    ? `Move ${category.sourceCount} sources to another category first.`
    : 'Move sources to another category first.';

  if (!(error instanceof Error)) return fallback;
  try {
    const jsonStart = error.message.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(error.message.slice(jsonStart));
      return parsed.message ?? fallback;
    }
  } catch {
    return fallback;
  }
  return error.message.includes('409') ? fallback : error.message;
}

export function CategoriesManager({ slug }: CategoriesManagerProps) {
  const {
    categories,
    isLoading,
    createCategory,
    renameCategory,
    reorderCategories,
    deleteCategory,
  } = useCategories(slug);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = sortCategories(categories);

  const startRename = (category: Category) => {
    setError(null);
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const saveRename = async () => {
    const trimmed = editingName.trim();
    if (!editingId || !trimmed) return;
    await renameCategory(editingId, trimmed);
    setEditingId(null);
    setEditingName('');
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveRename();
    }
    if (event.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  const addCategory = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    await createCategory(trimmed);
    setNewName('');
    setIsAdding(false);
  };

  const removeCategory = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"?`)) return;
    setError(null);
    try {
      await deleteCategory(category.id);
    } catch (deleteError) {
      setError(deleteErrorMessage(deleteError, category));
    }
  };

  const handleDrop = async (targetId: number) => {
    if (draggedId == null || draggedId === targetId) return;
    const currentIds = ordered.map((category) => category.id);
    const fromIndex = currentIds.indexOf(draggedId);
    const toIndex = currentIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const nextIds = [...currentIds];
    const [moved] = nextIds.splice(fromIndex, 1);
    nextIds.splice(toIndex, 0, moved);
    setDraggedId(null);
    await reorderCategories(nextIds);
  };

  const totalSources = ordered.reduce((sum, c) => sum + (c.sourceCount ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-xl bg-card-elevated shadow-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-7 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            <span>Categories</span>
            {ordered.length > 0 ? (
              <>
                <span aria-hidden className="text-muted-light">&middot;</span>
                <span className="text-muted-light">
                  {ordered.length} {ordered.length === 1 ? 'shelf' : 'shelves'}
                  {totalSources > 0 ? ` · ${totalSources} ${totalSources === 1 ? 'source' : 'sources'}` : ''}
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-1.5 mb-0 font-serif text-[14px] italic leading-snug text-muted-foreground">
            Decide what shelves to keep before placing any books on them.
          </p>
        </div>
        {!isAdding ? (
          <TactileButton
            type="button"
            variant="raised"
            className="inline-flex items-center gap-2 text-[12px]"
            onClick={() => setIsAdding(true)}
          >
            <Plus size={14} strokeWidth={2.4} />
            New category
          </TactileButton>
        ) : null}
      </div>

      {error ? (
        <div className="border-b border-border bg-warning-soft/60 px-7 py-3 font-serif text-[13px] italic text-muted-foreground">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-7 py-5">
        {isLoading ? (
          <span className="font-serif text-[14px] italic text-muted-foreground">Loading categories…</span>
        ) : null}

        {!isLoading && ordered.map((category) => {
          const isDragging = draggedId === category.id;
          const isEditing = editingId === category.id;

          return (
            <div
              key={category.id}
              draggable={!isEditing}
              onDragStart={() => setDraggedId(category.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(category.id)}
              className={`group flex min-h-[40px] items-center gap-1.5 rounded-full border bg-card px-2.5 py-1.5 transition-all ${
                isDragging
                  ? 'border-primary/40 bg-primary/5 shadow-card'
                  : 'border-border hover:border-border-strong hover:bg-card-elevated'
              }`}
            >
              <GripVertical
                size={13}
                className="shrink-0 cursor-grab text-muted-light transition-colors group-hover:text-muted-foreground active:cursor-grabbing"
                aria-hidden
              />
              {isEditing ? (
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  onBlur={saveRename}
                  onKeyDown={handleRenameKeyDown}
                  className="w-[180px] bg-transparent px-1 py-0.5 text-[12px] font-semibold uppercase tracking-[0.25em] text-foreground outline-none"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => startRename(category)}
                  className="cursor-pointer bg-transparent p-0 text-[11px] font-semibold uppercase tracking-[0.25em] text-foreground hover:text-primary"
                >
                  {category.name}
                </button>
              )}
              {category.sourceCount != null && category.sourceCount > 0 ? (
                <span className="rounded-full bg-muted px-1.5 py-[1px] font-serif text-[10px] text-muted-foreground">
                  {category.sourceCount}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => removeCategory(category)}
                className="ml-0.5 cursor-pointer rounded-full bg-transparent p-1 text-muted-light opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                aria-label={`Delete category ${category.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {isAdding ? (
          <form
            onSubmit={addCategory}
            className="flex items-center gap-2 rounded-full border border-primary/30 bg-card-elevated px-2.5 py-1.5 shadow-card"
          >
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              className="w-[210px] bg-transparent px-1 py-0.5 text-[12px] font-semibold uppercase tracking-[0.25em] text-foreground outline-none placeholder:font-serif placeholder:text-[12px] placeholder:normal-case placeholder:tracking-normal placeholder:italic placeholder:text-muted-light"
              placeholder="Name this shelf…"
              autoFocus
            />
            <TactileButton type="submit" variant="raised" className="px-3 py-1 text-[11px]" disabled={!newName.trim()}>
              Add
            </TactileButton>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNewName('');
              }}
              className="cursor-pointer bg-transparent p-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </form>
        ) : null}

        {!isLoading && ordered.length === 0 && !isAdding ? (
          <p className="m-0 font-serif text-[14px] italic text-muted-foreground">
            No categories yet. Start with the major areas your research should cover.
          </p>
        ) : null}
      </div>
    </section>
  );
}
