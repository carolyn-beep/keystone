import { makeAssistantToolUI } from '@assistant-ui/react';

type ScratchpadArgs = {
  insightId: number;
};

type ScratchpadResult = {
  status: string;
  scratchpadded?: boolean;
  insightId?: number;
};

export const DOK3ScratchpadUI = makeAssistantToolUI<ScratchpadArgs, ScratchpadResult>({
  toolName: 'scratchpad_dok3_insight',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const insightId = result?.insightId ?? args?.insightId ?? 0;

    if (isRunning) {
      return (
        <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="italic">Scratchpadding insight #{insightId}...</span>
        </div>
      );
    }

    return (
      <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        <span className="italic">Insight #{insightId} scratchpadded</span>
      </div>
    );
  },
});
