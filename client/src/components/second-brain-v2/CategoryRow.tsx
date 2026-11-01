/**
 * CategoryRow - single row in the Categories sub-tab.
 *
 * Read mode:
 *   - Name (truncates at long widths)
 *   - "Sources: N · Notes: M" (tabular numerals for optical alignment)
 *   - Hover-revealed Pencil button → onStartEdit
 *   - Delete button: disabled when canDelete=false (sourceCount > 0)
 *     with tooltip "Move sources to another category first"; otherwise
 *     tooltip "Notes in this category will become uncategorized."
 *
 * Edit mode:
 *   - Input swaps in (autoFocus)
 *   - Enter → onSaveEdit(trimmed); empty trimmed value is a no-op (stays in edit)
 *   - Esc → onCancelEdit
 *   - Blur → onSaveEdit(trimmed) if non-empty, otherwise cancel
 *
 * Manual reorder buttons (ChevronUp/ChevronDown) render only when the
 * matching callback is provided (parent gates on sortBy === 'manual' AND
 * row position).
 */

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Category } from '@/types/second-brain';

export interface CategoryRowProps {
  category: Category & { sourceCount?: number; noteCount?: number };
  isEditing: boolean;
  canDelete: boolean;
  onStartEdit: () => void;
  onSaveEdit: (name: string) => void | Promise<void>;
  onCancelEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const DELETE_BLOCKED_TOOLTIP = 'Move sources to another category first';
const DELETE_ALLOWED_TOOLTIP = 'Notes in this category will become uncategorized.';

export function CategoryRow({
  category,
  isEditing,
  canDelete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
}: CategoryRowProps) {
  const [draft, setDraft] = useState(category.name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset draft whenever we enter edit mode from outside.
  useEffect(() => {
    if (isEditing) {
      setDraft(category.name);
      // autoFocus on first render; this re-focuses if the parent toggles edit
      // for the same row a second time.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing, category.name]);

  const sourceCount = category.sourceCount ?? 0;
  const noteCount = category.noteCount ?? 0;

  const attemptSave = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // Empty value: do not call onSaveEdit; stay in edit mode.
      return;
    }
    if (trimmed === category.name) {
      // No-op rename: close edit silently.
      onCancelEdit();
      return;
    }
    void onSaveEdit(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      attemptSave();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancelEdit();
    }
  };

  return (
    <li
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-card transition-all duration-150 hover:-translate-y-[1px] hover:border-border-strong hover:bg-card-elevated hover:shadow-card-hover"
    >
      {/* Manual reorder controls: present only when callbacks provided. */}
      <div className="flex flex-col items-center gap-0.5 text-muted-light">
        {onMoveUp ? (
          <button
            type="button"
            onClick={onMoveUp}
            aria-label={`Move ${category.name} up`}
            title="Move up"
            className="rounded p-0.5 transition-colors hover:bg-card-elevated hover:text-foreground"
          >
            <ChevronUp size={14} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <span className="block h-[18px] w-[18px]" aria-hidden />
        )}
        {onMoveDown ? (
          <button
            type="button"
            onClick={onMoveDown}
            aria-label={`Move ${category.name} down`}
            title="Move down"
            className="rounded p-0.5 transition-colors hover:bg-card-elevated hover:text-foreground"
          >
            <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
          </button>
        ) : (
          <span className="block h-[18px] w-[18px]" aria-hidden />
        )}
      </div>

      {/* Name (read mode) or rename input (edit mode). */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={attemptSave}
            autoFocus
            aria-label={`Rename category ${category.name}`}
            className="w-full max-w-[420px] bg-transparent font-serif text-[16px] text-foreground outline-none ring-1 ring-primary/40 rounded-md px-2 py-1"
          />
        ) : (
          <h3
            title={category.name}
            className="m-0 truncate font-serif text-[16px] font-semibold leading-tight text-foreground"
          >
            {category.name}
          </h3>
        )}
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-light tabular-nums">
          <span>Sources: {sourceCount}</span>
          <span aria-hidden>·</span>
          <span>Notes: {noteCount}</span>
        </div>
      </div>

      {/* Row actions: pencil (hover-reveal) + delete. */}
      <div className="flex items-center gap-1.5">
        {!isEditing ? (
          <button
            type="button"
            onClick={onStartEdit}
            aria-label={`Rename category ${category.name}`}
            title="Rename"
            className="rounded-md bg-transparent p-1.5 text-muted-light opacity-0 transition-all hover:bg-card-elevated hover:text-foreground group-hover:opacity-100"
          >
            <Pencil size={14} strokeWidth={2.1} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? DELETE_ALLOWED_TOOLTIP : DELETE_BLOCKED_TOOLTIP}
          aria-label={`Delete category ${category.name}`}
          className="rounded-md bg-transparent p-1.5 text-muted-light opacity-0 transition-all hover:bg-card-elevated hover:text-destructive group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-light"
        >
          <Trash2 size={14} strokeWidth={2.1} aria-hidden />
        </button>
      </div>
    </li>
  );
}
