import { useState, useCallback, useRef } from 'react';
import { useThreadRuntime } from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CanvasFloatingTooltip } from './CanvasFloatingTooltip';

export interface CanvasCard {
  id: string;
  title: string;
  body: string;
  category?: string;
  selectable?: boolean;
  selected?: boolean;
}

export type CanvasMode = 'markdown' | 'cards' | 'clear';

export interface CanvasState {
  mode: CanvasMode;
  title: string | null;
  content: string | null;
  cards: CanvasCard[] | null;
}

interface ImportCanvasProps {
  /** Canvas state derived from thread messages — NOT synced via context. */
  state: CanvasState;
}

/**
 * Canvas panel. Receives derived state as props, manages selection locally.
 * Keyed by toolCallId in the parent — selection resets on content change
 * because the component remounts.
 */
export function ImportCanvas({ state }: ImportCanvasProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (state.cards) {
      for (const card of state.cards) {
        if (card.selected) initial.add(card.id);
      }
    }
    return initial;
  });
  const threadRuntime = useThreadRuntime();

  const selectableCards = state.cards?.filter((c) => c.selectable) ?? [];
  const hasSelectables = selectableCards.length > 0;

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleConfirmSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    const selected = state.cards?.filter((c) => selectedIds.has(c.id)) ?? [];
    const summary = selected.map((c) => c.title).join(', ');
    threadRuntime.append(
      `I've selected ${selected.length} item${selected.length !== 1 ? 's' : ''}: ${summary}`,
    );
  }, [selectedIds, state.cards, threadRuntime]);

  if (state.mode === 'clear') return null;

  return (
    <div className="flex flex-col h-full bg-sidebar/30">
      {/* Header */}
      {state.title && (
        <div className="px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-[13px] font-semibold text-foreground m-0">
            {state.title}
          </h3>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 scrollbar-styled">
        {state.mode === 'markdown' && state.content && (
          <MarkdownContent content={state.content} />
        )}

        {state.mode === 'cards' && state.cards && (
          <CardList
            cards={state.cards}
            selectedIds={selectedIds}
            onToggle={toggleSelection}
          />
        )}
      </div>

      {/* Selection bar with confirm */}
      {state.mode === 'cards' && hasSelectables && (
        <SelectionBar
          total={selectableCards.length}
          selected={selectedIds.size}
          onConfirm={handleConfirmSelection}
        />
      )}
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const containerRef = useRef<HTMLDivElement>(null!);

  return (
    <div ref={containerRef} className="relative prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline">
      <CanvasFloatingTooltip containerRef={containerRef} />
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── Card list renderer ────────────────────────────────────────────

function CardList({
  cards,
  selectedIds,
  onToggle,
}: {
  cards: CanvasCard[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {cards.map((card) => {
        const isSelected = selectedIds.has(card.id);
        const isSelectable = card.selectable !== false;

        return (
          <div
            key={card.id}
            onClick={isSelectable ? () => onToggle(card.id) : undefined}
            className={`rounded-lg border p-3 transition-colors ${
              isSelectable ? 'cursor-pointer hover:border-primary/40' : ''
            } ${
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {isSelectable && (
                <div
                  className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}
                >
                  {isSelected && '\u2713'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[13px] font-medium text-foreground truncate">
                    {card.title}
                  </span>
                  {card.category && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0">
                      {card.category}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed m-0">
                  {card.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Selection bar ─────────────────────────────────────────────────

function SelectionBar({
  total,
  selected,
  onConfirm,
}: {
  total: number;
  selected: number;
  onConfirm: () => void;
}) {
  return (
    <div className="px-5 py-2.5 border-t border-border bg-card shrink-0 flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">
        {selected} of {total} selected
      </span>
      <button
        className="px-3 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
        disabled={selected === 0}
        onClick={onConfirm}
      >
        Confirm Selection
      </button>
    </div>
  );
}
