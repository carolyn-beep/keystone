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
        'group relative flex h-full cursor-pointer flex-col rounded-xl bg-card-elevated px-5 py-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover',
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
        className="absolute left-3 top-3 inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded border border-border-strong/40 bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onClick={handleCheckboxClick}
          onChange={handleCheckboxChange}
          aria-label={isSelected ? 'Deselect note' : 'Select note'}
          className="h-[14px] w-[14px] cursor-pointer accent-primary"
        />
      </label>

      {/* Body — grows, takes whatever vertical space is left after the
          shrink-0 footer claims its own. min-h-0 lets the inner line-clamp
          actually clip instead of overflowing past the footer. */}
      <div className="min-h-0 flex-1 overflow-hidden pl-7">
        <p className="m-0 line-clamp-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-foreground">
          {note.content}
        </p>
      </div>

      {/* Footer — never shrinks vertically; horizontal items can. The
          category badge is the only variable-width element, so it gets
          truncate + min-w-0 to give way when the row gets tight. The
          link-status is icon-only to keep the footer fitting at any card
          width. */}
      <div className="mt-3 flex shrink-0 items-center gap-2 overflow-hidden pl-7">
        <span className="shrink-0 font-sans text-[10px] tracking-wide text-muted-foreground">
          {formatNoteDate(note.createdAt)}
        </span>
        {category ? (
          <span className="inline-flex min-w-0 max-w-[55%] items-center rounded-full bg-muted px-2 py-0.5 font-sans text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            <span className="truncate">{category.name}</span>
          </span>
        ) : null}
        <span
          aria-label={isLinked ? 'Linked note' : 'Standalone note'}
          title={isLinked ? 'Linked to a source' : 'Standalone note'}
          className="ml-auto inline-flex shrink-0 items-center justify-center rounded-full bg-card p-1.5 text-muted-foreground"
        >
          {isLinked ? <Link2 size={10} aria-hidden /> : <Unlink size={10} aria-hidden />}
        </span>
      </div>
    </article>
  );
}
