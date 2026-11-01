import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CategoryChip {
  id: number;
  name: string;
  count?: number;
}

export interface CategoryChipStripProps {
  categories: CategoryChip[];
  /** null = the synthetic 'All' chip is active. */
  activeCategoryId: number | null;
  onChange: (id: number | null) => void;
  /** When true, chips beyond `overflowAfter` collapse behind a 'More' menu. */
  collapseOverflow?: boolean;
  /** Threshold for `collapseOverflow`. Defaults to 10 chips. */
  overflowAfter?: number;
  className?: string;
}

interface ChipProps {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}

function Chip({ label, count, active, onClick }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-state={active ? 'active' : 'inactive'}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[11px] leading-none',
            active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Horizontally-scrollable category pill row. The first chip is always
 * the synthetic 'All' (id=null). Chips don't wrap; the container scrolls
 * horizontally when overflowing. When `collapseOverflow` is true and the
 * category list exceeds `overflowAfter`, extras hide behind a 'More'
 * dropdown trigger.
 */
export function CategoryChipStrip({
  categories,
  activeCategoryId,
  onChange,
  collapseOverflow = true,
  overflowAfter = 10,
  className,
}: CategoryChipStripProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the overflow menu on outside click.
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

  const shouldCollapse = collapseOverflow && categories.length > overflowAfter;
  const visibleCategories = shouldCollapse ? categories.slice(0, overflowAfter) : categories;
  const overflowCategories = shouldCollapse ? categories.slice(overflowAfter) : [];

  return (
    <div
      ref={containerRef}
      className={cn('relative flex items-center gap-2 overflow-x-auto flex-nowrap', className)}
    >
      <Chip
        label="All"
        active={activeCategoryId === null}
        onClick={() => onChange(null)}
      />
      {visibleCategories.map((cat) => (
        <Chip
          key={cat.id}
          label={cat.name}
          count={cat.count}
          active={activeCategoryId === cat.id}
          onClick={() => onChange(cat.id)}
        />
      ))}
      {overflowCategories.length > 0 ? (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOverflowOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 font-sans text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            More
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {overflowOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-2 min-w-[200px] rounded-lg border border-border bg-card p-1 shadow-card-hover"
            >
              {overflowCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onChange(cat.id);
                    setOverflowOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-sans text-[13px] hover:bg-muted',
                    activeCategoryId === cat.id ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span>{cat.name}</span>
                  {typeof cat.count === 'number' ? (
                    <span className="ml-2 text-[11px] text-muted-foreground">{cat.count}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
