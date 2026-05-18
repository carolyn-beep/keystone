import { ExternalLink, MoreHorizontal, NotebookPen, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { Source } from '@/types/second-brain';
import { ResourceTypeBadge } from '@/components/learning-stream/ResourceTypeBadge';
import { RETRIEVAL_TYPE_META } from '@/components/research-stream/retrieval-meta';
import type { RetrievalType } from '@shared/research-stream';
import { formatUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

export interface SourceGridCardProps {
  source: Source;
  categoryName: string | null;
  notesCount: number;
  isSelected: boolean;
  /** True when any card in the grid is selected. Used to keep the
   *  checkbox visible across the whole grid once selection mode begins. */
  anySelected: boolean;
  onToggleSelect: () => void;
  onOpenDetail: () => void;
  onDelete: () => void;
}

function isKnownRetrievalType(value: string | null): value is RetrievalType {
  return value != null && value in RETRIEVAL_TYPE_META;
}

/**
 * Spec 03 FR5 — rich source card for the Research Materials grid.
 *
 * The card is an editorial tile: warm parchment surface, serif title,
 * type-coded right-side icon, and a footer rail for category + linked
 * notes + actions. Tolerates spec-01 enrichment fields being null with
 * graceful fallbacks (no badge, no insights blurb, neutral icon).
 *
 * Click delegation:
 *   - body  → onOpenDetail
 *   - checkbox / external link / kebab → respective handlers; stopPropagation
 */
export function SourceGridCard({
  source,
  categoryName,
  notesCount,
  isSelected,
  anySelected,
  onToggleSelect,
  onOpenDetail,
  onDelete,
}: SourceGridCardProps) {
  const [isKebabOpen, setKebabOpen] = useState(false);

  const known = isKnownRetrievalType(source.type);
  const meta = known ? RETRIEVAL_TYPE_META[source.type as RetrievalType] : null;
  const Icon = meta?.icon ?? null;

  // Checkbox is visible on hover always; if any card is selected, it stays
  // visible across the grid (selection-mode affordance).
  const checkboxVisibilityClass = anySelected || isSelected
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100';

  const stopAndCall = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn();
  };

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl bg-card-elevated text-left shadow-card transition-all duration-200',
        'hover:-translate-y-[1px] hover:shadow-card-hover',
        isSelected && 'ring-1 ring-primary/40 shadow-card-hover',
      )}
    >
      {/* Hover-visible checkbox in the top-left corner. */}
      <label
        className={cn(
          'absolute left-3 top-3 z-10 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-card/95 shadow-card backdrop-blur-sm transition-opacity duration-150',
          checkboxVisibilityClass,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${source.title}`}
          className="h-3.5 w-3.5 accent-primary"
        />
      </label>

      {/* Card body — the click target for opening the drawer. */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex flex-1 cursor-pointer flex-col gap-3 bg-transparent p-5 pl-12 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-h-[24px] min-w-0 flex-1">
            {known ? (
              <ResourceTypeBadge type={source.type as string} size="compact" />
            ) : null}
          </div>
          {/* Right-side colored type icon (large). */}
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={meta
              ? { backgroundColor: meta.bg, color: meta.ink }
              : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            {Icon ? <Icon size={18} /> : <NotebookPen size={18} />}
          </span>
        </div>

        <h3 className="m-0 line-clamp-2 font-serif text-[19px] leading-snug text-foreground">
          {source.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-serif text-[13px] italic text-muted-foreground">
          <span>by {source.author}</span>
          {source.type !== 'Twitter' ? (
            <>
              <span aria-hidden="true" className="not-italic text-muted-light">&middot;</span>
              <span className="truncate font-sans text-[10px] font-semibold not-italic uppercase tracking-[0.25em] text-muted-light">
                {formatUrl(source.url)}
              </span>
            </>
          ) : null}
        </div>

        {source.keyInsights ? (
          <p className="m-0 line-clamp-3 font-serif text-[14px] leading-relaxed text-muted-foreground">
            {source.keyInsights}
          </p>
        ) : null}
      </button>

      {/* Footer rail — category + notes + actions. Outside the card-body
          click target so its own buttons don't fight the drawer open. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-5 py-2.5 pl-12">
        <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
          {categoryName ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.2em]">
              {categoryName}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <NotebookPen size={12} className="text-muted-light" aria-hidden="true" />
            <span>
              {notesCount === 0
                ? 'No notes'
                : `${notesCount} ${notesCount === 1 ? 'note' : 'notes'}`}
            </span>
          </span>
          {source.learningStreamItemId != null ? (
            <span className="text-[9px] font-semibold uppercase tracking-[0.25em] text-muted-light">
              From Research Stream
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
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
          <div className="relative">
            <button
              type="button"
              onClick={stopAndCall(() => setKebabOpen((open) => !open))}
              className="cursor-pointer rounded-md p-1.5 text-muted-light transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Source actions"
              aria-haspopup="menu"
              aria-expanded={isKebabOpen}
            >
              <MoreHorizontal size={14} />
            </button>
            {isKebabOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-border bg-card p-1 shadow-card-hover"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setKebabOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-sans text-[13px] text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 size={12} />
                  Delete from Second Brain
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
