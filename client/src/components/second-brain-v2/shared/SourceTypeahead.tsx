import { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSources } from '@/hooks/useSources';
import type { Source } from '@/types/second-brain';

export interface SourceTypeaheadProps {
  slug: string;
  value: number | null;
  onChange: (sourceId: number | null) => void;
  placeholder?: string;
  /** When provided, restricts options to sources with this categoryId. */
  categoryFilter?: number | null;
  className?: string;
}

const MAX_RESULTS = 50;

/**
 * Searchable source picker. Renders a control showing the currently
 * selected source title (or placeholder), opens a dropdown of matching
 * sources on focus, and filters by case-insensitive substring on title
 * as the user types.
 *
 * Lives in `shared/` for spec 04 to use directly. Not promoted to the
 * spec 02 barrel; that's a follow-up integration step to avoid
 * cross-spec merge conflicts.
 */
export function SourceTypeahead({
  slug,
  value,
  onChange,
  placeholder = 'Search sources',
  categoryFilter = null,
  className,
}: SourceTypeaheadProps) {
  const { data: sources } = useSources(slug);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click.
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

  const selected = useMemo<Source | null>(() => {
    if (value == null || !sources) return null;
    return sources.find((s) => s.id === value) ?? null;
  }, [sources, value]);

  const matches = useMemo<Source[]>(() => {
    const list = sources ?? [];
    const scoped = categoryFilter != null
      ? list.filter((s) => s.categoryId === categoryFilter)
      : list;
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed
      ? scoped.filter((s) => s.title.toLowerCase().includes(trimmed))
      : scoped;
    return filtered.slice(0, MAX_RESULTS);
  }, [sources, categoryFilter, query]);

  const handleSelect = (source: Source) => {
    onChange(source.id);
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
        <div className="flex w-full items-center gap-2 rounded-lg bg-card px-3 py-2.5 shadow-card">
          <span className="flex-1 truncate font-serif text-[14px] text-foreground" title={selected.title}>
            {selected.title}
          </span>
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear source"
            data-testid="source-typeahead-clear"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Change source"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
          aria-label="Source matches"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto overflow-x-hidden rounded-lg bg-card-elevated p-1 shadow-card-hover"
          data-testid="source-typeahead-dropdown"
        >
          {matches.length === 0 ? (
            <p className="px-3 py-2 font-serif text-[13px] italic text-muted-foreground">
              No sources match.
            </p>
          ) : (
            matches.map((source) => {
              const active = source.id === value;
              return (
                <button
                  key={source.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSelect(source)}
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted',
                  )}
                >
                  <span className="block w-full truncate font-serif text-[14px]" title={source.title}>
                    {source.title}
                  </span>
                  {source.author ? (
                    <span className="block w-full truncate font-sans text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {source.author}
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
