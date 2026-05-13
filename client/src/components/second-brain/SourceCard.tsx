import { ExternalLink, NotebookPen, Trash2 } from 'lucide-react';
import type { Source } from '@/types/second-brain';
import { cn } from '@/lib/utils';

export interface SourceCardProps {
  source: Source;
  isSelected: boolean;
  notesCount: number;
  onSelect: () => void;
  onAddNote: () => void;
  onDelete: () => void;
}

function formatUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Editorial source card. Always elevated (`bg-card-elevated` +
 * `shadow-card`) so it never blends into the page background. Selection
 * is expressed by a thicker shadow and a chunky left rail in the primary
 * ink color — no background-color change, no outline ring (those read as
 * debug borders).
 */
export function SourceCard({
  source,
  isSelected,
  notesCount,
  onSelect,
  onAddNote,
  onDelete,
}: SourceCardProps) {
  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card-elevated transition-all duration-200',
        isSelected
          ? 'shadow-card-hover'
          : 'shadow-card hover:-translate-y-[1px] hover:shadow-card-hover',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 transition-all duration-200',
          isSelected
            ? 'w-[4px] bg-primary'
            : 'w-[2px] bg-border-strong/30 group-hover:bg-primary/50',
        )}
      />
      <button
        type="button"
        onClick={onSelect}
        className="block w-full cursor-pointer bg-transparent p-0 text-left"
        aria-pressed={isSelected}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 pl-7">
          <div className="min-w-0 flex-1">
            <h4 className="m-0 font-serif text-[19px] leading-snug text-foreground">
              {source.title}
            </h4>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-[13px] italic text-muted-foreground">
              <span>by {source.author}</span>
              <span aria-hidden className="not-italic text-muted-light">&middot;</span>
              <span className="truncate font-sans text-[11px] font-medium not-italic uppercase tracking-[0.2em] text-muted-light">
                {formatUrl(source.url)}
              </span>
            </div>
          </div>
          <div
            className={cn(
              'flex shrink-0 items-center gap-1 transition-opacity',
              isSelected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100',
            )}
          >
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Open ${source.title} in a new tab`}
            >
              Open <ExternalLink size={11} />
            </a>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              className="cursor-pointer rounded-md bg-transparent p-1.5 text-muted-light transition-colors hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Delete source ${source.title}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </button>

      {/* Footer rail: note count + Add note + (optional) Research Stream
          provenance chip. Lives outside the title click target so its own
          button doesn't fight the row select. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-7 py-2.5">
        <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <NotebookPen size={12} className="text-muted-light" aria-hidden />
            <span>
              {notesCount === 0
                ? 'No notes yet'
                : `${notesCount} ${notesCount === 1 ? 'note' : 'notes'} linked`}
            </span>
          </span>
          {source.learningStreamItemId != null ? (
            <>
              <span aria-hidden className="text-muted-light">&middot;</span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-muted-light">
                From Research Stream
              </span>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAddNote();
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          + Add note
        </button>
      </div>
    </article>
  );
}
