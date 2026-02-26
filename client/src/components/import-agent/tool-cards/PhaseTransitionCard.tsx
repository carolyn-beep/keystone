import { makeAssistantToolUI } from '@assistant-ui/react';

type PhaseTransitionArgs = {
  fromPhase: string;
  toPhase: string;
  completedItems: string[];
  summary: string;
};

type PhaseTransitionResult = {
  fromPhase: string;
  toPhase: string;
  completedItems: string[];
  summary: string;
  action: string;
};

const phaseLabels: Record<string, string> = {
  init: 'Initialize',
  sources: 'Sources',
  dok1: 'DOK1 Facts',
  dok2: 'DOK2 Summaries',
  dok3: 'DOK3 Insights',
  dok3_linking: 'DOK3 Linking',
  final: 'Complete',
};

function formatPhase(phase: string): string {
  return phaseLabels[phase] ?? phase;
}

export const PhaseTransitionUI = makeAssistantToolUI<PhaseTransitionArgs, PhaseTransitionResult>({
  toolName: 'phase_transition',
  render: ({ args, result, status }) => {
    const isRunning = status.type === 'running';
    const fromPhase = result?.fromPhase ?? args?.fromPhase ?? '';
    const toPhase = result?.toPhase ?? args?.toPhase ?? '';
    const completedItems = result?.completedItems ?? args?.completedItems ?? [];
    const summary = result?.summary ?? args?.summary ?? '';

    return (
      <div className="my-4 rounded-xl shadow-card bg-card-elevated overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between border-b border-border ${
          !isRunning ? 'bg-success/5' : ''
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
              Phase Transition
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
              {formatPhase(fromPhase)}
              <span className="text-muted-foreground mx-1">&rarr;</span>
              {formatPhase(toPhase)}
            </span>
          </div>
          <span className={`px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold ${
            isRunning
              ? 'bg-muted text-muted-foreground'
              : 'bg-success-soft text-success'
          }`}>
            {isRunning ? 'Transitioning' : 'Complete'}
          </span>
        </div>

        {/* Checklist */}
        <div className="px-6 py-4">
          <ul className="space-y-1.5 m-0 p-0 list-none">
            {completedItems.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-foreground">
                <span className={`mt-0.5 shrink-0 ${!isRunning ? 'text-success' : 'text-muted-foreground'}`}>
                  {!isRunning ? '\u2713' : '\u25CB'}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Summary footer */}
        <div className="px-6 py-3 border-t border-border">
          <p className="text-[11px] italic text-muted-foreground m-0">{summary}</p>
        </div>
      </div>
    );
  },
});
