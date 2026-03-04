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

const DEFAULT_ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'extracting',
  'grading',
  'contradictions',
  'grading_dok2',
  'dok3_linking',
  'grading_dok3',
  'dok4_extraction',
  'dok4_linking',
  'grading_dok4',
  'experts',
  'redundancy',
];

export function ImportProgress({
  currentStage,
  stageLabel,
  progress,
  gradingProgress,
  gradingDok2Progress,
  gradingDok3Progress,
  gradingDok4Progress,
  linkingDok3Progress,
  linkingDok4Progress,
  error,
  isVisible,
  orderedStages,
}: ImportProgressProps) {
  const stages = orderedStages ?? DEFAULT_ORDERED_STAGES;
  const currentIndex = (() => {
    if (!currentStage || currentStage === 'complete' || currentStage === 'error') return -1;
    return stages.indexOf(currentStage);
  })();
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

            {/* DOK1 Grading counter with smooth number transition */}
            <GradingCounter
              stage="grading"
              currentStage={currentStage}
              progress={gradingProgress}
              label="facts graded"
            />

            {/* DOK2 Grading counter */}
            <GradingCounter
              stage="grading_dok2"
              currentStage={currentStage}
              progress={gradingDok2Progress}
              label="summaries graded"
            />

            {/* DOK3 Linking counter (auto mode) */}
            <GradingCounter
              stage="dok3_linking"
              currentStage={currentStage}
              progress={linkingDok3Progress}
              label="insights linked"
            />

            {/* DOK3 Grading counter */}
            <GradingCounter
              stage="grading_dok3"
              currentStage={currentStage}
              progress={gradingDok3Progress}
              label="insights graded"
            />

            {/* DOK4 Linking counter (auto mode) */}
            <GradingCounter
              stage="dok4_linking"
              currentStage={currentStage}
              progress={linkingDok4Progress}
              label="SPOVs linked"
            />

            {/* DOK4 Grading counter */}
            <GradingCounter
              stage="grading_dok4"
              currentStage={currentStage}
              progress={gradingDok4Progress}
              label="SPOVs graded"
            />

            {/* Stage list with staggered fade-in */}
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

                // Determine inline counter for this stage
                const inlineCounter = getInlineCounter(stage, isCurrentStage, {
                  gradingProgress,
                  gradingDok2Progress,
                  gradingDok3Progress,
                  gradingDok4Progress,
                  linkingDok3Progress,
                  linkingDok4Progress,
                });

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

// ─── Helper Components ──────────────────────────────────────────────────────

function GradingCounter({
  stage,
  currentStage,
  progress,
  label,
}: {
  stage: ImportStage;
  currentStage: ImportStage | null;
  progress: GradingProgress | null | undefined;
  label: string;
}) {
  const isActive = currentStage === stage && progress;
  return (
    <div
      className="grid transition-all duration-300 ease-out"
      style={{
        gridTemplateRows: isActive ? '1fr' : '0fr',
        opacity: isActive ? 1 : 0,
      }}
    >
      <div className="overflow-hidden">
        <div className="text-center text-sm text-muted-foreground py-1">
          <span className="tabular-nums font-medium text-foreground">
            {progress?.completed ?? 0}
          </span>
          {' '}of{' '}
          <span className="tabular-nums font-medium text-foreground">
            {progress?.total ?? 0}
          </span>
          {' '}{label}
        </div>
      </div>
    </div>
  );
}

function getInlineCounter(
  stage: string,
  isCurrentStage: boolean,
  counters: {
    gradingProgress: GradingProgress | null;
    gradingDok2Progress: GradingProgress | null;
    gradingDok3Progress?: GradingProgress | null;
    gradingDok4Progress?: GradingProgress | null;
    linkingDok3Progress?: GradingProgress | null;
    linkingDok4Progress?: GradingProgress | null;
  },
): string | null {
  if (!isCurrentStage) return null;

  const map: Record<string, GradingProgress | null | undefined> = {
    grading: counters.gradingProgress,
    grading_dok2: counters.gradingDok2Progress,
    grading_dok3: counters.gradingDok3Progress,
    grading_dok4: counters.gradingDok4Progress,
    dok3_linking: counters.linkingDok3Progress,
    dok4_linking: counters.linkingDok4Progress,
  };

  const p = map[stage];
  if (p) return `${p.completed}/${p.total}`;
  return null;
}
