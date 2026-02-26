import { makeAssistantToolUI } from '@assistant-ui/react';

type DOK3LinkArgs = {
  insightId: number;
  dok2SummaryIds: number[];
};

type DOK3LinkResult = {
  status: string;
  linked?: boolean;
  insightId?: number;
};

export const DOK3LinkUI = makeAssistantToolUI<DOK3LinkArgs, DOK3LinkResult>({
  toolName: 'link_dok3_insight',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const insightId = result?.insightId ?? args?.insightId ?? 0;
    const sourceCount = args?.dok2SummaryIds?.length ?? 0;

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              DOK3 Link
            </span>
            <span className="text-[11px] text-muted-foreground">
              Insight #{insightId}
            </span>
          </div>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Linking' : 'Linked'}
          </span>
        </div>

        {/* Details */}
        <div className="px-6 py-4">
          <p className="text-[13px] text-foreground m-0">
            {isRunning ? 'Linking' : 'Linked'} to {sourceCount} DOK2 summar{sourceCount !== 1 ? 'ies' : 'y'}
          </p>
        </div>
      </div>
    );
  },
});
