import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useToast } from '@/hooks/use-toast';
import { useNotes } from '@/hooks/useNotes';
import { useSources } from '@/hooks/useSources';
import type { Note, Source } from '@/types/second-brain';
import { AddNoteForm } from './AddNoteForm';
import { NoteCard } from './NoteCard';

export interface NotesPanelProps {
  slug: string;
  filterSourceId: number | null;
  /**
   * Bumped by the parent to imperatively open the add-note form (used by
   * the "+ Add note" button on each SourceCard). Counter instead of
   * boolean so we can fire repeatedly even when the form is already
   * "matched" to the current source.
   */
  openAddTrigger?: number;
}

function compareCreatedAtDesc(a: Note, b: Note): number {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  return bTime - aTime;
}

export function NotesPanel({ slug, filterSourceId, openAddTrigger = 0 }: NotesPanelProps) {
  const { toast } = useToast();
  const { data: allNotes = [], isLoading, error, updateNote, deleteNote } = useNotes(slug);
  const { data: sources = [] } = useSources(slug);
  const [isAdding, setIsAdding] = useState(false);

  const sourcesById = useMemo(() => {
    const map = new Map<number, Source>();
    for (const source of sources) map.set(source.id, source);
    return map;
  }, [sources]);

  const isSourceScoped = filterSourceId != null;

  const { pinnedNotes, otherNotes } = useMemo(() => {
    if (!isSourceScoped) {
      return { pinnedNotes: [] as Note[], otherNotes: [...allNotes].sort(compareCreatedAtDesc) };
    }
    const pinned: Note[] = [];
    const other: Note[] = [];
    for (const note of allNotes) {
      if (note.sourceId === filterSourceId) pinned.push(note);
      else other.push(note);
    }
    pinned.sort(compareCreatedAtDesc);
    other.sort(compareCreatedAtDesc);
    return { pinnedNotes: pinned, otherNotes: other };
  }, [allNotes, filterSourceId, isSourceScoped]);

  useEffect(() => {
    setIsAdding(false);
  }, [filterSourceId]);

  // Open the form when the parent bumps the trigger (e.g. "+ Add note" on
  // a source card). The first render has trigger=0 and shouldn't open;
  // we skip that initial value with a ref guard.
  const lastTriggerRef = useRef(openAddTrigger);
  useEffect(() => {
    if (openAddTrigger !== lastTriggerRef.current) {
      lastTriggerRef.current = openAddTrigger;
      setIsAdding(true);
    }
  }, [openAddTrigger]);

  const remove = async (id: number) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await deleteNote(id);
    } catch (deleteError) {
      toast({
        title: 'Could not delete note',
        description: deleteError instanceof Error ? deleteError.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const update = async (id: number, content: string) => {
    try {
      await updateNote(id, { content });
    } catch (updateError) {
      toast({
        title: 'Could not update note',
        description: updateError instanceof Error ? updateError.message : 'Please try again.',
        variant: 'destructive',
      });
      throw updateError;
    }
  };

  const hasAnyNotes = allNotes.length > 0;
  const resolveLinkedSource = (note: Note): Source | null => {
    if (note.sourceId == null) return null;
    return sourcesById.get(note.sourceId) ?? null;
  };

  return (
    <aside className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <h3 className="m-0 text-[26px] font-bold leading-tight tracking-tight text-foreground">
          Notes
        </h3>
        <TactileButton
          type="button"
          variant="raised"
          className="inline-flex items-center gap-2 text-[12px]"
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus size={14} strokeWidth={2.4} /> Add note
        </TactileButton>
      </div>

      <div className="space-y-5">
        {isAdding ? (
          <AddNoteForm
            slug={slug}
            sourceId={filterSourceId}
            onClose={() => setIsAdding(false)}
          />
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-lg bg-warning-soft px-5 py-4 font-serif text-[14px] italic text-muted-foreground">
            Notes could not be loaded.
          </div>
        ) : null}

        {!isLoading && !hasAnyNotes && !isAdding ? (
          <div className="rounded-xl bg-card-elevated px-7 py-8 shadow-card">
            <p className="m-0 font-serif text-[15px] italic leading-relaxed text-muted-foreground">
              No notes yet. The best starting point is usually the chat — explain what caught your attention, then save your own words here.
            </p>
          </div>
        ) : null}

        {!isLoading && hasAnyNotes ? (
          <>
            {pinnedNotes.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.35em] text-muted-light">
                  <span>Pinned to this source</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    linkedSource={resolveLinkedSource(note)}
                    onUpdate={update}
                    onDelete={remove}
                  />
                ))}
              </div>
            ) : null}

            {otherNotes.length > 0 ? (
              <div className="space-y-3">
                {pinnedNotes.length > 0 ? (
                  <div className="flex items-center gap-2 pt-2 text-[9px] font-semibold uppercase tracking-[0.35em] text-muted-light">
                    <span>Other notes</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null}
                {otherNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    linkedSource={resolveLinkedSource(note)}
                    onUpdate={update}
                    onDelete={remove}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
