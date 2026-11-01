import { FormEvent, useEffect, useRef, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useCategories } from '@/hooks/useCategories';
import { useToast } from '@/hooks/use-toast';
import type { Category } from '@/types/second-brain';
import { tokens } from '@/lib/colors';

export interface AddCategoryModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (category: Category) => void;
}

const inputClassName =
  'w-full rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong creating the category.';
}

/**
 * Spec 03 FR8 — modal for creating a new category.
 *
 * Re-used by the Categories sub-tab (spec 05) and by the bulk
 * Recategorize modal's "+ Create new category" affordance.
 *
 * Body: name input (required, trimmed). Sort order is auto-appended by
 * the storage layer when omitted.
 */
export function AddCategoryModal({ slug, open, onClose, onCreated }: AddCategoryModalProps) {
  const { toast } = useToast();
  const { createCategory } = useCategories(slug);
  const [name, setName] = useState('');
  const [isSubmitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on each open and autofocus the name input.
  useEffect(() => {
    if (!open) return;
    setName('');
    setSubmitError(null);
    setSubmitting(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const category = await createCategory(trimmed);
      onCreated?.(category);
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      setSubmitError(message);
      toast({
        title: 'Could not create category',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{ backgroundColor: tokens.overlay }}
      onClick={onClose}
      role="presentation"
    >
      <form
        onSubmit={submit}
        onClick={(event) => event.stopPropagation()}
        className="w-[95%] max-w-[480px] rounded-xl bg-card-elevated p-8 shadow-card"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              <FolderPlus size={14} className="text-muted-light" aria-hidden="true" />
              <span>New category</span>
            </div>
            <p className="mb-0 mt-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
              Name a shelf for grouping your saved sources and notes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add category modal"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <label className="block">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            Name
          </span>
          <input
            ref={inputRef}
            type="text"
            className={inputClassName}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Battery chemistry"
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        {submitError ? (
          <div className="mt-4 rounded-lg bg-warning-soft px-4 py-3 font-serif text-[13px] italic text-muted-foreground">
            {submitError}
          </div>
        ) : null}

        <div className="mt-8 flex justify-end gap-3">
          <TactileButton type="button" variant="inset" className="text-[12px]" onClick={onClose}>
            Cancel
          </TactileButton>
          <TactileButton
            type="submit"
            variant="raised"
            className="text-[12px]"
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Creating…' : 'Create category'}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
