import { makeAssistantToolUI } from '@assistant-ui/react';

type SourcesSavedArgs = {
  confirmedUrls: string[];
};

type SourcesSavedResult = {
  status: string;
  confirmed?: number;
  scratchpadded?: number;
};

export const SourcesSavedUI = makeAssistantToolUI<SourcesSavedArgs, SourcesSavedResult>({
  toolName: 'save_confirmed_sources',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const confirmedCount = result?.confirmed ?? args?.confirmedUrls?.length ?? 0;
    const scratchpaddedCount = result?.scratchpadded ?? 0;

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Sources
          </span>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Saving' : 'Saved'}
          </span>
        </div>

        {/* Counts */}
        <div className="px-6 py-5 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-success">{confirmedCount}</span>
            <span className="text-[11px] text-muted-foreground">confirmed</span>
          </div>
          {scratchpaddedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-muted-foreground">{scratchpaddedCount}</span>
              <span className="text-[11px] text-muted-foreground">scratchpadded</span>
            </div>
          )}
        </div>
      </div>
    );
  },
});
