/**
 * CategoryPickerChip — chip + dropdown + inline "+ New category" input for
 * the reader Notes composer.
 *
 * Value is a discriminated union so the composer can pass either an existing
 * categoryId or a freshly-typed name through to the atomic save endpoint.
 *
 * The chip never blocks with a modal (FEATURE.md locked decision #6). The
 * dropdown opens beneath the chip; clicking "+ New category" swaps the chip
 * into an inline text input.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { cn } from '@/lib/utils';

export type CategoryPickerValue =
  | { kind: 'existing'; categoryId: number }
  | { kind: 'new'; name: string }
  | { kind: 'unset' };

export interface CategoryPickerChipProps {
  slug: string;
  value: CategoryPickerValue;
  onChange: (next: CategoryPickerValue) => void;
  disabled?: boolean;
  error?: boolean;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

export function CategoryPickerChip({
  slug,
  value,
  onChange,
  disabled,
  error = false,
  readOnly = false,
  readOnlyLabel,
}: CategoryPickerChipProps) {
  const { categories } = useCategories(slug);
  const [mode, setMode] = useState<'closed' | 'dropdown' | 'inline-new'>('closed');
  const [draftName, setDraftName] = useState<string>(
    value.kind === 'new' ? value.name : '',
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve the current chip label.
  const label =
    readOnlyLabel ??
    (value.kind === 'existing'
      ? categories.find((c) => c.id === value.categoryId)?.name ?? 'Pick category'
      : value.kind === 'new'
        ? value.name.trim() || 'New category…'
        : 'Pick category');

  // Sort categories alphabetically once per render.
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));

  // Close dropdown / inline input on outside click.
  useEffect(() => {
    if (readOnly && mode !== 'closed') {
      setMode('closed');
    }
  }, [readOnly, mode]);

  useEffect(() => {
    if (mode === 'closed') return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        // Inline-new commits the draft on blur per FEATURE.md decision #5.
        if (mode === 'inline-new') {
          const trimmed = draftName.trim();
          onChange(trimmed ? { kind: 'new', name: trimmed } : { kind: 'unset' });
        }
        setMode('closed');
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [mode, draftName, onChange]);

  // Focus inline input when entering inline-new mode.
  useEffect(() => {
    if (mode === 'inline-new' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode]);

  function handleChipClick() {
    if (disabled || readOnly) return;
    setMode(mode === 'closed' ? 'dropdown' : 'closed');
  }

  function handleSelectExisting(categoryId: number) {
    onChange({ kind: 'existing', categoryId });
    setMode('closed');
  }

  function handleEnterNewMode() {
    setDraftName(value.kind === 'new' ? value.name : '');
    setMode('inline-new');
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('closed');
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const trimmed = draftName.trim();
      if (trimmed.length === 0) {
        onChange({ kind: 'unset' });
      } else {
        onChange({ kind: 'new', name: trimmed });
      }
      setMode('closed');
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {readOnly ? (
        <span
          title="Category set when this source was first saved"
          aria-label="Category set when this source was first saved"
          className="inline-flex cursor-default items-center rounded-full border border-border bg-card px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-foreground"
        >
          <span className="max-w-[160px] truncate">{label}</span>
        </span>
      ) : mode === 'inline-new' ? (
        <input
          ref={inputRef}
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="New category name"
          aria-invalid={error}
          className={cn(
            'w-[360px] rounded-full border bg-card px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-primary/40',
            error ? 'border-destructive bg-destructive-soft focus:ring-destructive/30' : 'border-border',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={handleChipClick}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={mode === 'dropdown'}
          aria-invalid={error}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-foreground transition-colors duration-200',
            disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted',
            value.kind === 'unset' && 'italic text-muted-foreground',
            error && 'border-destructive bg-destructive-soft text-destructive hover:bg-destructive-soft',
          )}
        >
          <span className="truncate max-w-[160px]">{label}</span>
          <ChevronDown size={11} />
        </button>
      )}

      {!readOnly && mode === 'dropdown' ? (
        <div
          role="listbox"
          className="absolute bottom-full left-0 z-20 mb-1 w-[360px] rounded-lg border border-border bg-card p-1 shadow-card-hover"
        >
          {sorted.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={value.kind === 'existing' && value.categoryId === category.id}
              onClick={() => handleSelectExisting(category.id)}
              className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left font-sans text-[12px] text-foreground transition-colors hover:bg-muted"
            >
              <span className="whitespace-nowrap">{category.name}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-border" aria-hidden="true" />
          <button
            type="button"
            onClick={handleEnterNewMode}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left font-sans text-[12px] font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Plus size={12} />
            + New category
          </button>
        </div>
      ) : null}
    </div>
  );
}
