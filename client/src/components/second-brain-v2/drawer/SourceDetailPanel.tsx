import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FolderEdit,
  Globe,
  Loader2,
  MoreHorizontal,
  NotebookPen,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import type { Category, Note, Source } from '@/types/second-brain';
import { RETRIEVAL_TYPE_META, resolveRetrievalType } from '@/components/research-stream/retrieval-meta';
import { ExpandedItemView } from '@/components/learning-stream';
import { useEnsureLearningStreamItem } from '@/hooks/useEnsureLearningStreamItem';
import { formatUrl } from '@/lib/url';
import { cn } from '@/lib/utils';

export interface SourceDetailPanelProps {
  slug: string;
  source: Source;
  notes: Note[];
  category: Category | null;
  onClose: () => void;
  onOpenExternal: () => void;
  onEditCategory: () => void;
  onDelete: () => void;
  /** Switches the shell to ?sb=notes&filterSource=<id>. */
  onViewLinkedNotes: () => void;
  /** Reading mode is owned by the parent so the drawer can widen. */
  isReading: boolean;
  onToggleReading: (next: boolean) => void;
}


function formatSavedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
 *   6. Primary CTA: Read source (drawer reading mode)
 *   7. Secondary link: View linked notes in Notes tab
 *   8. Secondary actions: Open source · Edit category · Delete
 *
 * The inline notes-preview section was removed in spec 02 FR5
 * (reader-notes-pane) — note triage now lives in the reader's Notes pane.
 * Nulls in spec-01 enrichment fields collapse the corresponding section.
 */
