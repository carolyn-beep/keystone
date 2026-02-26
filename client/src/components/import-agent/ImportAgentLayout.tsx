import { useMemo, useRef } from 'react';
import { AssistantRuntimeProvider, useThread } from '@assistant-ui/react';
import { useImportAgent } from '@/hooks/useImportAgent';
import { ImportCanvas, type CanvasState, type CanvasCard } from './ImportCanvas';
import { ImportAgentChat } from './ImportAgentChat';
import { SelectionChipsProvider } from './SelectionChipsContext';

interface ImportAgentLayoutProps {
  slug: string;
}

// ── Derived canvas state from thread messages ────────────────────

interface DerivedCanvas {
  state: CanvasState;
  toolCallId: string;
}

/**
 * Scans thread messages (newest-first) for the last `display_in_canvas`
 * tool result and returns the canvas state derived from it.
 * No context, no useEffect — pure derivation from the message stream.
 */
function useDerivedCanvasState(): DerivedCanvas | null {
  const messages = useThread((s) => s.messages);
  const cacheRef = useRef<DerivedCanvas | null>(null);

  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;

      for (let j = msg.content.length - 1; j >= 0; j--) {
        const part = msg.content[j];
        if (
          part.type === 'tool-call' &&
          part.toolName === 'display_in_canvas' &&
          part.result
        ) {
          // Return cached object if same tool call — avoids re-renders during streaming
          if (cacheRef.current?.toolCallId === part.toolCallId) {
            return cacheRef.current;
          }

          const r = part.result as {
            mode: string;
            title: string | null;
            content: string | null;
            cards: CanvasCard[] | null;
          };

          const derived: DerivedCanvas = {
            state: {
              mode: r.mode as CanvasState['mode'],
              title: r.title,
              content: r.content,
              cards: r.cards,
            },
            toolCallId: part.toolCallId,
          };
          cacheRef.current = derived;
          return derived;
        }
      }
    }

    cacheRef.current = null;
    return null;
  }, [messages]);
}

// ── Layout (always renders both panels — chat never unmounts) ────

function LayoutInner() {
  const canvas = useDerivedCanvasState();
  const canvasVisible = canvas !== null && canvas.state.mode !== 'clear';

  return (
    <SelectionChipsProvider>
      <div className="flex h-full overflow-hidden">
        <div
          className={`min-w-0 h-full transition-[flex] duration-200 ${
            canvasVisible ? 'flex-[55]' : 'flex-1'
          }`}
        >
          <ImportAgentChat />
        </div>
        <div
          className={`h-full overflow-hidden transition-[flex,border-width] duration-200 ${
            canvasVisible
              ? 'flex-[45] border-l border-border'
              : 'flex-[0] border-l-0'
          }`}
        >
          {canvas && canvas.state.mode !== 'clear' && (
            <ImportCanvas key={canvas.toolCallId} state={canvas.state} />
          )}
        </div>
      </div>
    </SelectionChipsProvider>
  );
}

export function ImportAgentLayout({ slug }: ImportAgentLayoutProps) {
  const runtime = useImportAgent(slug);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LayoutInner />
    </AssistantRuntimeProvider>
  );
}
