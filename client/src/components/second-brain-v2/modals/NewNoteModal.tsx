import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Link2 } from 'lucide-react';
import { useNotes } from '@/hooks/useNotes';
import type { Note } from '@/types/second-brain';
import { SourceTypeahead } from '../shared/SourceTypeahead';

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
 * Modal for creating a new note. Body is required; the linked source is
 * optional. There is no category field — category is inherited from the
 * linked source (or null for standalone notes).
 */
export function NewNoteModal({
  slug,
  open,
  onClose,
  defaultSourceId,
  onCreated,
}: NewNoteModalProps) {
  const { createNote, isCreating } = useNotes(slug);

  const [content, setContent] = useState('');
  const [sourceId, setSourceId] = useState<number | null>(defaultSourceId ?? null);
  const [linkExpanded, setLinkExpanded] = useState<boolean>(defaultSourceId != null);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the modal closes/opens.
  useEffect(() => {
    if (!open) {
      setContent('');
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

  const handleSubmit = async () => {
    if (!trimmed) return;
    setError(null);
    try {
      const note = await createNote({
        content: trimmed,
        sourceId,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="New note">
          <motion.div
            className="absolute inset-0 bg-foreground/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            data-testid="new-note-modal-backdrop"
          />
          <motion.div
            className="relative w-full max-w-[560px] rounded-2xl bg-card shadow-card-hover"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
              <h2 className="m-0 font-sans text-[16px] font-semibold text-foreground">
                New note
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={14} />
              </button>
            </header>

            <div className="px-6 py-5">
              <label className="block">
                <span className="mb-1 block font-sans text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Note
                </span>
                <textarea
                  required
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="Capture an idea, a quote, a connection..."
                  className="min-h-[180px] w-full resize-y rounded-lg bg-card-elevated px-3 py-2.5 font-serif text-[15px] leading-relaxed text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30"
                  autoFocus
                />
              </label>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setLinkExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
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

            <footer className="flex items-center justify-end gap-2 border-t border-border bg-card-elevated px-6 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isCreating}
                className="rounded-md bg-card px-3 py-1.5 font-sans text-[12px] font-medium text-muted-foreground shadow-card hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!trimmed || isCreating}
                className="rounded-md bg-primary px-3 py-1.5 font-sans text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create note'}
              </button>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
