import { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderEdit,
  MoreHorizontal,
  NotebookPen,
  Trash2,
  X,
} from 'lucide-react';
import type { Category, Note, Source } from '@/types/second-brain';
import { ResourceTypeBadge } from '@/components/learning-stream/ResourceTypeBadge';
import { RETRIEVAL_TYPE_META } from '@/components/research-stream/retrieval-meta';
import type { RetrievalType } from '@shared/research-stream';
import { formatUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

const MAX_PREVIEW_NOTES = 3;

export interface SourceDetailPanelProps {
  source: Source;
  notes: Note[];
  category: Category | null;
  onClose: () => void;
  onOpenExternal: () => void;
  onEditCategory: () => void;
  onDelete: () => void;
  /** Switches the shell to ?sb=notes&filterSource=<id>. */
  onViewLinkedNotes: () => void;
}

function isKnownRetrievalType(value: string | null): value is RetrievalType {
  return value != null && value in RETRIEVAL_TYPE_META;
}

function formatSavedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Spec 03 FR6 — drawer body for a single source.
 *
 * Renders inside <RightDrawer>. Sections (top → bottom):
 *   1. Close + type-coded icon
 *   2. Type badge + title + author/domain
 *   3. Metadata table (Saved on, Source, Length, Category)
 *   4. Summary = key insights
 *   5. Why this matters (collapsed by default)
 *   6. Linked Notes preview (≤3, with empty state)
 *   7. Primary CTA: View linked notes in Notes tab →
 *   8. Secondary actions: Open source · Edit category · Delete
 *
 * Nulls in spec-01 enrichment fields collapse the corresponding section.
 */
export function SourceDetailPanel({
  source,
  notes,
  category,
  onClose,
  onOpenExternal,
  onEditCategory,
  onDelete,
  onViewLinkedNotes,
}: SourceDetailPanelProps) {
  const [whyExpanded, setWhyExpanded] = useState<boolean>(false);
  const [actionsOpen, setActionsOpen] = useState<boolean>(false);

  const known = isKnownRetrievalType(source.type);
  const meta = known ? RETRIEVAL_TYPE_META[source.type as RetrievalType] : null;
  const Icon = meta?.icon ?? null;
  const domain = formatUrl(source.url);
  const previewNotes = notes.slice(0, MAX_PREVIEW_NOTES);
  const overflowNotesCount = Math.max(0, notes.length - MAX_PREVIEW_NOTES);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar with close button */}
      <header className="flex items-start justify-between gap-3 border-b border-border/60 px-6 py-5">
        <div className="min-w-0 flex-1">
          {known ? (
            <ResourceTypeBadge type={source.type as string} size="compact" />
          ) : (
            <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Source
            </span>
          )}
          <h2 className="m-0 mt-3 font-serif text-[22px] leading-snug text-foreground">
            {source.title}
          </h2>
          <p className="m-0 mt-1 font-serif text-[13px] italic text-muted-foreground">
            by {source.author}
            {source.type !== 'Twitter' && domain ? (
              <>
                <span aria-hidden="true" className="not-italic text-muted-light"> · </span>
                <span className="not-italic font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-light">
                  {domain}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={meta
              ? { backgroundColor: meta.bg, color: meta.ink }
              : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            {Icon ? <Icon size={22} /> : <NotebookPen size={22} />}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Metadata table */}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 font-serif text-[14px] text-foreground">
          <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Saved on
          </dt>
          <dd className="m-0">{formatSavedOn(source.createdAt)}</dd>

          <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Source
          </dt>
          <dd className="m-0">{domain}</dd>

          {source.length ? (
            <>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Length
              </dt>
              <dd className="m-0">{source.length}</dd>
            </>
          ) : null}

          <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Category
          </dt>
          <dd className="m-0">{category?.name ?? 'Uncategorized'}</dd>
        </dl>

        {/* Summary = Key Insights */}
        {source.keyInsights ? (
          <section className="mt-7">
            <h3 className="m-0 mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Summary
            </h3>
            <p className="m-0 whitespace-pre-line font-serif text-[15px] leading-relaxed text-foreground">
              {source.keyInsights}
            </p>
          </section>
        ) : null}

        {/* Why this matters (collapsed by default) */}
        {source.whyMatters ? (
          <section className="mt-7">
            <button
              type="button"
              onClick={() => setWhyExpanded((expanded) => !expanded)}
              aria-expanded={whyExpanded}
              className="flex w-full items-center justify-between rounded-md font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
            >
              Why this matters
              {whyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {whyExpanded ? (
              <p className="m-0 mt-2 whitespace-pre-line font-serif text-[15px] italic leading-relaxed text-foreground">
                {source.whyMatters}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Linked notes preview */}
        <section className="mt-7">
          <h3 className="m-0 mb-2 font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Linked notes
          </h3>
          {previewNotes.length === 0 ? (
            <p className="m-0 font-serif text-[14px] italic text-muted-foreground">
              No notes linked yet. Create one from the Notes tab to start
              annotating this source.
            </p>
          ) : (
            <ul className="m-0 list-none space-y-3 p-0">
              {previewNotes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-lg bg-muted/50 px-3 py-2.5 text-[13px]"
                >
                  <p className="m-0 line-clamp-3 font-serif text-foreground">
                    {note.content}
                  </p>
                  <p className="m-0 mt-1 font-sans text-[10px] uppercase tracking-[0.2em] text-muted-light">
                    {formatNoteDate(note.createdAt)}
                  </p>
                </li>
              ))}
              {overflowNotesCount > 0 ? (
                <li className="font-serif text-[12px] italic text-muted-foreground">
                  {MAX_PREVIEW_NOTES} shown of {notes.length}
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {/* Primary CTA: cross-tab nav */}
        <button
          type="button"
          onClick={onViewLinkedNotes}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-sans text-[13px] font-semibold uppercase tracking-[0.18em] text-primary-foreground transition-colors hover:bg-primary/90"
        >
          View linked notes in Notes tab
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Secondary actions row */}
      <footer className="flex items-center gap-1 border-t border-border/60 px-4 py-3">
        <button
          type="button"
          onClick={onOpenExternal}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ExternalLink size={13} />
          Open source
        </button>
        <button
          type="button"
          onClick={onEditCategory}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <FolderEdit size={13} />
          Edit category
        </button>
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
          >
            <MoreHorizontal size={16} />
          </button>
          {actionsOpen ? (
            <div
              role="menu"
              className={cn(
                'absolute bottom-full right-0 z-20 mb-1 min-w-[200px] rounded-lg border border-border bg-card p-1 shadow-card-hover',
              )}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setActionsOpen(false);
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
      </footer>
    </div>
  );
}
