import { useState, useCallback, useRef } from 'react';
import {
  type ImportProgress,
  type ImportStage,
  STAGE_LABELS,
  calculateProgress,
} from '@shared/import-progress';
import type { EvaluationState } from '@shared/preformat-decision';
import { queryClient } from '@/lib/queryClient';

export interface GradingProgress {
  completed: number;
  total: number;
}

/**
 * Import phase state machine.
 *
 * idle → evaluating → decision_pending → formatting → importing → ... → complete
 *                   → importing (no_formatting_needed, skips decision)
 *        → idle+error (not_a_brainlift or network failure)
 *
 * idle → importing → (auto: stays importing) → complete
 * idle → importing → dok3_manual_linking → dok4_manual_linking → finishing → complete
 */
export type ImportPhase =
  | 'idle'
  | 'evaluating'
  | 'decision_pending'
  | 'formatting'
  | 'importing'
  | 'dok3_manual_linking'
  | 'dok4_manual_linking'
  | 'finishing'
  | 'complete';

export interface ImportState {
  importPhase: ImportPhase;
  autoLink: boolean;
  isImporting: boolean;
  currentStage: ImportStage | null;
  stageLabel: string;
  progress: number;
  // Grading counters (all modes)
  gradingProgress: GradingProgress | null;
  gradingDok2Progress: GradingProgress | null;
  gradingDok3Progress: GradingProgress | null;
  gradingDok4Progress: GradingProgress | null;
  // Auto-mode linking counters
  linkingDok3Progress: GradingProgress | null;
  linkingDok4Progress: GradingProgress | null;
  // Manual-mode linking data
  manualDok3Info: { dok3Count: number; slug: string } | null;
  manualDok4Count: number | null;
  // Preformat evaluation state
  evaluationResult: EvaluationState | null;
  formattingProgress: GradingProgress | null;
  // Outcome
  error: string | null;
  slug: string | null;
}

const INITIAL_STATE: ImportState = {
  importPhase: 'idle',
  autoLink: true,
  isImporting: false,
  currentStage: null,
  stageLabel: '',
  progress: 0,
  gradingProgress: null,
  gradingDok2Progress: null,
  gradingDok3Progress: null,
  gradingDok4Progress: null,
  linkingDok3Progress: null,
  linkingDok4Progress: null,
  manualDok3Info: null,
  manualDok4Count: null,
  evaluationResult: null,
  formattingProgress: null,
  error: null,
  slug: null,
};

