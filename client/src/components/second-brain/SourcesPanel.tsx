import { useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useCategories } from '@/hooks/useCategories';
import { useNotes } from '@/hooks/useNotes';
import { useSources } from '@/hooks/useSources';
import type { Category, Source } from '@/types/second-brain';
import { AddSourceModal } from './AddSourceModal';
import { SourceCard } from './SourceCard';

export interface SourcesPanelProps {
  slug: string;
  selectedSourceId: number | null;
  onSelectSource: (id: number | null) => void;
  /**
   * Fired when the user clicks "+ Add note" on a source row. The parent
   * is responsible for selecting that source AND opening the Notes
   * panel's add-note form scoped to it.
   */
  onAddNoteForSource: (sourceId: number) => void;
}

function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

function groupSources(categories: Category[], sources: Source[]) {
  return sortCategories(categories).map((category) => ({
    category,
    sources: sources.filter((source) => source.categoryId === category.id),
  }));
}

export function SourcesPanel({
  slug,
  selectedSourceId,
  onSelectSource,
  onAddNoteForSource,
}: SourcesPanelProps) {
  const { categories, isLoading: categoriesLoading } = useCategories(slug);
  const { data: sources = [], isLoading: sourcesLoading, error, deleteSource } = useSources(slug);
  // Shares the same TanStack query cache as NotesPanel — single source
  // of truth for note counts on each source row.
  const { data: notes = [] } = useNotes(slug);
  const [isAdding, setIsAdding] = useState(false);
  const [defaultCategoryId, setDefaultCategoryId] = useState<number | undefined>();

  const groups = useMemo(() => groupSources(categories, sources), [categories, sources]);
  const notesBySource = useMemo(() => {
    const counts = new Map<number, number>();
    for (const note of notes) {
      if (note.sourceId == null) continue;
      counts.set(note.sourceId, (counts.get(note.sourceId) ?? 0) + 1);
    }
    return counts;
  }, [notes]);
  const isLoading = categoriesLoading || sourcesLoading;

  const handleDelete = async (source: Source) => {
    if (!window.confirm(`Delete "${source.title}" from your Second Brain?`)) return;
    await deleteSource(source.id);
    if (selectedSourceId === source.id) onSelectSource(null);
  };

  return (
    <section className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h3 className="m-0 text-[26px] font-bold leading-tight tracking-tight text-foreground">
          Research Materials
        </h3>
        <TactileButton
          type="button"
          variant="raised"
          className="inline-flex items-center gap-2 text-[12px]"
          onClick={() => {
            setDefaultCategoryId(categories[0]?.id);
            setIsAdding(true);
          }}
        >
          <Plus size={14} strokeWidth={2.4} /> Add source
        </TactileButton>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-lg bg-warning-soft px-5 py-4 font-serif text-[14px] italic text-muted-foreground">
          Sources could not be loaded.
        </div>
      ) : null}

      {!isLoading && categories.length === 0 && sources.length === 0 ? (
        <div className="rounded-xl bg-card-elevated px-8 py-10 shadow-card">
          <p className="m-0 font-serif text-[17px] italic leading-relaxed text-muted-foreground">
            Nothing here yet. Click <span className="font-semibold not-italic">Add source</span> to save your first one. Sources also collect here when you discuss them with the Chat Agent or bookmark them from the <span className="font-semibold not-italic">Research Stream</span>.
          </p>
        </div>
      ) : null}

      {!isLoading && categories.length > 0 ? (
        <div className="space-y-10">
          {groups.map(({ category, sources: categorySources }) => (
            <section key={category.id}>
              <div className="mb-4 flex items-baseline gap-3">
                <h4 className="m-0 text-[11px] font-semibold uppercase tracking-[0.35em] text-foreground">
                  {category.name}
                </h4>
                <span className="text-[10px] font-semibold tracking-[0.25em] text-muted-light">
                  {categorySources.length} {categorySources.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              {categorySources.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-card/50 px-5 py-4">
                  <p className="m-0 font-serif text-[13px] italic text-muted-light">
                    No sources yet on this shelf.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {categorySources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      isSelected={selectedSourceId === source.id}
                      notesCount={notesBySource.get(source.id) ?? 0}
                      onSelect={() => onSelectSource(selectedSourceId === source.id ? null : source.id)}
                      onAddNote={() => onAddNoteForSource(source.id)}
                      onDelete={() => handleDelete(source)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}

      <AddSourceModal
        slug={slug}
        open={isAdding}
        onClose={() => setIsAdding(false)}
        defaultCategoryId={defaultCategoryId}
      />
    </section>
  );
}
