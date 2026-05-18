import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  Select as RadixSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

// --- Select slot (Radix-based styled dropdown) ---

export interface FilterBarSelectProps {
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  placeholder: string;
  clearable?: boolean;
  ariaLabel?: string;
}

const TRIGGER_CLASSES =
  'h-[38px] min-w-[140px] gap-2 rounded-lg font-serif text-[13px] shadow-card';

const SENTINEL_CLEAR = '__clear__';

function Select({
  value,
  options,
  onChange,
  placeholder,
  clearable = true,
  ariaLabel,
}: FilterBarSelectProps) {
  return (
    <RadixSelect
      value={value ?? SENTINEL_CLEAR}
      onValueChange={(next) => {
        if (next === SENTINEL_CLEAR) onChange(null);
        else onChange(next);
      }}
    >
      <SelectTrigger className={TRIGGER_CLASSES} aria-label={ariaLabel ?? placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {clearable ? (
          <SelectItem value={SENTINEL_CLEAR}>
            <span className="italic text-muted-foreground">{placeholder}</span>
          </SelectItem>
        ) : null}
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
  );
}

// --- Sort slot (Radix-based, non-clearable) ---

export interface FilterBarSortProps {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

function Sort({ value, options, onChange, ariaLabel }: FilterBarSortProps) {
  return (
    <RadixSelect value={value} onValueChange={onChange}>
      <SelectTrigger className={TRIGGER_CLASSES} aria-label={ariaLabel ?? 'Sort'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </RadixSelect>
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
