import type { MouseEvent } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category, Note } from '@/types/second-brain';

export interface NoteGridCardProps {
  note: Note;
  category: Category | null;
  /** Derived from `note.sourceId != null`. Passed in so the parent
   *  doesn't repeat the derivation across cards. */
  isLinked: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
}

function formatNoteDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Compact 4-col grid card for the Notes tab. Hover or selection-mode
 * reveals the checkbox; clicking the card body opens the drawer.
 * Checkbox clicks `stopPropagation` so they don't double-fire.
 */
export function NoteGridCard({
  note,
  category,
  isLinked,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: NoteGridCardProps) {
  const handleCheckboxClick = (event: MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const handleCheckboxChange = () => {
    onToggleSelect();
  };

  return (
    <article
      onClick={onOpenDetail}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col gap-3 overflow-hidden rounded-xl bg-card-elevated px-5 py-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover',
        isSelected ? 'ring-1 ring-primary/40' : null,
      )}
      data-testid="note-grid-card"
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail();
        }
      }}
    >
      <label
        className={cn(
          'absolute left-3 top-3 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-border-strong/40 bg-card transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onClick={handleCheckboxClick}
          onChange={handleCheckboxChange}
          aria-label={isSelected ? 'Deselect note' : 'Select note'}
          className="h-3 w-3 cursor-pointer accent-primary"
        />
      </label>

      <p className="m-0 line-clamp-3 whitespace-pre-wrap pl-7 font-serif text-[15px] leading-relaxed text-foreground">
        {note.content}
      </p>

      <div className="mt-auto flex items-center gap-2 pl-7 pt-1">
        <span className="shrink-0 font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {formatNoteDate(note.createdAt)}
        </span>
        {category ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {category.name}
          </span>
        ) : null}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {isLinked ? (
            <>
              <Link2 size={10} aria-hidden /> Linked
            </>
          ) : (
            <>
              <Unlink size={10} aria-hidden /> Standalone
            </>
          )}
        </span>
      </div>
    </article>
  );
}
