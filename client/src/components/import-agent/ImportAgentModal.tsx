import { useState, useCallback } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ImportAgentLayout } from './ImportAgentLayout';
import { ImportAgentProvider } from './ImportAgentContext';
import { ImportProgress } from '@/components/ImportProgress';
import { useImportConversation } from '@/hooks/useImportConversation';
import { useGradingProgress } from '@/hooks/useGradingProgress';
import type { ImportStage } from '@shared/import-progress';

interface ImportAgentModalProps {
  brainliftSlug: string;
  onClose: () => void;
  onComplete: (slug: string) => void;
}

const CASCADE_ORDERED_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'grading',
  'grading_dok2',
  'grading_dok3',
  'experts',
  'redundancy',
];

export function ImportAgentModal({ brainliftSlug, onClose, onComplete }: ImportAgentModalProps) {
  const [mode, setMode] = useState<'agent' | 'grading'>('agent');
  const conversation = useImportConversation(brainliftSlug);
  const grading = useGradingProgress();

  const handleStartGrading = useCallback(async () => {
    setMode('grading');
    const resultSlug = await grading.startGrading(brainliftSlug);
    if (resultSlug) {
      onComplete(resultSlug);
    }
  }, [brainliftSlug, grading.startGrading, onComplete]);

  const isComplete = grading.currentStage === 'complete';
  const canClose = !grading.isGrading || isComplete;

  if (mode === 'grading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg bg-card rounded-lg border border-border shadow-lg">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Grading in Progress</h2>
            <button
              onClick={onClose}
              disabled={!canClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-6 py-8">
            <ImportProgress
              currentStage={grading.currentStage}
              stageLabel={grading.stageLabel}
              progress={grading.progress}
              gradingProgress={grading.gradingProgress}
              gradingDok2Progress={grading.gradingDok2Progress}
              gradingDok3Progress={grading.gradingDok3Progress}
              error={grading.error}
              isVisible={true}
              orderedStages={CASCADE_ORDERED_STAGES}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shrink-0">
        <h2 className="text-sm font-semibold text-foreground">Import Agent</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {conversation.isLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading conversation...</span>
          </div>
        ) : (
          <ImportAgentProvider value={{ startGrading: handleStartGrading }}>
            <ImportAgentLayout
              slug={brainliftSlug}
              initialMessages={conversation.messages}
            />
          </ImportAgentProvider>
        )}
      </div>
    </div>
  );
}
