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
  error: string | null;
  isVisible: boolean;
}

const ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'extracting',
  'grading',
  'grading_dok2',
  'contradictions',
  'readingList',
  'saving',
  'experts',
  'redundancy',
];

function getStageIndex(stage: ImportStage | null): number {
  if (!stage || stage === 'complete' || stage === 'error') return -1;
  return ORDERED_STAGES.indexOf(stage);
}

export function ImportProgress({
  currentStage,
  stageLabel,
  progress,
  gradingProgress,
  gradingDok2Progress,
  error,
  isVisible,
}: ImportProgressProps) {
  const currentIndex = getStageIndex(currentStage);
  const isComplete = currentStage === 'complete';
  const isError = currentStage === 'error' || !!error;

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
          <div className="pt-5 mt-5 border-t border-border space-y-4">
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

            {/* DOK1 Grading counter with smooth number transition */}
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: currentStage === 'grading' && gradingProgress ? '1fr' : '0fr',
                opacity: currentStage === 'grading' && gradingProgress ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="text-center text-sm text-muted-foreground py-1">
                  <span className="tabular-nums font-medium text-foreground">
                    {gradingProgress?.completed ?? 0}
                  </span>
                  {' '}of{' '}
                  <span className="tabular-nums font-medium text-foreground">
                    {gradingProgress?.total ?? 0}
                  </span>
                  {' '}facts graded
                </div>
              </div>
            </div>

            {/* DOK2 Grading counter with smooth number transition */}
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: currentStage === 'grading_dok2' && gradingDok2Progress ? '1fr' : '0fr',
                opacity: currentStage === 'grading_dok2' && gradingDok2Progress ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="text-center text-sm text-muted-foreground py-1">
                  <span className="tabular-nums font-medium text-foreground">
                    {gradingDok2Progress?.completed ?? 0}
                  </span>
                  {' '}of{' '}
                  <span className="tabular-nums font-medium text-foreground">
                    {gradingDok2Progress?.total ?? 0}
                  </span>
                  {' '}summaries graded
                </div>
              </div>
            </div>

            {/* Stage list with staggered fade-in */}
            <div className="space-y-2 pt-2">
              {ORDERED_STAGES.map((stage, index) => {
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
                    {stage === 'grading' && isCurrentStage && gradingProgress && (
                      <span className="text-primary text-xs ml-auto tabular-nums font-medium">
                        {gradingProgress.completed}/{gradingProgress.total}
                      </span>
                    )}
                    {stage === 'grading_dok2' && isCurrentStage && gradingDok2Progress && (
                      <span className="text-primary text-xs ml-auto tabular-nums font-medium">
                        {gradingDok2Progress.completed}/{gradingDok2Progress.total}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Error message with animation */}
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: error ? '1fr' : '0fr',
                opacity: error ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm animate-fade-slide-in">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            </div>

            {/* Success message with animation */}
            <div
              className="grid transition-all duration-300 ease-out"
              style={{
                gridTemplateRows: isComplete && !error ? '1fr' : '0fr',
                opacity: isComplete && !error ? 1 : 0,
              }}
            >
              <div className="overflow-hidden">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 text-success text-sm animate-fade-slide-in">
                  <Check size={16} />
                  <span>Import complete! Redirecting...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