export function SourceDetailPanel({
  slug,
  source,
  notes,
  category,
  onClose,
  onOpenExternal,
  onEditCategory,
  onDelete,
  onViewLinkedNotes,
  isReading,
  onToggleReading,
}: SourceDetailPanelProps) {
  const [summaryExpanded, setSummaryExpanded] = useState<boolean>(false);
  const [whyExpanded, setWhyExpanded] = useState<boolean>(false);
  const [actionsOpen, setActionsOpen] = useState<boolean>(false);

  const resolved = resolveRetrievalType(source.type);
  const meta = resolved ? RETRIEVAL_TYPE_META[resolved] : null;
  const Icon = meta?.icon ?? null;
  const domain = formatUrl(source.url);

  if (isReading) {
    return (
      <ReadingMode
        slug={slug}
        sourceId={source.id}
        onBack={() => onToggleReading(false)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: badge (left) + close (right) */}
      <div className="flex items-center justify-between px-6 pt-5">
        {meta ? (
          <span
            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ backgroundColor: meta.bg, color: meta.ink }}
          >
            {Icon ? <Icon size={10} /> : null}
            {meta.label}
          </span>
        ) : (
          <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Source
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {/* Header: title + publisher + big icon */}
      <header className="flex items-start justify-between gap-4 px-6 pb-5 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 break-words font-serif text-[22px] font-semibold leading-[1.2] text-foreground">
            {source.title}
          </h2>
          <p className="m-0 mt-2 break-words font-sans text-[13px] text-muted-foreground">
            {source.author}
          </p>
          {source.type !== 'Twitter' && domain ? (
            <p className="m-0 mt-0.5 break-all font-mono text-[10px] uppercase tracking-[0.2em] text-muted-light">
              {domain}
            </p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
          style={meta
            ? { backgroundColor: meta.bg, color: meta.ink }
            : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }}
        >
          {Icon ? <Icon size={26} /> : <NotebookPen size={26} />}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6">
        {/* Metadata table — icon + label (left) / value (right) */}
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2.5 border-t border-border/60 pt-5 font-sans text-[13px] text-foreground">
          <MetaLabel icon={CalendarDays}>Saved on</MetaLabel>
          <dd className="m-0">{formatSavedOn(source.createdAt)}</dd>

          <MetaLabel icon={Globe}>Source</MetaLabel>
          <dd className="m-0 min-w-0 break-all">{domain}</dd>

          {source.length ? (
            <>
              <MetaLabel icon={Clock}>Length</MetaLabel>
              <dd className="m-0">{source.length}</dd>
            </>
          ) : null}

          <MetaLabel icon={Tag}>Category</MetaLabel>
          <dd className="m-0">
            {category ? (
              <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                {category.name}
              </span>
            ) : (
              <span className="italic text-muted-foreground">Uncategorized</span>
            )}
          </dd>
        </dl>

        {/* Summary = Key Insights (3-line clamp by default; toggle to expand) */}
        {source.keyInsights ? (
          <section className="mt-6">
            <h3 className="m-0 mb-2 font-sans text-[11px] font-semibold tracking-[0.04em] text-foreground">
              Summary
            </h3>
            <p
              className={cn(
                'm-0 whitespace-pre-line font-serif text-[14px] leading-[1.55] text-muted-foreground',
                summaryExpanded ? '' : 'line-clamp-3',
              )}
            >
              {source.keyInsights}
            </p>
            <button
              type="button"
              onClick={() => setSummaryExpanded((expanded) => !expanded)}
              aria-expanded={summaryExpanded}
              className="mt-1.5 inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-primary hover:underline"
            >
              {summaryExpanded ? 'Show less' : 'Show more'}
              {summaryExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          </section>
        ) : null}

        {/* Why this matters (collapsed by default) */}
        {source.whyMatters ? (
          <section className="mt-6">
            <button
              type="button"
              onClick={() => setWhyExpanded((expanded) => !expanded)}
              aria-expanded={whyExpanded}
              className="flex w-full items-center justify-between rounded-md font-sans text-[11px] font-semibold text-foreground hover:text-primary"
            >
              Why this matters
              {whyExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {whyExpanded ? (
              <p className="m-0 mt-2 whitespace-pre-line font-serif text-[14px] italic leading-[1.55] text-muted-foreground">
                {source.whyMatters}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* Spec 02 FR5: the inline notes-preview block was removed —
            notes triage now lives in the reader's Notes pane. The Read
            source CTA + the secondary View linked notes link below cover
            both the per-source and the bulk-view paths. */}

        {/* Primary CTA: switch the drawer into in-app reading mode.
            Always available — works for any source, regardless of whether
            it was mirrored from Research Stream or added manually. */}
        <button
          type="button"
          onClick={() => onToggleReading(true)}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-sans text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <BookOpen size={14} />
          Read source
          <ArrowRight size={14} />
        </button>

        {/* Secondary CTA: hop to the Notes tab pre-filtered to this source. */}
        <button
          type="button"
          onClick={onViewLinkedNotes}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          View linked notes in Notes tab
          <ArrowRight size={14} />
        </button>

        <div className="h-5" />
      </div>

      {/* Secondary actions row */}
      <footer className="flex items-center gap-2 border-t border-border/60 px-5 py-3">
        <button
          type="button"
          onClick={onOpenExternal}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ExternalLink size={13} />
          Open source
        </button>
        <button
          type="button"
          onClick={onEditCategory}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <FolderEdit size={13} />
          Edit category
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            className="rounded-md border border-border bg-card p-2 text-foreground transition-colors hover:bg-muted"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={actionsOpen}
          >
            <MoreHorizontal size={14} />
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
                Remove from saved
              </button>
            </div>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function MetaLabel({ icon: Icon, children }: { icon: typeof CalendarDays; children: React.ReactNode }) {
  return (
    <dt className="flex items-center gap-2 font-sans text-[11px] font-medium text-muted-foreground">
      <Icon size={13} className="text-muted-light" />
      {children}
    </dt>
  );
}

interface ReadingModeProps {
  slug: string;
  sourceId: number;
  onBack: () => void;
}

/**
 * Full in-app reader for a source. Renders the same ExpandedItemView the
 * Research Stream uses (content viewer + chat + quiz tabs). For sources
 * that don't yet have an underlying learning_stream_item, we lazy-create
 * one server-side via `useEnsureLearningStreamItem` and queue content
 * extraction so the user just sees a loading state and then the article.
 */
function ReadingMode({ slug, sourceId, onBack }: ReadingModeProps) {
  const { item, isLoading, error } = useEnsureLearningStreamItem(slug, sourceId);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 px-6 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-sans text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to source details"
        >
          <ArrowLeft size={13} />
          Details
        </button>
        <div className="min-w-0 flex-1 text-center font-sans text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Reading
        </div>
        <div className="w-[62px]" aria-hidden="true" />
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        {isLoading || !item ? (
          error ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="m-0 max-w-[420px] font-serif text-[14px] italic text-destructive">
                {error}
              </p>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 font-sans text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Back to details
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16">
              <Loader2 size={28} className="animate-spin text-muted-foreground" />
              <p className="m-0 font-serif text-[13px] italic text-muted-foreground">
                Preparing reader…
              </p>
            </div>
          )
        ) : (
          <ExpandedItemView item={item} slug={slug} onClose={onBack} />
        )}
      </div>
    </div>
  );
}
