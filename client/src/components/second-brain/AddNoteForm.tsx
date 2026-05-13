import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Link2 } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { useToast } from '@/hooks/use-toast';
import { useNotes } from '@/hooks/useNotes';
import { useSources } from '@/hooks/useSources';
import { cn } from '@/lib/utils';
import type { Source } from '@/types/second-brain';

export interface AddNoteFormProps {
  slug: string;
  sourceId: number | null;
  /**
   * Called after a successful save and on Cancel. Lets the parent collapse
   * the form back to a single "Add note" button.
   */
  onClose: () => void;
}

const textareaClassName =
  'w-full min-h-[110px] resize-y rounded-lg bg-card px-4 py-3 font-serif text-[15px] leading-relaxed text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-primary/30';

/**
 * Compact combobox for picking a source to link this note to. "No source"
 * is the first option and renders the note as unlinked (sourceId=null).
 * Typing filters by title; clicking out / Escape closes the popover.
 */
function SourcePicker({
  sources,
  value,
  onChange,
  disabled,
}: {
  sources: Source[];
  value: number | null;
  onChange: (next: number | null) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value == null ? null : sources.find((s) => s.id === value) ?? null),
    [sources, value],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => s.title.toLowerCase().includes(q));
  }, [sources, query]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointer(event: PointerEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
      setQuery('');
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [isOpen]);

  function pick(next: number | null) {
    onChange(next);
    setIsOpen(false);
    setQuery('');
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setIsOpen((v) => !v);
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg bg-card px-3 py-2 text-left transition-colors hover:bg-card-elevated',
          isOpen && 'bg-card-elevated ring-1 ring-primary/20',
        )}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <Link2 size={13} className="shrink-0 text-muted-light" aria-hidden />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-serif text-[14px]',
            selected ? 'text-foreground' : 'italic text-muted-foreground',
          )}
        >
          {selected ? selected.title : 'No source (unlinked)'}
        </span>
        <ChevronDown
          size={13}
          className={cn(
            'shrink-0 text-muted-light transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-lg border border-border bg-card-elevated p-1 shadow-card">
          {sources.length > 0 ? (
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKey}
              placeholder="Filter sources…"
              autoFocus
              className="mb-1 w-full rounded-md bg-card px-3 py-2 font-sans text-[12px] text-foreground outline-none placeholder:italic placeholder:text-muted-light focus:ring-1 focus:ring-primary/30"
            />
          ) : null}

          <ul role="listbox" className="max-h-[220px] overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => pick(null)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] transition-colors hover:bg-primary/5',
                  value == null ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Check
                  size={12}
                  strokeWidth={3}
                  className={cn(
                    'shrink-0 text-primary transition-opacity',
                    value == null ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0 flex-1 truncate font-serif italic">
                  No source (unlinked)
                </span>
              </button>
            </li>

            {matches.length === 0 && sources.length > 0 ? (
              <li className="px-3 py-2 font-serif text-[12px] italic text-muted-foreground">
                No sources match that title.
              </li>
            ) : null}

            {matches.map((source) => {
              const isSelected = source.id === value;
              return (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => pick(source.id)}
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
                    <span className="min-w-0 flex-1 truncate font-serif">
                      {source.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AddNoteForm({ slug, sourceId, onClose }: AddNoteFormProps) {
  const { toast } = useToast();
  const { createNote, isCreating } = useNotes(slug, { sourceId });
  const { data: sources = [] } = useSources(slug);
  const [content, setContent] = useState('');
  // Local source binding for this note draft. Initialized from the
  // parent's selection (if any) so opening the form from a source card
  // pre-links the note; user can change it before saving.
  const [linkedSourceId, setLinkedSourceId] = useState<number | null>(sourceId);

  useEffect(() => {
    setLinkedSourceId(sourceId);
  }, [sourceId]);

  const trimmed = content.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    try {
      await createNote({ content: trimmed, sourceId: linkedSourceId });
      setContent('');
      onClose();
    } catch (error) {
      toast({
        title: 'Could not save note',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl bg-card-elevated px-5 py-5 shadow-card"
    >
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
        New Note
      </span>
      <textarea
        className={textareaClassName}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Write your note in your own words…"
        autoFocus
      />

      <div className="mt-3">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
          Link to source
        </span>
        <SourcePicker
          sources={sources}
          value={linkedSourceId}
          onChange={setLinkedSourceId}
          disabled={isCreating}
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <TactileButton
          type="button"
          variant="inset"
          className="text-[12px]"
          onClick={onClose}
          disabled={isCreating}
        >
          Cancel
        </TactileButton>
        <TactileButton
          type="submit"
          variant="raised"
          className="text-[12px]"
          disabled={!trimmed || isCreating}
        >
          {isCreating ? 'Saving…' : 'Save note'}
        </TactileButton>
      </div>
    </form>
  );
}
