import { makeAssistantToolUI } from '@assistant-ui/react';

type DOK1sSavedArgs = {
  facts: Array<{
    id: string;
    text: string;
    category: string;
    source: string;
    sourceUrl?: string;
  }>;
};

type DOK1sSavedResult = {
  status: string;
  savedCount?: number;
};

export const DOK1sSavedUI = makeAssistantToolUI<DOK1sSavedArgs, DOK1sSavedResult>({
  toolName: 'save_confirmed_dok1s',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const count = result?.savedCount ?? args?.facts?.length ?? 0;

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            DOK1 Facts
          </span>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Saving' : 'Saved'}
          </span>
        </div>

        {/* Count */}
        <div className="px-6 py-5 flex items-center gap-2">
          <span className="text-2xl font-bold text-info">{count}</span>
          <span className="text-[11px] text-muted-foreground">
            fact{count !== 1 ? 's' : ''} saved
          </span>
        </div>
      </div>
    );
  },
});
