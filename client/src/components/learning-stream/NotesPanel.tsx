/**
 * NotesPanel — host for the reader Notes pane.
 *
 * Layout (top → bottom):
 *   - AutoBookmarkToast (conditional on `lastAutoBookmark`)
 *   - Scrolling list of <NoteListItem> (newest first via useNotesForSource)
 *   - <NoteComposer> pinned at the bottom (forwards composerRef for spec 03)
 *
 * Smart-default category resolution (FEATURE.md locked decision #6):
 *   1. source.categoryId (if the source exists)
 *   2. null (composer renders chip as "Pick category")
 *
 * The resolver is memoized on [source.categoryId]
 * so a mid-session auto-bookmark updates the default on the NEXT composer
 * mount (the user's manual pick survives until reader close — composer-local
 * state in NoteComposer).
 */

import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import type { LearningStreamItem } from '@/hooks/useLearningStream';
import type { Source } from '@/types/second-brain';
import { useNotesForSource, type CreateNoteFromReaderResponse } from '@/hooks/useNotesForSource';
import { useCategories } from '@/hooks/useCategories';
import { NoteListItem } from './NoteListItem';
import { NoteComposer, type NoteComposerHandle } from './NoteComposer';
import { AutoBookmarkToast } from './AutoBookmarkToast';
import type { CategoryPickerValue } from './CategoryPickerChip';

export interface NotesPanelProps {
  slug: string;
  item: LearningStreamItem;
  /** Mirrored source row if it exists. Null pre-first-save. */
  source: Source | null;
  /** Spec 03 hooks the quote popover into the composer through this ref. */
  composerRef?: Ref<NoteComposerHandle>;
}

export function NotesPanel({ slug, item, source, composerRef }: NotesPanelProps) {
  const { data: notes, createNote, updateNote, deleteNote, isLoading } = useNotesForSource({
    slug,
    sourceId: source?.id,
    learningStreamItemId: item.id,
  });
  const { categories } = useCategories(slug);

  const [lastAutoBookmark, setLastAutoBookmark] = useState<{ categoryName: string } | null>(null);
  const [composerCategory, setComposerCategory] = useState<CategoryPickerValue>(() =>
    typeof source?.categoryId === 'number'
      ? { kind: 'existing', categoryId: source.categoryId }
      : { kind: 'unset' },
  );
  const categoryWasPickedRef = useRef<boolean>(false);
  const hasLockedSourceCategory = typeof source?.categoryId === 'number';

  const defaultCategoryId = useMemo<number | null>(() => {
    if (typeof source?.categoryId === 'number') return source.categoryId;
    return null;
  }, [source?.categoryId]);

  useEffect(() => {
    if (hasLockedSourceCategory) {
      setComposerCategory({ kind: 'existing', categoryId: source.categoryId });
      return;
    }
    if (categoryWasPickedRef.current) return;
    setComposerCategory(
      defaultCategoryId === null
        ? { kind: 'unset' }
        : { kind: 'existing', categoryId: defaultCategoryId },
    );
  }, [defaultCategoryId, hasLockedSourceCategory, source?.categoryId]);

  function handleSaved(response: CreateNoteFromReaderResponse) {
    if (response.autoBookmarked) {
      setLastAutoBookmark({ categoryName: response.category.name });
    }
  }

  const isEmpty = !isLoading && notes.length === 0;

  return (
    <div className="flex h-full flex-col">
      {lastAutoBookmark ? (
        <AutoBookmarkToast
          categoryName={lastAutoBookmark.categoryName}
          onChange={() => {
            // The composer chip is composer-local; the simplest path is to
            // dismiss the toast and let the user click the chip directly.
            // Future: surface an imperative handle. For now this clears the
            // toast so the user's gaze lands back on the chip.
            setLastAutoBookmark(null);
          }}
          onDismiss={() => setLastAutoBookmark(null)}
        />
      ) : null}

      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-styled">
        {isEmpty ? (
          <p className="mt-6 px-2 font-serif text-[14px] italic text-muted-foreground">
            No notes for this source yet
          </p>
        ) : (
          <ol className="m-0 list-none space-y-2 p-0">
            {notes.map((note) => (
              <li key={note.id}>
                <NoteListItem
                  note={note}
                  onEdit={async (id, content) => {
                    await updateNote(id, { content });
                  }}
                  onDelete={(id) => deleteNote(id)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      <NoteComposer
        ref={composerRef}
        slug={slug}
        sourceId={source?.id ?? null}
        learningStreamItemId={item.id}
        defaultCategoryId={defaultCategoryId}
        categoryValue={composerCategory}
        onCategoryValueChange={(next) => {
          if (hasLockedSourceCategory) return;
          categoryWasPickedRef.current = true;
          setComposerCategory(next);
        }}
        categoryReadOnly={hasLockedSourceCategory}
        categoryLabel={source?.categoryName}
        onSaved={handleSaved}
      />
    </div>
  );
}

// Re-export the handle type so consumers (ExpandedItemView, spec 03's quote
// popover) can construct refs of the correct shape.
export type { NoteComposerHandle } from './NoteComposer';
