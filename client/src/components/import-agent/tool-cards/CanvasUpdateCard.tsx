import { makeAssistantToolUI } from '@assistant-ui/react';

type CanvasArgs = {
  mode: 'markdown' | 'cards' | 'clear';
  title?: string;
  content?: string;
  cards?: Array<{
    id: string;
    title: string;
    body: string;
    category?: string;
    selectable?: boolean;
    selected?: boolean;
  }>;
};

type CanvasResult = {
  mode: string;
  title: string | null;
  content: string | null;
  cards: Array<{
    id: string;
    title: string;
    body: string;
    category?: string;
    selectable?: boolean;
    selected?: boolean;
  }> | null;
  timestamp: number;
};

/**
 * Pure UI indicator — no side effects.
 * Canvas state is derived from thread messages in ImportAgentLayout.
 */
export const CanvasUpdateUI = makeAssistantToolUI<CanvasArgs, CanvasResult>({
  toolName: 'display_in_canvas',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const mode = result?.mode ?? args?.mode;
    const title = result?.title ?? args?.title;

    if (mode === 'clear') {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          <span className="italic">Canvas cleared</span>
        </div>
      );
    }

    if (isRunning) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Updating canvas...</span>
        </div>
      );
    }

    const cardCount = result?.cards?.length ?? args?.cards?.length ?? 0;
    const detail = mode === 'cards'
      ? `${cardCount} card${cardCount !== 1 ? 's' : ''}`
      : 'markdown';

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
        <span className="italic">
          Canvas updated{title ? `: ${title}` : ''} ({detail})
        </span>
      </div>
    );
  },
});
