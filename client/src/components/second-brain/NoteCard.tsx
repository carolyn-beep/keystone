import { useState } from 'react';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import type { Note, Source } from '@/types/second-brain';

export interface NoteCardProps {
  note: Note;
  /**
   * Source this note is linked to (if any). When provided the card
   * surfaces a small "Linked to <title>" indicator above the date row.
   */
  linkedSource?: Source | null;
  onUpdate: (id: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const textareaClassName =
  'w-full min-h-[120px] rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30 resize-y';

function formatNoteDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NoteCard({ note, linkedSource = null, onUpdate, onDelete }: NoteCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);
  const trimmed = draft.trim();

  const save = async () => {
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await onUpdate(note.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <article className="rounded-xl bg-card-elevated p-5 shadow-card-hover ring-1 ring-primary/20">
        <textarea
          className={textareaClassName}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoFocus
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[9px] font-semibold uppercase tracking-[0.3em] text-muted-light">
            Editing · {formatNoteDate(note.createdAt)}
          </span>
          <div className="flex gap-3">
            <TactileButton
              type="button"
              variant="inset"
              className="text-[12px]"
              onClick={() => {
                setDraft(note.content);
                setIsEditing(false);
              }}
            >
              Cancel
            </TactileButton>
            <TactileButton
              type="button"
              variant="raised"
              className="text-[12px]"
              disabled={!trimmed || isSaving}
              onClick={save}
            >
              {isSaving ? 'Saving…' : 'Save note'}
            </TactileButton>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative overflow-hidden rounded-xl bg-card-elevated px-6 py-5 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px] bg-border-strong/30 transition-colors duration-200 group-hover:bg-primary/50"
      />
      <p className="m-0 whitespace-pre-wrap pl-2 font-serif text-[16px] leading-relaxed text-foreground">
        {note.content}
      </p>
      <div className="mt-4 flex items-center gap-3 pl-2">
        {/* min-w-0 lets the inner flex children shrink, letting the
            source title truncate with an ellipsis instead of wrapping
            the row and shoving the action buttons onto a second line. */}
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-light">
          <span className="shrink-0">{formatNoteDate(note.createdAt)}</span>
          {linkedSource ? (
            <>
              <span aria-hidden className="shrink-0">&middot;</span>
              <span className="inline-flex min-w-0 items-center gap-1.5 normal-case tracking-normal text-muted-foreground">
                <Link2 size={11} className="shrink-0 text-muted-light" aria-hidden />
                <span className="min-w-0 truncate font-serif italic">
                  Linked to{' '}
                  <span
                    className="not-italic font-medium text-foreground"
                    title={linkedSource.title}
                  >
                    {linkedSource.title}
                  </span>
                </span>
              </span>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Edit note"
          >
            <Pencil size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(note.id)}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete note"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </article>
  );
}
