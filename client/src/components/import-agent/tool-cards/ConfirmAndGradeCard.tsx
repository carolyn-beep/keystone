import { makeAssistantToolUI } from '@assistant-ui/react';
import { useImportAgentContext } from '../ImportAgentContext';

type ConfirmAndGradeArgs = {
  sourcesCount: number;
  dok1Count: number;
  dok2Count: number;
  dok3Count: number;
  dok3LinkedCount: number;
};

type ConfirmAndGradeResult = ConfirmAndGradeArgs & {
  action: string;
};

export const ConfirmAndGradeUI = makeAssistantToolUI<ConfirmAndGradeArgs, ConfirmAndGradeResult>({
  toolName: 'confirm_and_start_grading',
  render: ({ args, status }) => {
    const { startGrading } = useImportAgentContext();
    const isRunning = status.type === 'running';

    const sourcesCount = args?.sourcesCount ?? 0;
    const dok1Count = args?.dok1Count ?? 0;
    const dok2Count = args?.dok2Count ?? 0;
    const dok3Count = args?.dok3Count ?? 0;
    const dok3LinkedCount = args?.dok3LinkedCount ?? 0;

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-border">
          <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
            Import Summary
          </span>
          <span className="px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold bg-primary/10 text-primary">
            Ready
          </span>
        </div>

        {/* Summary grid */}
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          <SummaryItem label="Sources" value={sourcesCount} />
          <SummaryItem label="DOK1 Facts" value={dok1Count} />
          <SummaryItem label="DOK2 Summaries" value={dok2Count} />
          <SummaryItem label="DOK3 Insights" value={`${dok3LinkedCount} / ${dok3Count} linked`} />
        </div>

        {/* Action */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={startGrading}
            disabled={isRunning}
            className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm and Start Grading
          </button>
        </div>
      </div>
    );
  },
});

function SummaryItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}
