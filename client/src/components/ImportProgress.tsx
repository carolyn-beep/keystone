import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { type ImportStage, STAGE_LABELS } from '@shared/import-progress';
import { type GradingProgress } from '@/hooks/useImportWithProgress';

interface ImportProgressProps {
  currentStage: ImportStage | null;
  stageLabel: string;
  progress: number;
  gradingProgress: GradingProgress | null;
  gradingDok2Progress: GradingProgress | null;
  gradingDok3Progress?: GradingProgress | null;
  gradingDok4Progress?: GradingProgress | null;
  linkingDok3Progress?: GradingProgress | null;
  linkingDok4Progress?: GradingProgress | null;
  error: string | null;
  isVisible: boolean;
  orderedStages?: Exclude<ImportStage, 'complete' | 'error'>[];
}

// DOK4 extraction is not a visible step — it happens during initial extraction.
// Linking stages have no per-item progress (only start/end), so no counters.
const DEFAULT_ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'extracting',
  'grading',
  'contradictions',
  'grading_dok2',
  'dok3_linking',
  'grading_dok3',
  'dok4_linking',
  'grading_dok4',
  'experts',
  'redundancy',
];

// Stages that have per-item grading counters (displayed as "X of Y" below progress bar)
const COUNTER_STAGES: Record<string, { prop: keyof ImportProgressProps; label: string }> = {
  grading: { prop: 'gradingProgress', label: 'facts graded' },
  grading_dok2: { prop: 'gradingDok2Progress', label: 'summaries graded' },
  grading_dok3: { prop: 'gradingDok3Progress', label: 'insights graded' },
  grading_dok4: { prop: 'gradingDok4Progress', label: 'SPOVs graded' },
};

// Stages that show inline counters in the checklist (right-aligned "X/Y")
const INLINE_COUNTER_STAGES: Record<string, keyof ImportProgressProps> = {
  grading: 'gradingProgress',
  grading_dok2: 'gradingDok2Progress',
  grading_dok3: 'gradingDok3Progress',
  grading_dok4: 'gradingDok4Progress',
};

export function ImportProgress({
  currentStage,
  stageLabel,
  progress,
  gradingProgress,
  gradingDok2Progress,
  gradingDok3Progress,
  gradingDok4Progress,
  error,
  isVisible,
  orderedStages,
  ...props
}: ImportProgressProps) {
  const stages = orderedStages ?? DEFAULT_ORDERED_STAGES;
  const currentIndex = (() => {
    if (!currentStage || currentStage === 'complete' || currentStage === 'error') return -1;
    return stages.indexOf(currentStage);
  })();
  const isComplete = currentStage === 'complete';
  const isError = currentStage === 'error' || !!error;

  // Collect all counter props for lookup
  const allProps = { gradingProgress, gradingDok2Progress, gradingDok3Progress, gradingDok4Progress, ...props };

  return (
    <>
      {/* Animated container with grid for smooth height transition */}
      <div
        className="grid transition-all duration-500 ease-out"
        style={{
          gridTemplateRows: isVisible ? '1fr' : '0fr',
          opacity: isVisible ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="space-y-4">
            {/* Progress bar */}
            <div
              className="space-y-2 animate-fade-slide-in"
              style={{ animationDelay: '0ms' }}
            >
              <div className="flex justify-between items-center text-sm">
                <span className="text-foreground font-medium animate-pulse-slow">
                  {stageLabel}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Active grading counter — only rendered for the current stage if it has counter data */}
            {currentStage && COUNTER_STAGES[currentStage] && (() => {
              const config = COUNTER_STAGES[currentStage];
              const counterProgress = allProps[config.prop] as GradingProgress | null | undefined;
              if (!counterProgress) return null;
              return (
                <div className="text-center text-sm text-muted-foreground py-1 animate-fade-slide-in">
                  <span className="tabular-nums font-medium text-foreground">
                    {counterProgress.completed}
                  </span>
                  {' '}of{' '}
                  <span className="tabular-nums font-medium text-foreground">
                    {counterProgress.total}
                  </span>
                  {' '}{config.label}
                </div>
              );
            })()}

            {/* Stage checklist with staggered fade-in */}
            <div className="space-y-2 pt-2">
              {stages.map((stage, index) => {
                const isCurrentStage = stage === currentStage;
                const isPastStage = index < currentIndex || isComplete;

                let icon;
                if (isPastStage || (isComplete && !isError)) {
                  icon = (
                    <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center">
                      <Check size={12} className="text-success" />
                    </div>
                  );
                } else if (isCurrentStage && !isError) {
                  icon = (
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Loader2 size={12} className="animate-spin text-primary" />
                    </div>
                  );
                } else {
                  icon = <div className="w-5 h-5 rounded-full bg-muted/50" />;
                }

                // Inline counter for grading stages only
                let inlineCounter: string | null = null;
                if (isCurrentStage && INLINE_COUNTER_STAGES[stage]) {
                  const p = allProps[INLINE_COUNTER_STAGES[stage]] as GradingProgress | null | undefined;
                  if (p) inlineCounter = `${p.completed}/${p.total}`;
                }

                return (
                  <div
                    key={stage}
                    className={`flex items-center gap-3 text-sm transition-all duration-300 animate-fade-slide-in ${
                      isCurrentStage
                        ? 'text-foreground font-medium'
                        : isPastStage
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground opacity-40'
                    }`}
                    style={{
                      animationDelay: `${100 + index * 50}ms`,
                      transform: isCurrentStage ? 'scale(1.02)' : 'scale(1)',
                    }}
                  >
                    <div className="transition-transform duration-200">{icon}</div>
                    <span className="transition-colors duration-200">{STAGE_LABELS[stage]}</span>
                    {inlineCounter && (
                      <span className="text-primary text-xs ml-auto tabular-nums font-medium">
                        {inlineCounter}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Error message with animation */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm animate-fade-slide-in">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success message with animation */}
            {isComplete && !error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 text-success text-sm animate-fade-slide-in">
                <Check size={16} />
                <span>Import complete! Redirecting...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
