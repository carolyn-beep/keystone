import { makeAssistantToolUI } from '@assistant-ui/react';

type DOK2sSavedArgs = {
  summaries: Array<{
    id: string;
    sourceName: string;
    category: string;
  }>;
};

type DOK2sSavedResult = {
  status: string;
  savedCount?: number;
  savedDok2s?: Array<{
    id: number;
    sourceName: string;
    category: string;
  }>;
};

export const DOK2sSavedUI = makeAssistantToolUI<DOK2sSavedArgs, DOK2sSavedResult>({
  toolName: 'save_confirmed_dok2s',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const count = result?.savedCount ?? args?.summaries?.length ?? 0;
    const sourceNames = result?.savedDok2s?.filter(s => s?.sourceName).map(s => s.sourceName)
      ?? args?.summaries?.filter(s => s?.sourceName).map(s => s.sourceName) ?? [];
    // Deduplicate source names
    const uniqueSources = Array.from(new Set(sourceNames));

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            DOK2 Summaries
          </span>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Saving' : 'Saved'}
          </span>
        </div>

        {/* Count + source list */}
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-bold text-warning">{count}</span>
            <span className="text-[11px] text-muted-foreground">
              summar{count !== 1 ? 'ies' : 'y'} saved
            </span>
          </div>
          {uniqueSources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {uniqueSources.map((name, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-medium"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
});
