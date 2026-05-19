import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Info, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCategories } from '@/hooks/useCategories';
import type { Category } from '@/types/second-brain';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface CategoryTypeaheadProps {
  slug: string;
  value: number | null;
  onChange: (categoryId: number | null) => void;
  placeholder?: string;
  /** When true, the picker becomes read-only. Used to surface an
   *  inherited value (e.g. note inheriting category from its linked
   *  source) without letting the user edit it. */
  disabled?: boolean;
  /** Hover-tooltip copy explaining why the picker is read-only. Only
   *  rendered when `disabled` is true. */
  disabledReason?: string;
  className?: string;
}

const MAX_RESULTS = 50;

/**
 * Searchable category picker. Mirrors SourceTypeahead's structure: a
 * pill shows the current selection when set, otherwise a search input
 * opens a dropdown of matching categories. `null` is the unselected
 * state — used by NewNoteModal so a note can be filed under a category
 * or stay uncategorized.
 */
export function CategoryTypeahead({
  slug,
  value,
  onChange,
  placeholder = 'Search categories',
  disabled = false,
  disabledReason,
  className,
}: CategoryTypeaheadProps) {
  const { data: categories } = useCategories(slug);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Force-close the dropdown the moment the picker becomes disabled.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = useMemo<Category | null>(() => {
    if (value == null || !categories) return null;
    return categories.find((c) => c.id === value) ?? null;
  }, [categories, value]);

  // Compute matches unconditionally so total hook count stays stable
  // regardless of `disabled`. Cheap when the picker is disabled, but
  // critical for hooks-order correctness when toggling.
  const matches = useMemo<Category[]>(() => {
    const list = categories ?? [];
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? list.filter((c) => c.name.toLowerCase().includes(trimmed))
      : list;
    return filtered.slice(0, MAX_RESULTS);
  }, [categories, query]);

  // Disabled view: read-only pill wrapped in a tooltip explaining the
  // inherited-from-source behavior. No clear, no change, no dropdown.
  if (disabled) {
    const label = selected?.name ?? (value != null ? `Category #${value}` : 'No category');
    const pill = (
      <div
        className="flex w-full min-w-0 cursor-default items-center gap-2 rounded-lg bg-card px-3 py-2.5 opacity-70 shadow-card"
        aria-disabled="true"
        data-testid="category-typeahead-disabled"
      >
        <span
          className="min-w-0 flex-1 truncate font-serif text-[14px] text-foreground"
          title={label}
        >
          {label}
        </span>
        {disabledReason ? (
          <Info size={14} aria-hidden className="shrink-0 text-muted-foreground" />
        ) : null}
      </div>
    );
    return (
      <div ref={rootRef} className={cn('relative w-full', className)}>
        {disabledReason ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>{pill}</TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-[12px] leading-relaxed">
                {disabledReason}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          pill
        )}
      </div>
    );
  }

  const handleSelect = (category: Category) => {
    onChange(category.id);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery('');
  };

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      {selected && !open ? (
        <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-card px-3 py-2.5 shadow-card">
          <span
            className="min-w-0 flex-1 truncate font-serif text-[14px] text-foreground"
            title={selected.name}
          >
            {selected.name}
          </span>
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear category"
            data-testid="category-typeahead-clear"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Change category"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      ) : (
        <label className="relative flex w-full items-center rounded-lg bg-card text-foreground shadow-card">
          <Search size={14} aria-hidden className="absolute left-3 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full rounded-lg bg-transparent py-2.5 pl-9 pr-3 font-serif text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </label>
      )}

      {open ? (
        <div
          role="listbox"
          aria-label="Category matches"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto overflow-x-hidden rounded-lg bg-card-elevated p-1 shadow-card-hover"
          data-testid="category-typeahead-dropdown"
        >
          {matches.length === 0 ? (
            <p className="px-3 py-2 font-serif text-[13px] italic text-muted-foreground">
              No categories match.
            </p>
          ) : (
            matches.map((category) => {
              const active = category.id === value;
              return (
                <button
                  key={category.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(category)}
                  className={cn(
                    'flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <span
                    className="min-w-0 flex-1 truncate font-serif text-[14px]"
                    title={category.name}
                  >
                    {category.name}
                  </span>
                  {typeof category.noteCount === 'number' && category.noteCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
                      {category.noteCount}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
