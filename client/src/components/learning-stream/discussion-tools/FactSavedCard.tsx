import { makeAssistantToolUI } from '@assistant-ui/react';
import { queryClient } from '@/lib/queryClient';

type FactArgs = { fact: string; category: string };
type FactResult = { factId: number; fact: string; category: string; originalId: string };

const invalidated = new Set<string>();

export const FactSavedToolUI = makeAssistantToolUI<FactArgs, FactResult>({
  toolName: 'save_dok1_fact',
  render: ({ args, result, status, toolCallId }) => {
    const isRunning = status.type === 'running';
    const fact = result?.fact ?? args.fact;
    const category = result?.category ?? args.category;

    if (result && !invalidated.has(toolCallId)) {
      invalidated.add(toolCallId);
      queryClient.invalidateQueries({ queryKey: ['brainlift'] });
    }

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              DOK1 Fact
            </span>
            <span className="px-[6px] py-[2px] rounded bg-info-soft text-info text-[9px] uppercase tracking-[0.25em] font-semibold">
              {category}
            </span>
          </div>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Saving' : 'Saved'}
          </span>
        </div>

        {/* Fact text */}
        <div className="px-6 py-5">
          <p className="font-serif text-[15px] italic leading-relaxed text-foreground m-0">
            {fact}
          </p>
        </div>

        {/* Footer — ID + verification status */}
        {result && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
              #{result.originalId}
            </span>
            <span className="px-[6px] py-[2px] rounded bg-warning-soft text-warning text-[9px] uppercase tracking-[0.25em] font-semibold">
              Verifying
            </span>
          </div>
        )}
      </div>
    );
  },
});
