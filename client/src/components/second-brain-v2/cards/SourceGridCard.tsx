import { BookOpen, Bookmark, ExternalLink, MoreHorizontal, NotebookPen, Trash2 } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import type { Source } from '@/types/second-brain';
import { RETRIEVAL_TYPE_META, resolveRetrievalType } from '@/components/research-stream/retrieval-meta';
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
  /** Open the drawer directly in reading mode (skips the detail step). */
  onRead: () => void;
  onDelete: () => void;
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
  onRead,
  onDelete,
}: SourceGridCardProps) {
  const [isKebabOpen, setKebabOpen] = useState(false);

  // Resolve via the fuzzy helper so free-text legacy values like
  // "Substack Essay" / "Podcast Episode" still hit the proper badge.
  const resolved = resolveRetrievalType(source.type);
  const meta = resolved ? RETRIEVAL_TYPE_META[resolved] : null;
  const Icon = meta?.icon ?? null;

  // `anySelected` is consumed by parent for selection-mode UX; intentionally
  // not used here now that the checkbox is always visible.
  void anySelected;

  const stopAndCall = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    fn();
  };

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl bg-card-elevated text-left shadow-card transition-shadow duration-200',
        'hover:shadow-card-hover',
        isSelected && 'ring-1 ring-primary/40 shadow-card-hover',
      )}
    >
      {/* Always-visible checkbox in the top-left corner. Sized to match the
          badge's outer height (22px) so the two sit on the same baseline. */}
      <label
        className="absolute left-4 top-4 z-10 inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[4px] border border-border bg-card"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select ${source.title}`}
          className="h-[14px] w-[14px] accent-primary"
        />
      </label>

      {/* Card body — the click target for opening the drawer.
          Two-column layout: text on the left, icon on the right.
          Text never extends under the icon column. */}
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex flex-1 cursor-pointer flex-row gap-4 bg-transparent px-5 pb-3 pt-4 text-left"
      >
        {/* Left column: badge / title / author / blurb stacked */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Badge — indented past the checkbox, sized to share the
              checkbox's 22px row height for perfect vertical alignment. */}
          <div className="flex h-[22px] items-center pl-8">
            {meta ? (
              <span
                className="inline-flex h-[22px] items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ backgroundColor: meta.bg, color: meta.ink }}
              >
                {Icon ? <Icon size={11} /> : null}
                {meta.label}
              </span>
            ) : null}
          </div>

          {/* Title — fixed 2-line height (17px * leading 1.25 * 2 = 2.5em = 42.5px) */}
          <h3 className="m-0 mt-3 line-clamp-2 h-[2.5em] overflow-hidden font-serif text-[17px] font-semibold leading-[1.25] text-foreground">
            {source.title}
          </h3>

          {/* Author / domain — truncated single line, locked height */}
          <div className="mt-2 flex h-[1.5em] items-center gap-1.5 overflow-hidden font-sans text-[12.5px] leading-[1.5] text-muted-foreground">
            <span className="truncate">{source.author}</span>
            {source.type !== 'Twitter' && formatUrl(source.url) ? (
              <>
                <span aria-hidden="true" className="text-muted-light">&middot;</span>
                <span className="shrink-0 truncate text-[12px] lowercase text-muted-light">
                  {formatUrl(source.url)}
                </span>
              </>
            ) : null}
          </div>

          {/* Blurb — locked 3-line height (13.5px * leading 1.5 * 3 = 4.5em = 60.75px) */}
          <p className="m-0 mt-2.5 line-clamp-3 h-[4.5em] overflow-hidden font-serif text-[13.5px] leading-[1.5] text-muted-foreground">
            {source.keyInsights ?? ''}
          </p>
        </div>

        {/* Right column: just the icon — large and prominent */}
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center self-start rounded-2xl"
          style={meta
            ? { backgroundColor: meta.bg, color: meta.ink }
            : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {Icon ? <Icon size={32} /> : <NotebookPen size={32} />}
        </span>
      </button>

      {/* Footer rail — category + notes + actions. Outside the card-body
          click target so its own buttons don't fight the drawer open. */}
      <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-muted/20 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted-foreground">
          {categoryName ? (
            <span className="truncate rounded-full bg-card px-2.5 py-1 font-sans text-[10.5px] font-medium text-foreground/80 shadow-card">
              {categoryName}
            </span>
          ) : null}
          <span className="inline-flex shrink-0 items-center gap-1 font-sans text-[11.5px]">
            <NotebookPen size={12} className="text-muted-light" aria-hidden="true" />
            <span>
              {notesCount === 0
                ? 'No notes yet'
                : `${notesCount} linked ${notesCount === 1 ? 'note' : 'notes'}`}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={stopAndCall(onRead)}
            className="mr-1 inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2 font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/15"
            aria-label={`Read ${source.title}`}
            title="Open the in-app reader"
          >
            <BookOpen size={11} />
            Read
          </button>
          {source.learningStreamItemId != null ? (
            <span
              aria-hidden="true"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-light"
              title="Saved from Research Stream"
            >
              <Bookmark size={13} />
            </span>
          ) : null}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-light no-underline transition-colors hover:bg-muted hover:text-foreground"
            aria-label={`Open ${source.title} in a new tab`}
          >
            <ExternalLink size={13} />
          </a>
          <div className="relative">
            <button
              type="button"
              onClick={stopAndCall(() => setKebabOpen((open) => !open))}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-light transition-colors hover:bg-muted hover:text-foreground"
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
