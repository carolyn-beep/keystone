import { makeAssistantToolUI } from '@assistant-ui/react';
import { queryClient } from '@/lib/queryClient';

type SummaryArgs = { summaryPoints: string[]; relatedFactIds: number[]; category: string };
type SummaryResult = { summaryId: number; points: string[]; relatedFactCount: number; category: string };

const invalidated = new Set<string>();

export const SummarySavedToolUI = makeAssistantToolUI<SummaryArgs, SummaryResult>({
  toolName: 'save_dok2_summary',
  render: ({ args, result, status, toolCallId }) => {
    const isRunning = status.type === 'running';
    const points = result?.points ?? args.summaryPoints;
    const category = result?.category ?? args.category;
    const relatedCount = result?.relatedFactCount ?? args.relatedFactIds.length;

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
              DOK2 Summary
            </span>
            <span className="px-[6px] py-[2px] rounded bg-warning-soft text-warning text-[9px] uppercase tracking-[0.25em] font-semibold">
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

        {/* Summary points */}
        <div className="px-6 py-5">
          <ol className="list-decimal list-inside space-y-2 m-0 p-0">
            {points.map((point, i) => (
              <li key={i} className="font-serif text-[15px] italic leading-relaxed text-foreground">
                {point}
              </li>
            ))}
          </ol>
        </div>

        {/* Footer — linked facts + grading status */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between">
          <span className="text-[8px] uppercase tracking-[0.35em] font-semibold text-muted-light">
            {relatedCount} linked fact{relatedCount !== 1 ? 's' : ''}
          </span>
          {result && (
            <span className="px-[6px] py-[2px] rounded bg-warning-soft text-warning text-[9px] uppercase tracking-[0.25em] font-semibold">
              Grading
            </span>
          )}
        </div>
      </div>
    );
  },
});
