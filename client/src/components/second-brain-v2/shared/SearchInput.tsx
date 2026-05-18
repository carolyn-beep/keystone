import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebouncedCallback } from '@/lib/use-debounce';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  ariaLabel?: string;
  className?: string;
}

/**
 * Controlled, debounced text input with a leading magnifier icon. Local
 * state mirrors typing immediately; `onChange` fires after `debounceMs`.
 * `debounceMs={0}` fires synchronously on every keystroke.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  debounceMs = 200,
  ariaLabel,
  className,
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const debounced = useDebouncedCallback(onChange, debounceMs);

  // Sync when the controlled value changes from outside.
  useEffect(() => {
    setInternal(value);
  }, [value]);

  return (
    <label
      className={cn(
        'relative flex w-full items-center rounded-lg bg-card text-foreground shadow-card',
        className,
      )}
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
      />
      <input
        type="text"
        value={internal}
        onChange={(event) => {
          const next = event.target.value;
          setInternal(next);
          debounced(next);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-full rounded-lg bg-transparent py-2.5 pl-9 pr-3 font-serif text-[14px] leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    </label>
  );
}