export function useImportWithProgress() {
  const [state, setState] = useState<ImportState>(INITIAL_STATE);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref for stale closure detection (used by AddBrainliftModal's handleSubmit)
  const phaseRef = useRef<ImportPhase>('idle');

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    phaseRef.current = 'idle';
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reset();
  }, [reset]);

  /** Manual mode: user completed DOK3 linking -> transition to DOK4 or finishing */
  const completeDok3Linking = useCallback(() => {
    setState((prev) => {
      const hasDok4 = (prev.manualDok4Count ?? 0) > 0;
      const nextPhase: ImportPhase = hasDok4 ? 'dok4_manual_linking' : 'finishing';
      phaseRef.current = nextPhase;
      return {
        ...prev,
        importPhase: nextPhase,
        manualDok3Info: null,
      };
    });
  }, []);

  /** Manual mode: user completed DOK4 linking -> transition to finishing */
  const completeDok4Linking = useCallback(() => {
    phaseRef.current = 'finishing';
    setState((prev) => ({
      ...prev,
      importPhase: 'finishing',
    }));
  }, []);

  /**
   * Evaluate brainlift content for preformat decision.
   * Phase: idle -> evaluating -> decision_pending | importing | idle+error
   */
  const evaluateBrainlift = useCallback(async (formData: FormData): Promise<void> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    phaseRef.current = 'evaluating';
    setState((prev) => ({
      ...INITIAL_STATE,
      importPhase: 'evaluating',
      autoLink: formData.get('autoLink') !== 'false',
      stageLabel: 'Evaluating document structure...',
    }));

    try {
      const response = await fetch('/api/brainlifts/evaluate', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMessage = 'Evaluation failed';
        try {
          const data = await response.json();
          errorMessage = data.message || 'Evaluation failed';
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const result: EvaluationState = await response.json();

      if (result.decision === 'not_a_brainlift') {
        phaseRef.current = 'idle';
        setState((prev) => ({
          ...prev,
          importPhase: 'idle',
          evaluationResult: result,
          error: 'This does not appear to be a valid BrainLift document. Please check the URL and try again.',
        }));
        return;
      }

      if (result.decision === 'no_formatting_needed') {
        // Skip decision UI, go straight to importing without preformat
        phaseRef.current = 'importing';
        setState((prev) => ({
          ...prev,
          importPhase: 'importing',
          evaluationResult: result,
          isImporting: true,
          stageLabel: 'Starting import...',
        }));
        return;
      }

      // needs_formatting -> show decision UI
      phaseRef.current = 'decision_pending';
      setState((prev) => ({
        ...prev,
        importPhase: 'decision_pending',
        evaluationResult: result,
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      phaseRef.current = 'idle';
      setState((prev) => ({
        ...prev,
        importPhase: 'idle',
        error: err.message || 'Evaluation failed. Please try again.',
      }));
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Start import with preformat=true (user accepted formatting).
   * Phase: decision_pending -> formatting -> importing -> ...
   */
  const acceptFormatting = useCallback(async (formData: FormData): Promise<string | null> => {
    phaseRef.current = 'formatting';
    setState((prev) => ({
      ...prev,
      importPhase: 'formatting',
      isImporting: true,
      stageLabel: 'Formatting document structure...',
    }));
    formData.set('preformat', 'true');
    return importBrainliftInternal(formData);
  }, []);

  /**
   * Start import with preformat=false (user rejected formatting).
   * Phase: decision_pending -> importing -> ...
   */
  const rejectFormatting = useCallback(async (formData: FormData): Promise<string | null> => {
    phaseRef.current = 'importing';
    setState((prev) => ({
      ...prev,
      importPhase: 'importing',
      isImporting: true,
      stageLabel: 'Starting import...',
    }));
    formData.set('preformat', 'false');
    return importBrainliftInternal(formData);
  }, []);

  /**
   * Import brainlift via SSE stream. Internal method used by both
   * the legacy direct import path and the evaluate->accept/reject path.
   */
  const importBrainliftInternal = useCallback(async (formData: FormData): Promise<string | null> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/brainlifts/import-stream', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMessage = 'Import failed';
        try {
          const data = await response.json();
          errorMessage = data.message || 'Import failed';
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let resultSlug: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let eventEnd: number;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);

          let eventType = '';
          let eventData = '';
          for (const line of eventBlock.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData = line.slice(5).trim();
            }
          }

          if (eventType === 'progress' && eventData) {
            try {
              const event = JSON.parse(eventData) as ImportProgress;
              const progress = calculateProgress(event);

              setState((prev) => {
                let nextPhase = prev.importPhase;

                // ── Phase transition: formatting -> importing ──
                // When we see an extracting stage, we've moved past formatting
                if (
                  event.stage === 'extracting' &&
                  (prev.importPhase === 'formatting')
                ) {
                  nextPhase = 'importing';
                  phaseRef.current = nextPhase;
                }

                // ── Phase transitions (manual mode only) ──
                if (!prev.autoLink) {
                  // Manual: dok3_linking with dok3Count+slug -> show DOK3LinkingUI
                  if (
                    event.stage === 'dok3_linking' &&
                    'dok3Count' in event &&
                    'slug' in event &&
                    prev.importPhase === 'importing'
                  ) {
                    nextPhase = 'dok3_manual_linking';
                    phaseRef.current = nextPhase;
                  }
                }

                // Complete event -> transition to complete (both modes)
                if (event.stage === 'complete') {
                  // In finishing or importing phase, complete immediately
                  if (prev.importPhase === 'importing' || prev.importPhase === 'finishing') {
                    nextPhase = 'complete';
                    phaseRef.current = nextPhase;
                  }
                  // In manual linking phases, stay -- completion handled by slug return
                }

                return {
                  ...prev,
                  importPhase: nextPhase,
                  currentStage: event.stage,
                  stageLabel: event.message || STAGE_LABELS[event.stage],
                  progress,
                  // DOK1 grading counter
                  gradingProgress:
                    event.stage === 'grading' && 'completed' in event && 'total' in event
                      ? { completed: event.completed, total: event.total }
                      : prev.gradingProgress,
                  // DOK2 grading counter
                  gradingDok2Progress:
                    event.stage === 'grading_dok2' && 'completed' in event && 'total' in event
                      ? { completed: event.completed, total: event.total }
                      : prev.gradingDok2Progress,
                  // DOK3 grading counter
                  gradingDok3Progress:
                    event.stage === 'grading_dok3' && 'completed' in event && 'total' in event
                      ? { completed: event.completed, total: event.total }
                      : prev.gradingDok3Progress,
                  // DOK4 grading counter
                  gradingDok4Progress:
                    event.stage === 'grading_dok4' && 'completed' in event && 'total' in event
                      ? { completed: event.completed, total: event.total }
                      : prev.gradingDok4Progress,
                  // Auto-mode DOK3 linking counter
                  linkingDok3Progress:
                    event.stage === 'dok3_linking' && 'completed' in event && 'total' in event
                      ? { completed: (event as any).completed, total: (event as any).total }
                      : prev.linkingDok3Progress,
                  // Auto-mode DOK4 linking counter
                  linkingDok4Progress:
                    event.stage === 'dok4_linking' && 'completed' in event && 'total' in event
                      ? { completed: (event as any).completed, total: (event as any).total }
                      : prev.linkingDok4Progress,
                  // Manual-mode DOK3 linking info
                  manualDok3Info:
                    event.stage === 'dok3_linking' && 'dok3Count' in event && 'slug' in event && !prev.autoLink
                      ? { dok3Count: (event as any).dok3Count, slug: (event as any).slug }
                      : prev.manualDok3Info,
                  // Manual-mode DOK4 count
                  manualDok4Count:
                    event.stage === 'dok4_extraction' && 'dok4Count' in event && !prev.autoLink
                      ? (event as any).dok4Count
                      : prev.manualDok4Count,
                  // Formatting progress counter
                  formattingProgress:
                    event.stage === 'formatting' && 'completed' in event && 'total' in event
                      ? { completed: (event as any).completed, total: (event as any).total }
                      : prev.formattingProgress,
                  error: event.stage === 'error' && 'error' in event ? event.error : null,
                  slug: event.stage === 'complete' && 'slug' in event ? event.slug : prev.slug,
                };
              });

              if (event.stage === 'complete' && 'slug' in event) {
                resultSlug = event.slug;
              }

              if (event.stage === 'error') {
                throw new Error('error' in event ? event.error : 'Import failed');
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Import failed') {
                console.warn('Failed to parse SSE event:', parseErr);
              } else {
                throw parseErr;
              }
            }
          }
        }
      }

      // Invalidate queries after successful import
      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });

      setState((prev) => ({
        ...prev,
        isImporting: false,
        progress: 100,
      }));

      return resultSlug;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null;
      }

      setState((prev) => ({
        ...prev,
        isImporting: false,
        error: err.message || 'Import failed',
      }));

      return null;
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  /**
   * Legacy direct import path (used when evaluation is not needed,
   * e.g., HTML uploads or Google Docs).
   */
  const importBrainlift = useCallback(async (formData: FormData): Promise<string | null> => {
    const isAutoLink = formData.get('autoLink') !== 'false';

    phaseRef.current = 'importing';
    setState({
      ...INITIAL_STATE,
      importPhase: 'importing',
      autoLink: isAutoLink,
      isImporting: true,
      stageLabel: 'Starting import...',
    });

    return importBrainliftInternal(formData);
  }, [importBrainliftInternal]);

  return {
    ...state,
    importBrainlift,
    evaluateBrainlift,
    acceptFormatting,
    rejectFormatting,
    cancel,
    reset,
    completeDok3Linking,
    completeDok4Linking,
    phaseRef,
  };
}
