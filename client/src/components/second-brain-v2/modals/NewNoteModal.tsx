import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NotebookPen, X, Link2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useNotes } from '@/hooks/useNotes';
import { useSources } from '@/hooks/useSources';
import { tokens } from '@/lib/colors';
import type { Note } from '@/types/second-brain';
import { SourceTypeahead } from '../shared/SourceTypeahead';
import { CategoryTypeahead } from '../shared/CategoryTypeahead';

export interface NewNoteModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Pre-fill source if opened from a source context. Auto-expands the
   *  Link-to-source section. */
  defaultSourceId?: number;
  onCreated?: (note: Note) => void;
}

/**
 * Modal for creating a new note. Body is required; category and linked
 * source are both optional and independent. A note can be standalone,
 * categorized, linked to a source, or both categorized and linked.
 */
export function NewNoteModal({
  slug,
  open,
  onClose,
  defaultSourceId,
  onCreated,
}: NewNoteModalProps) {
  const { createNote, isCreating } = useNotes(slug);
  const { data: sources } = useSources(slug);

  const [content, setContent] = useState('');
  // User's explicit category pick. Only used when no source is linked;
  // once a source is linked the inherited category wins.
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [sourceId, setSourceId] = useState<number | null>(defaultSourceId ?? null);
  const [linkExpanded, setLinkExpanded] = useState<boolean>(defaultSourceId != null);
  const [error, setError] = useState<string | null>(null);

  const linkedSource = useMemo(() => {
    if (sourceId == null) return null;
    return sources?.find((s) => s.id === sourceId) ?? null;
  }, [sources, sourceId]);
  // Notes inherit their linked source's category. When a source is
  // linked, the source's categoryId wins over the user's pick.
  const effectiveCategoryId = linkedSource ? linkedSource.categoryId : categoryId;

  // Reset state whenever the modal closes/opens.
  useEffect(() => {
    if (!open) {
      setContent('');
      setCategoryId(null);
      setError(null);
      return;
    }
    setSourceId(defaultSourceId ?? null);
    setLinkExpanded(defaultSourceId != null);
  }, [open, defaultSourceId]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const trimmed = content.trim();
  const canSubmit = trimmed.length > 0 && !isCreating;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const note = await createNote({
        content: trimmed,
        sourceId,
        categoryId: effectiveCategoryId,
      });
      onCreated?.(note);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
          style={{ backgroundColor: tokens.overlay }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="New note"
        >
          <motion.form
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[90vh] w-full max-w-[560px] flex-col rounded-xl bg-card-elevated p-6 shadow-card"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                <NotebookPen size={14} className="text-muted-light" aria-hidden />
                <span>New note</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close new note modal"
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block">
                <span className="mb-2 block font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Note
                </span>
                <textarea
                  required
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="What did you notice, react to, or want to remember?"
                  className="min-h-[180px] w-full resize-y rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30"
                  autoFocus
                />
              </label>

              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Category
                  </span>
                  <span className="font-sans text-[10px] uppercase tracking-[0.22em] text-muted-light">
                    {linkedSource ? 'Inherited from source' : 'Optional · leave blank for none'}
                  </span>
                </div>
                <CategoryTypeahead
                  slug={slug}
                  value={effectiveCategoryId}
                  onChange={setCategoryId}
                  placeholder="Search categories"
                  disabled={linkedSource != null}
                  disabledReason={
                    linkedSource
                      ? 'Notes inherit the category of the source they link to. Unlink the source to pick a category manually.'
                      : undefined
                  }
                />
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setLinkExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
                  aria-expanded={linkExpanded}
                  data-testid="new-note-link-toggle"
                >
                  <Link2 size={12} aria-hidden />
                  {linkExpanded ? 'Hide source link' : 'Link to source'}
                </button>
                {linkExpanded ? (
                  <div className="mt-3">
                    <SourceTypeahead
                      slug={slug}
                      value={sourceId}
                      onChange={setSourceId}
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

            <div className="mt-4 flex justify-end gap-3">
              <TactileButton
                type="button"
                variant="inset"
                className="text-[12px]"
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </TactileButton>
              <TactileButton
                type="submit"
                variant="raised"
                className="text-[12px]"
                disabled={!canSubmit}
              >
                {isCreating ? 'Creating…' : 'Create note'}
              </TactileButton>
            </div>
          </motion.form>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
