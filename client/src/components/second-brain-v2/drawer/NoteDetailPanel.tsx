import { useMemo, useState } from 'react';
import { Pencil, Trash2, ArrowUpRight, X, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category, Note, Source } from '@/types/second-brain';
import { SourceTypeahead } from '../shared/SourceTypeahead';

export interface NoteDetailPanelProps {
  slug: string;
  note: Note;
  linkedSource: Source | null;
  category: Category | null;
  categories: Category[];
  onClose: () => void;
  onSave: (patch: {
    content?: string;
    categoryId?: number | null;
    sourceId?: number | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onJumpToSource: (sourceId: number) => void;
}

function formatLong(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Body of the Notes drawer. View mode shows the note + metadata + actions;
 * Edit mode swaps in a textarea, category select, and a collapsible
 * source typeahead (Link-to-source section). Save calls `onSave(patch)`
 * with only the changed fields.
 */
export function NoteDetailPanel({
  slug,
  note,
  linkedSource,
  category,
  categories,
  onClose,
  onSave,
  onDelete,
  onJumpToSource,
}: NoteDetailPanelProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
  const [draftContent, setDraftContent] = useState(note.content);
  const [draftCategoryId, setDraftCategoryId] = useState<number | null>(note.categoryId);
  const [draftSourceId, setDraftSourceId] = useState<number | null>(note.sourceId);
  const [linkExpanded, setLinkExpanded] = useState<boolean>(note.sourceId != null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStandalone = note.sourceId == null || linkedSource == null;
  const trimmed = draftContent.trim();
  const dirty = useMemo(() => {
    return (
      trimmed !== note.content
      || draftCategoryId !== note.categoryId
      || draftSourceId !== note.sourceId
    );
  }, [trimmed, draftCategoryId, draftSourceId, note]);

  const enterEdit = () => {
    setDraftContent(note.content);
    setDraftCategoryId(note.categoryId);
    setDraftSourceId(note.sourceId);
    setLinkExpanded(note.sourceId != null);
    setError(null);
    setMode('edit');
  };

  const cancelEdit = () => {
    setDraftContent(note.content);
    setDraftCategoryId(note.categoryId);
    setDraftSourceId(note.sourceId);
    setError(null);
    setMode('view');
  };

  const handleSave = async () => {
    if (!trimmed) return;
    const patch: { content?: string; categoryId?: number | null; sourceId?: number | null } = {};
    if (trimmed !== note.content) patch.content = trimmed;
    if (draftCategoryId !== note.categoryId) patch.categoryId = draftCategoryId;
    if (draftSourceId !== note.sourceId) patch.sourceId = draftSourceId;
    if (Object.keys(patch).length === 0) {
      setMode('view');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(patch);
      setMode('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
      setIsSaving(false);
      setMode('view');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.2em]',
            isStandalone
              ? 'bg-muted text-muted-foreground'
              : 'bg-primary/10 text-primary',
          )}
          data-testid="note-detail-type-badge"
        >
          {isStandalone ? 'Standalone' : (linkedSource?.type ?? 'Source')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X size={14} />
        </button>
      </header>

      {mode === 'view' ? (
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5">
          <p
            className="m-0 whitespace-pre-wrap break-words font-serif text-[16px] leading-relaxed text-foreground"
            data-testid="note-detail-body"
          >
            {note.content}
          </p>

          {/* `minmax(0,1fr)` (not bare `1fr`) is what lets the value column
              actually shrink below its intrinsic content width — without it,
              a long linked-source title forces the grid to overflow the
              drawer and produce a horizontal scrollbar. */}
          <dl className="mt-8 grid grid-cols-[120px_minmax(0,1fr)] gap-y-3 font-sans text-[12px]">
            <dt className="uppercase tracking-[0.18em] text-muted-foreground">Created on</dt>
            <dd className="m-0 min-w-0 break-words text-foreground">{formatLong(note.createdAt)}</dd>

            <dt className="uppercase tracking-[0.18em] text-muted-foreground">Last edited</dt>
            <dd className="m-0 min-w-0 break-words text-foreground">{formatLong(note.updatedAt)}</dd>

            <dt className="uppercase tracking-[0.18em] text-muted-foreground">Category</dt>
            <dd className="m-0 min-w-0 break-words text-foreground">{category?.name ?? 'Uncategorized'}</dd>

            <dt className="uppercase tracking-[0.18em] text-muted-foreground">Linked source</dt>
            <dd className="m-0 flex min-w-0 items-center gap-2 text-foreground">
              {linkedSource ? (
                <>
                  <Link2 size={12} className="shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate" title={linkedSource.title}>{linkedSource.title}</span>
                </>
              ) : (
                <span className="italic text-muted-foreground">No source</span>
              )}
            </dd>
          </dl>
        </div>
      ) : null}

      {mode === 'edit' ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <label className="block">
            <span className="mb-1 block font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Note
            </span>
            <textarea
              value={draftContent}
              onChange={(event) => setDraftContent(event.target.value)}
              className="min-h-[200px] w-full resize-y rounded-lg bg-card px-3 py-2.5 font-serif text-[15px] leading-relaxed text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
          </label>

          <label className="mt-5 block">
            <span className="mb-1 block font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Category
            </span>
            <select
              value={draftCategoryId ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                setDraftCategoryId(next === '' ? null : Number(next));
              }}
              className="w-full appearance-none rounded-lg bg-card px-3 py-2.5 font-serif text-[14px] text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <div className="mt-5">
            <button
              type="button"
              onClick={() => setLinkExpanded((v) => !v)}
              className="inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
              aria-expanded={linkExpanded}
              data-testid="note-detail-link-toggle"
            >
              <Link2 size={12} aria-hidden />
              {linkExpanded ? 'Hide source link' : 'Link to source'}
            </button>
            {linkExpanded ? (
              <div className="mt-3">
                <SourceTypeahead
                  slug={slug}
                  value={draftSourceId}
                  onChange={setDraftSourceId}
                  placeholder="Search sources"
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 font-serif text-[13px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === 'confirm-delete' ? (
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="m-0 font-serif text-[15px] leading-relaxed text-foreground">
            Delete this note? This cannot be undone.
          </p>
        </div>
      ) : null}

      <footer className="border-t border-border bg-card-elevated px-6 py-3">
        {mode === 'view' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={enterEdit}
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-foreground shadow-card hover:bg-muted"
            >
              <Pencil size={12} aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode('confirm-delete')}
              className="inline-flex items-center gap-1.5 rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-destructive shadow-card hover:bg-destructive/10"
            >
              <Trash2 size={12} aria-hidden /> Delete
            </button>
            {linkedSource ? (
              <button
                type="button"
                onClick={() => onJumpToSource(linkedSource.id)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-sans text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
                data-testid="note-detail-jump"
              >
                Jump to source <ArrowUpRight size={12} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}

        {mode === 'edit' ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={isSaving}
              className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground shadow-card hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!trimmed || isSaving || !dirty}
              className="rounded-md bg-primary px-3 py-1.5 font-sans text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        ) : null}

        {mode === 'confirm-delete' ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode('view')}
              disabled={isSaving}
              className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground shadow-card hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving}
              className="rounded-md bg-destructive px-3 py-1.5 font-sans text-[12px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {isSaving ? 'Deleting...' : 'Confirm delete'}
            </button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
