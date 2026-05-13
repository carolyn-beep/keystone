import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Loader2, Plus, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useBookmarkResearchStreamItem } from '@/hooks/useBookmarkResearchStreamItem';
import { useCategories } from '@/hooks/useCategories';
import { useToast } from '@/hooks/use-toast';
import { tokens } from '@/lib/colors';
import type { Source } from '@/types/second-brain';
import { cn } from '@/lib/utils';

export interface BookmarkCategoryDialogProps {
  slug: string;
  itemId: number;
  open: boolean;
  onClose: () => void;
  onSaved?: (source: Source) => void;
}

const inputClassName =
  'w-full rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30';

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong.';
  try {
    const jsonStart = error.message.indexOf('{');
    if (jsonStart >= 0) {
      const parsed = JSON.parse(error.message.slice(jsonStart));
      return parsed.message ?? parsed.error ?? error.message;
    }
  } catch {
    return error.message;
  }
  return error.message;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function BookmarkCategoryDialog({ slug, itemId, open, onClose, onSaved }: BookmarkCategoryDialogProps) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLFormElement>(null);
  const { categories, isLoading, createCategory, isCreating } = useCategories(slug);
  const bookmarkMutation = useBookmarkResearchStreamItem(slug);
  const bookmarkResearchStreamItem = bookmarkMutation.mutateAsync;
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const trimmedName = newCategoryName.trim();
  const isSaving = isCreating || bookmarkMutation.isPending;
  const canSubmit = !isSaving && (createMode ? trimmedName.length > 0 : selectedCategoryId != null);

  const orderedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const orderA = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  }, [categories]);
  const firstCategoryId = orderedCategories[0]?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setSelectedCategoryId(firstCategoryId);
    setCreateMode(orderedCategories.length === 0);
    setNewCategoryName('');
    setSubmitError(null);
  }, [firstCategoryId, open, orderedCategories.length]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      focusableElements(dialogRef.current ?? document.body)[0]?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitError(null);
    try {
      let categoryId = selectedCategoryId;
      if (createMode) {
        const created = await createCategory(trimmedName);
        setSelectedCategoryId(created.id);
        setCreateMode(false);
        categoryId = created.id;
      }

      if (typeof categoryId !== 'number') return;

      const result = await bookmarkResearchStreamItem({ itemId, categoryId });
      onSaved?.(result.source);
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      setSubmitError(message);
      toast({
        title: 'Could not save to Second Brain',
        description: message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{ backgroundColor: tokens.overlay }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookmark-category-dialog-title"
        onSubmit={submit}
        onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-[95%] max-w-[600px] overflow-auto rounded-xl bg-card-elevated p-8 shadow-card sm:p-10"
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              <BookmarkPlus size={14} className="text-muted-light" aria-hidden />
              <span>Research Stream → Second Brain</span>
            </div>
            <h3 id="bookmark-category-dialog-title" className="mb-0 mt-2 font-serif text-[28px] leading-tight tracking-tight text-foreground">
              Choose a shelf
            </h3>
            <p className="mb-0 mt-3 max-w-[460px] font-serif text-[14px] italic leading-relaxed text-muted-foreground">
              Decide where this source belongs before adding it to your research
              library. Shelves keep the library navigable as it grows.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-transparent p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close bookmark dialog"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 text-[13px] text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              <span>Loading shelves…</span>
            </div>
          ) : null}

          {!isLoading && orderedCategories.length > 0 ? (
            <div>
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                Existing shelves
              </span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {orderedCategories.map((category) => {
                  const isPicked = !createMode && selectedCategoryId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setSubmitError(null);
                        setCreateMode(false);
                        setSelectedCategoryId(category.id);
                      }}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-left transition-all',
                        isPicked
                          ? 'bg-primary/5 ring-1 ring-primary/40 shadow-card'
                          : 'bg-card hover:bg-card-elevated hover:shadow-card',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.25em] text-foreground">
                        {category.name}
                      </span>
                      {category.sourceCount != null && category.sourceCount > 0 ? (
                        <span className="rounded-full bg-muted px-1.5 py-[1px] font-serif text-[10px] text-muted-foreground">
                          {category.sourceCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isLoading ? (
            <div>
              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  setCreateMode(true);
                  setSelectedCategoryId(null);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-all',
                  createMode
                    ? 'bg-primary/5 ring-1 ring-primary/40 shadow-card'
                    : 'bg-card hover:bg-card-elevated hover:shadow-card',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus size={14} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">
                    New shelf
                  </span>
                  <span className="mt-0.5 block font-serif text-[12px] italic leading-snug text-muted-foreground">
                    Create a category that gives this source an intentional home.
                  </span>
                </span>
              </button>
              {createMode ? (
                <div className="mt-3">
                  <input
                    className={inputClassName}
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="e.g. Market Signals"
                    disabled={isSaving}
                    autoFocus
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {submitError ? (
          <div className="mt-6 rounded-lg bg-warning-soft px-4 py-3 font-serif text-[13px] italic text-muted-foreground">
            {submitError}
          </div>
        ) : null}

        <div className="mt-8 flex justify-end gap-3">
          <TactileButton type="button" variant="inset" className="text-[12px]" onClick={onClose} disabled={isSaving}>
            Cancel
          </TactileButton>
          <TactileButton type="submit" variant="raised" className="inline-flex items-center gap-2 text-[12px]" disabled={!canSubmit}>
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
            {createMode ? 'Create & save source' : 'Save source'}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
