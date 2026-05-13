import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useToast } from '@/hooks/use-toast';
import { useCategories } from '@/hooks/useCategories';
import { useSources } from '@/hooks/useSources';
import { tokens } from '@/lib/colors';
import { cn } from '@/lib/utils';
import type { Category, JsonValue } from '@/types/second-brain';

export interface AddSourceModalProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  defaultCategoryId?: number;
}

interface PrefetchPayload {
  title?: string;
  author?: string | null;
  extractedContent?: JsonValue | null;
  error?: string;
}

interface CategoryValue {
  /** Existing category id, or null if the user typed a new name. */
  id: number | null;
  /** Display/typed name. For an existing pick, mirrors `category.name`. */
  name: string;
}

const inputClassName =
  'w-full rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30';

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
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
  return 'Something went wrong.';
}

function findCategoryByName(categories: Category[], name: string): Category | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  return categories.find((c) => c.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Combobox for picking or creating a category. Typed text filters the
 * existing list; if there's no exact match a "+ Create '…'" row appears
 * as the last option. A chevron on the right makes the field read as a
 * picker even before the user starts typing. Mouse + keyboard supported.
 */
function CategoryCombobox({
  categories,
  value,
  onChange,
  disabled,
}: {
  categories: Category[];
  value: CategoryValue;
  onChange: (next: CategoryValue) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = value.name.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(query));
  }, [categories, query]);
  const exactMatch = useMemo(
    () => findCategoryByName(categories, value.name),
    [categories, value.name],
  );
  const showCreate = value.name.trim().length > 0 && !exactMatch;

  // Close when clicking outside.
  useEffect(() => {
    if (!isOpen) return;
    function handlePointer(event: PointerEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [isOpen]);

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      return;
    }
    if (event.key === 'Enter') {
      // Let the parent form handle submit (Enter on the input). We just
      // make sure the popover collapses out of the way.
      setIsOpen(false);
    }
  }

  function pickExisting(category: Category) {
    onChange({ id: category.id, name: category.name });
    setIsOpen(false);
    inputRef.current?.blur();
  }

  function pickCreate() {
    const trimmed = value.name.trim();
    if (!trimmed) return;
    onChange({ id: null, name: trimmed });
    setIsOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        className={cn(inputClassName, 'pr-10')}
        value={value.name}
        disabled={disabled}
        onChange={(event) => {
          // Editing breaks the existing-id binding; we re-resolve to an
          // exact match (if any) at submit time.
          onChange({ id: null, name: event.target.value });
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKey}
        placeholder="Type or pick a category…"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (isOpen) {
            setIsOpen(false);
            inputRef.current?.blur();
          } else {
            setIsOpen(true);
            inputRef.current?.focus();
          }
        }}
        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-light transition-colors hover:bg-muted hover:text-foreground"
        aria-label={isOpen ? 'Close category picker' : 'Open category picker'}
      >
        <ChevronDown
          size={14}
          className={cn('transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      {isOpen && (matches.length > 0 || showCreate) ? (
        <ul
          className="absolute left-0 right-0 z-20 mt-1 max-h-[260px] overflow-y-auto rounded-lg border border-border bg-card-elevated p-1 shadow-card"
          role="listbox"
        >
          {matches.map((category) => {
            const isSelected = value.id === category.id;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickExisting(category);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-primary/5',
                    isSelected ? 'bg-primary/[0.04] text-foreground' : 'text-foreground',
                  )}
                >
                  <Check
                    size={12}
                    strokeWidth={3}
                    className={cn(
                      'shrink-0 text-primary transition-opacity',
                      isSelected ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-serif">{category.name}</span>
                  {category.sourceCount != null && category.sourceCount > 0 ? (
                    <span className="rounded-full bg-muted px-1.5 py-[1px] font-serif text-[10px] text-muted-foreground">
                      {category.sourceCount}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}

          {matches.length > 0 && showCreate ? (
            <li className="my-1 border-t border-border" />
          ) : null}

          {showCreate ? (
            <li>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickCreate();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-primary/5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus size={12} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  Create category
                  <span className="ml-1 font-serif italic text-muted-foreground">
                    “{value.name.trim()}”
                  </span>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

const PREFETCH_DEBOUNCE_MS = 600;

/** Cheap "looks like a URL" check before firing a network call. */
function looksLikeUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    if (!/^https?:/i.test(value) && /\.[a-z]{2,}/i.test(value)) {
      try {
        new URL(`https://${value}`);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function AddSourceModal({ slug, open, onClose, defaultCategoryId }: AddSourceModalProps) {
  const { toast } = useToast();
  const { categories, createCategory } = useCategories(slug);
  const { createSource } = useSources(slug);
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState<CategoryValue>({ id: null, name: '' });
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [extractedContent, setExtractedContent] = useState<JsonValue | null>(null);
  const [prefetchError, setPrefetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Monotonically-increasing token so out-of-order prefetch results
  // (e.g. user pasted URL A then quickly retyped URL B; A returns last)
  // are ignored. Every fetch captures its own sequence and bails on
  // apply if it's no longer current.
  const prefetchSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setTitle('');
    setAuthor('');
    setExtractedContent(null);
    setPrefetchError(null);
    setSubmitError(null);
    // Always start with an empty category — the user explicitly picks
    // or types one. (We don't auto-fill from the first existing
    // category; that quietly biased every new source toward the same
    // shelf.)
    setCategory({ id: null, name: '' });
    // Reset the in-flight sequence so a slow prefetch from the previous
    // open session can never resolve into a freshly-opened modal.
    prefetchSeqRef.current += 1;
    void defaultCategoryId;
  }, [defaultCategoryId, open]);

  const prefetch = useCallback(
    async (rawUrl: string) => {
      const trimmedUrl = rawUrl.trim();
      if (!trimmedUrl) return;
      const seq = ++prefetchSeqRef.current;
      setIsPrefetching(true);
      setPrefetchError(null);
      try {
        const res = await fetch(`/api/brainlifts/${slug}/sources/prefetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ url: trimmedUrl }),
        });
        const payload = await res.json().catch(() => ({} as PrefetchPayload));
        if (seq !== prefetchSeqRef.current) return;
        if (!res.ok) {
          throw new Error(payload.error ?? 'Could not fetch source metadata.');
        }
        if (payload.title) setTitle(payload.title);
        if (payload.author) setAuthor(payload.author);
        setExtractedContent(payload.extractedContent ?? null);
      } catch (error) {
        if (seq === prefetchSeqRef.current) {
          setPrefetchError(errorMessage(error));
        }
      } finally {
        if (seq === prefetchSeqRef.current) {
          setIsPrefetching(false);
        }
      }
    },
    [slug],
  );

  // Debounced auto-prefetch on URL change. Fires once the user has
  // stopped typing for `PREFETCH_DEBOUNCE_MS` AND the value looks like a
  // URL — anything shorter is almost always mid-typing and not worth a
  // round-trip. The explicit Fetch button stays as a manual override.
  useEffect(() => {
    if (!open) return;
    if (!looksLikeUrl(url)) return;
    const handle = window.setTimeout(() => {
      void prefetch(url);
    }, PREFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [url, open, prefetch]);

  if (!open) return null;

  const trimmedCategoryName = category.name.trim();
  const canSubmit = trimmedCategoryName.length > 0
    && url.trim().length > 0
    && title.trim().length > 0
    && author.trim().length > 0
    && !isSubmitting;

  async function resolveCategoryId(): Promise<number> {
    // The combobox keeps id+name in sync when the user picks an existing
    // row, but a typed-only state can still match an existing shelf by
    // name (case-insensitive) — promote those to an id rather than
    // creating a duplicate.
    if (category.id != null) return category.id;
    const exact = findCategoryByName(categories, trimmedCategoryName);
    if (exact) return exact.id;
    const created = await createCategory(trimmedCategoryName);
    return created.id;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const categoryId = await resolveCategoryId();
      await createSource({
        title: title.trim(),
        url: url.trim(),
        author: author.trim(),
        categoryId,
        extractedContent,
      });
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      setSubmitError(message);
      toast({
        title: 'Could not add source',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
      style={{ backgroundColor: tokens.overlay }}
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-[95%] max-w-[720px] overflow-auto rounded-xl bg-card-elevated p-8 shadow-card sm:p-10"
      >
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              <BookOpenCheck size={14} className="text-muted-light" aria-hidden />
              <span>Add to Second Brain</span>
            </div>
            <p className="mb-0 mt-3 font-serif text-[14px] italic leading-relaxed text-muted-foreground">
              Paste a URL and we'll try to fetch title and author. If the page
              can't be read, fill the fields by hand.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-transparent p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close add source modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              Source URL
            </span>
            <div className="flex gap-3">
              <input
                className={inputClassName}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onBlur={() => void prefetch(url)}
                placeholder="https://…"
                required
              />
              <TactileButton
                type="button"
                variant="inset"
                className="shrink-0 inline-flex items-center gap-2 text-[12px]"
                onClick={() => void prefetch(url)}
                disabled={isPrefetching || url.trim().length === 0}
              >
                {isPrefetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Fetch
              </TactileButton>
            </div>
          </label>

          {prefetchError ? (
            <p className="m-0 font-serif text-[13px] italic text-muted-foreground">
              Metadata fetch failed. You can still fill the source in manually.
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                Category
              </span>
              <CategoryCombobox
                categories={categories}
                value={category}
                onChange={setCategory}
                disabled={isSubmitting}
              />
              <span className="mt-1.5 block font-serif text-[12px] italic leading-snug text-muted-light">
                Pick an existing category or type a new one.
              </span>
            </div>

            <label className="block">
              <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
                Author
              </span>
              <input
                className={inputClassName}
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="e.g. Maya Chen"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
              Title
            </span>
            <input
              className={inputClassName}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What is this source called?"
              required
            />
          </label>
        </div>

        {submitError ? (
          <div className="mt-6 rounded-lg bg-warning-soft px-4 py-3 font-serif text-[13px] italic text-muted-foreground">
            {submitError}
          </div>
        ) : null}

        <div className="mt-8 flex justify-end gap-3">
          <TactileButton type="button" variant="inset" className="text-[12px]" onClick={onClose}>
            Cancel
          </TactileButton>
          <TactileButton type="submit" variant="raised" className="text-[12px]" disabled={!canSubmit}>
            {isSubmitting ? 'Saving…' : 'Save source'}
          </TactileButton>
        </div>
      </form>
    </div>
  );
}
