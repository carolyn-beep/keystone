import { makeAssistantToolUI } from '@assistant-ui/react';

type DOK3sSavedArgs = {
  insights: Array<{
    text: string;
    workflowyNodeId?: string;
  }>;
};

type DOK3sSavedResult = {
  status: string;
  savedCount?: number;
  savedInsights?: Array<{
    id: number;
    text: string;
    status: string;
  }>;
};

export const DOK3sSavedUI = makeAssistantToolUI<DOK3sSavedArgs, DOK3sSavedResult>({
  toolName: 'save_confirmed_dok3s',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const count = result?.savedCount ?? args?.insights?.length ?? 0;
    const previews = result?.savedInsights?.map(i => i.text)
      ?? args?.insights?.filter(i => i?.text).map(i => i.text.length > 80 ? i.text.slice(0, 80) + '...' : i.text) ?? [];

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            DOK3 Insights
          </span>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Saving' : 'Saved'}
          </span>
        </div>

        {/* Count + previews */}
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-bold text-primary">{count}</span>
            <span className="text-[11px] text-muted-foreground">
              insight{count !== 1 ? 's' : ''} saved (pending linking)
            </span>
          </div>
          {previews.length > 0 && previews.length <= 5 && (
            <ul className="space-y-1 m-0 p-0 list-none">
              {previews.map((text, i) => (
                <li key={i} className="text-[12px] text-muted-foreground italic truncate">
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  },
});
