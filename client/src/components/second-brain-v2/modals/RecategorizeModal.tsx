import { FormEvent, useEffect, useState } from 'react';
import { Check, FolderEdit, Plus, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useCategories } from '@/hooks/useCategories';
import type { Category } from '@/types/second-brain';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { AddCategoryModal } from './AddCategoryModal';

export interface RecategorizeModalProps {
  slug: string;
  open: boolean;
  /** Number of selected sources — shown in the modal header for context. */
  selectionCount: number;
  onClose: () => void;
  onConfirm: (categoryId: number) => void | Promise<void>;
}

/**
 * Spec 03 FR9 — bulk recategorize picker.
 *
 * Surfaced from the BulkActionBar's "Move to category" action. Body:
 * scrollable list of categories with source-count hints; an inline
 * "+ Create new category" affordance opens the AddCategoryModal and
 * auto-selects the freshly created shelf.
 */
export function RecategorizeModal({
  slug,
  open,
  selectionCount,
  onClose,
  onConfirm,
}: RecategorizeModalProps) {
  const { categories } = useCategories(slug);
  const [picked, setPicked] = useState<number | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setSubmitting(false);
    setCreateOpen(false);
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // If the AddCategoryModal is open it owns the Escape; bail.
        if (isCreateOpen) return;
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isCreateOpen, onClose]);

  if (!open) return null;

  const canSubmit = picked != null && !isSubmitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || picked == null) return;
    setSubmitting(true);
    try {
      await onConfirm(picked);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreated = (category: Category) => {
    setPicked(category.id);
    setCreateOpen(false);
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
        className="flex max-h-[85vh] w-[95%] max-w-[480px] flex-col rounded-xl bg-card-elevated p-7 shadow-card"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              <FolderEdit size={14} className="text-muted-light" aria-hidden="true" />
              <span>Move to category</span>
            </div>
            <p className="mb-0 mt-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
              Pick a category for {selectionCount} selected{' '}
              {selectionCount === 1 ? 'source' : 'sources'}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recategorize modal"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="-mr-2 max-h-[44vh] flex-1 overflow-y-auto pr-2">
          <ul className="m-0 list-none space-y-1 p-0">
            {categories.map((category) => {
              const isPicked = picked === category.id;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(category.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left font-serif text-[14px] transition-colors',
                      isPicked
                        ? 'bg-primary/10 text-foreground'
                        : 'text-foreground hover:bg-muted',
                    )}
                    aria-pressed={isPicked}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Check
                        size={14}
                        strokeWidth={3}
                        className={cn(
                          'text-primary transition-opacity',
                          isPicked ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {category.name}
                    </span>
                    {category.sourceCount != null && category.sourceCount > 0 ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
                        {category.sourceCount}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left font-sans text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Plus size={12} strokeWidth={2.5} />
            </span>
            Create new category
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <TactileButton type="button" variant="inset" className="text-[12px]" onClick={onClose}>
            Cancel
          </TactileButton>
          <TactileButton
            type="submit"
            variant="raised"
            className="text-[12px]"
            disabled={!canSubmit}
          >
            {isSubmitting ? 'Moving…' : 'Move'}
          </TactileButton>
        </div>
      </form>

      <AddCategoryModal
        slug={slug}
        open={isCreateOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
