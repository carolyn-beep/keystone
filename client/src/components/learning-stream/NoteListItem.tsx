/**
 * NoteListItem — single note card in the reader Notes pane.
 *
 * Renders the note body as markdown (blockquotes for quote-only notes
 * from spec 03 render correctly). Hover reveals edit + delete affordances
 * via group-hover (no JS state for the hover). Inline edit mode lifts
 * local UI state for the editor textarea.
 *
 * Edit and delete failures rollback the visible state and surface inline
 * error copy; the parent hook (`useNotesForSource`) handles cache state.
 */

import { useState, type KeyboardEvent } from 'react';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Note } from '@/types/second-brain';
import { cn } from '@/lib/utils';

export interface NoteListItemProps {
  note: Note;
  onEdit: (id: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'just now';
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NoteListItem({ note, onEdit, onDelete }: NoteListItemProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState<string>(note.content);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Optimistic / unsaved notes carry a negative id; defensively hide
  // edit + delete until the real row arrives.
  const isReal = note.id > 0;

  async function handleSave() {
    if (draft.trim().length === 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await onEdit(note.id, draft);
      setMode('view');
    } catch {
      setError('Failed to save edit. Try again.');
      // Stay in edit mode; the textarea retains the user's draft.
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setDraft(note.content);
    setError(null);
    setMode('view');
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(note.id);
    } catch {
      setError('Failed to delete. Try again.');
      setIsDeleting(false);
    }
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  }

  return (
    <article className="group relative rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-card-elevated">
      {mode === 'view' ? (
        <>
          <div className="prose prose-sm prose-stone max-w-none font-serif text-[14px] leading-relaxed text-foreground">
            <ReactMarkdown>{note.content}</ReactMarkdown>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-muted-light">
              {formatRelative(note.createdAt)}
            </span>
            {isReal ? (
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  aria-label="Edit note"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={isDeleting}
                  aria-label="Delete note"
                  className={cn(
                    'rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive',
                    isDeleting && 'opacity-50',
                  )}
                >
                  {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={3}
            autoFocus
            className="block w-full resize-none rounded-md border border-border bg-card-elevated px-3 py-2 font-serif text-[14px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md px-2 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || draft.trim().length === 0}
              className="rounded-md bg-primary px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p className="mt-2 font-serif text-[12px] italic text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
