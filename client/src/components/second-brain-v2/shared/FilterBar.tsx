import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchInput, type SearchInputProps } from './SearchInput';

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Slot-based toolbar container. Compose with `FilterBar.Search`,
 * `FilterBar.Select`, `FilterBar.Segment`, `FilterBar.Sort`, and
 * `FilterBar.Trailing` subcomponents.
 *
 *   <FilterBar>
 *     <FilterBar.Search value={q} onChange={setQ} placeholder="Search notes" />
 *     <FilterBar.Select value={cat} options={...} onChange={setCat} placeholder="Category" />
 *     <FilterBar.Trailing>
 *       <button>+ Add</button>
 *     </FilterBar.Trailing>
 *   </FilterBar>
 */
function FilterBarRoot({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

// --- Search slot ---

function Search(props: SearchInputProps) {
  // Constrain search to a sensible width inside the bar so trailing slots
  // don't get crushed.
  return (
    <div className="w-full max-w-[320px]">
      <SearchInput {...props} />
    </div>
  );
}

// --- Select slot (native <select> styled to match) ---

export interface FilterBarSelectProps {
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  placeholder: string;
  clearable?: boolean;
  ariaLabel?: string;
}

const SELECT_BASE_CLASSES =
  'appearance-none rounded-lg bg-card pl-3 pr-8 py-2.5 font-serif text-[14px] text-foreground shadow-card focus:outline-none focus:ring-1 focus:ring-primary/30';

function Select({
  value,
  options,
  onChange,
  placeholder,
  clearable = true,
  ariaLabel,
}: FilterBarSelectProps) {
  return (
    <label className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel ?? placeholder}
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value;
          if (clearable && next === '') {
            onChange(null);
          } else {
            onChange(next);
          }
        }}
        className={SELECT_BASE_CLASSES}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground"
      />
    </label>
  );
}

// --- Sort slot (visual variant of Select) ---

export interface FilterBarSortProps {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function Sort({ value, options, onChange, ariaLabel }: FilterBarSortProps) {
  return (
    <label className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel ?? 'Sort'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT_BASE_CLASSES}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground"
      />
    </label>
  );
}

// --- Segment slot (pill toggle group, single-select) ---

export interface FilterBarSegmentProps {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function Segment({ value, options, onChange, ariaLabel }: FilterBarSegmentProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? 'Filter'}
      className="inline-flex items-center rounded-lg bg-card p-1 shadow-card"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md px-3 py-1.5 font-sans text-[13px] font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Trailing slot (pushes right via ml-auto) ---

function Trailing({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('ml-auto flex items-center gap-2', className)}>{children}</div>;
}

// Attach subcomponents to the root export so consumers can use the dotted API.
export const FilterBar = Object.assign(FilterBarRoot, {
  Search,
  Select,
  Sort,
  Segment,
  Trailing,
});
