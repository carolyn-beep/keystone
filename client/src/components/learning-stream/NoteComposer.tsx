/**
 * NoteComposer — reader Notes pane composer.
 *
 * Textarea + category chip + Save button. Cmd/Ctrl+Enter validates and saves;
 * Enter is a newline. Missing content/category are surfaced as inline
 * validation errors. Inline `+ New category` commits server-side
 * atomically (single round-trip via the from-reader endpoint).
 *
 * forwardRef exposes a NoteComposerHandle with prefill + focus so spec 03's
 * quote-selection popover can drive a blockquote prefill from the reader's
 * left pane.
 *
 * Local state here is UI lifecycle only (textarea content, chip value,
 * inline error). All business state lives in `useNotesForSource` /
 * parent-provided category state per CLAUDE.md "Components Are Thin".
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useNotesForSource, type CreateNoteFromReaderResponse } from '@/hooks/useNotesForSource';
import { TactileButton } from '@/components/ui/tactile-button';
import { cn } from '@/lib/utils';
import { CategoryPickerChip, type CategoryPickerValue } from './CategoryPickerChip';

export interface NoteComposerHandle {
  prefill: (content: string) => void;
  focus: () => void;
}

export interface NoteComposerProps {
  slug: string;
  sourceId: number | null;
  learningStreamItemId: number;
  defaultCategoryId: number | null;
  categoryValue: CategoryPickerValue;
  onCategoryValueChange: (next: CategoryPickerValue) => void;
  categoryReadOnly?: boolean;
  categoryLabel?: string;
  onSaved: (response: CreateNoteFromReaderResponse) => void;
}

export const NoteComposer = forwardRef<NoteComposerHandle, NoteComposerProps>(
  function NoteComposer(
    {
      slug,
      sourceId,
      learningStreamItemId,
      defaultCategoryId: _defaultCategoryId,
      categoryValue,
      onCategoryValueChange,
      categoryReadOnly = false,
      categoryLabel,
      onSaved,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const [content, setContent] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [contentError, setContentError] = useState<boolean>(false);
    const [categoryError, setCategoryError] = useState<boolean>(false);

    const { createNote, isCreating } = useNotesForSource({
      slug,
      sourceId: sourceId ?? undefined,
      learningStreamItemId,
    });

    // Expose imperative prefill/focus to the parent so spec 03's quote
    // popover can set the textarea content.
    useImperativeHandle(
      ref,
      () => ({
        prefill: (next: string) => {
          setContent(next);
          setContentError(false);
          // Defer focus until after the state flush.
          window.requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            // Place caret at end of textarea.
            el.setSelectionRange(next.length, next.length);
          });
        },
        focus: () => {
          textareaRef.current?.focus();
        },
      }),
      [],
    );

    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }, [content]);

    async function handleSave() {
      if (isCreating) return;
      const trimmedContent = content.trim();
      const hasContent = trimmedContent.length > 0;
      const hasCategory =
        categoryReadOnly ||
        categoryValue.kind === 'existing' ||
        (categoryValue.kind === 'new' && categoryValue.name.trim().length > 0);

      setContentError(!hasContent);
      setCategoryError(categoryReadOnly ? false : !hasCategory);
      if (!hasContent || !hasCategory) return;

      setError(null);
      try {
        const input: Parameters<typeof createNote>[0] = { content: trimmedContent };
        if (categoryValue.kind === 'existing') {
          input.categoryId = categoryValue.categoryId;
        } else if (categoryValue.kind === 'new') {
          input.categoryName = categoryValue.name.trim();
        }
        const response = await createNote(input);
        setContent('');
        setContentError(false);
        setCategoryError(false);
        // Keep the chip on the resolved category for the next note in this
        // session so subsequent saves land in the same place by default.
        onCategoryValueChange({ kind: 'existing', categoryId: response.category.id });
        onSaved(response);
      } catch (err) {
        setError('Failed to save note. Try again.');
      }
    }

    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
      // Cmd/Ctrl+Enter saves; Enter alone is newline (default behavior).
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSave();
      }
    }

    return (
      <div className="border-t border-border bg-sidebar/40 px-4 py-3">
        {error ? (
          <p className="mb-2 font-serif text-[12px] italic text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (e.target.value.trim().length > 0) {
              setContentError(false);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write your reaction…"
          rows={3}
          autoFocus
          aria-invalid={contentError}
          aria-describedby={contentError ? 'note-composer-content-error' : undefined}
          className={cn(
            'block min-h-[84px] w-full resize-none overflow-hidden rounded-md border bg-card px-3 py-2 font-serif text-[14px] leading-relaxed text-foreground transition-colors duration-200 focus:outline-none focus:ring-1 focus:ring-primary/40',
            contentError
              ? 'border-destructive bg-destructive-soft focus:ring-destructive/30'
              : 'border-border',
          )}
        />
        {contentError ? (
          <p
            id="note-composer-content-error"
            className="mt-1.5 font-serif text-[12px] italic text-destructive"
            role="alert"
          >
            Write a note before saving.
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div>
            <CategoryPickerChip
              slug={slug}
              value={categoryValue}
              onChange={(next) => {
                onCategoryValueChange(next);
                if (
                  next.kind === 'existing' ||
                  (next.kind === 'new' && next.name.trim().length > 0)
                ) {
                  setCategoryError(false);
                }
              }}
              disabled={isCreating}
              error={!categoryReadOnly && categoryError}
              readOnly={categoryReadOnly}
              readOnlyLabel={categoryLabel}
            />
            {categoryError ? (
              <p className="mt-1.5 font-serif text-[12px] italic text-destructive" role="alert">
                Pick a category before saving.
              </p>
            ) : null}
          </div>
          <TactileButton
            variant="raised"
            onClick={() => void handleSave()}
            aria-busy={isCreating}
            className="text-[12px] font-semibold uppercase tracking-[0.18em]"
          >
            Save
          </TactileButton>
        </div>
      </div>
    );
  },
);
