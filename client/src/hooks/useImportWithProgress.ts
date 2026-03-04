import { useState, useCallback, useRef } from 'react';
import {
  type ImportProgress,
  type ImportStage,
  STAGE_LABELS,
  calculateProgress,
} from '@shared/import-progress';
import { queryClient } from '@/lib/queryClient';

export interface GradingProgress {
  completed: number;
  total: number;
}

export interface ImportState {
  isImporting: boolean;
  currentStage: ImportStage | null;
  stageLabel: string;
  progress: number;
  gradingProgress: GradingProgress | null;
  gradingDok2Progress: GradingProgress | null;
  gradingDok3Progress: GradingProgress | null;
  gradingDok4Progress: GradingProgress | null;
  linkingDok3Progress: GradingProgress | null;
  linkingDok4Progress: GradingProgress | null;
  error: string | null;
  slug: string | null;
  dok3LinkingInfo: { dok3Count: number; slug: string } | null;
  dok4ExtractionInfo: { dok4Count: number } | null;
}

const INITIAL_STATE: ImportState = {
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
  error: null,
  slug: null,
  dok3LinkingInfo: null,
  dok4ExtractionInfo: null,
};

export function useImportWithProgress() {
  const [state, setState] = useState<ImportState>(INITIAL_STATE);

  const abortControllerRef = useRef<AbortController | null>(null);
  const dok3LinkingRef = useRef<{ dok3Count: number; slug: string } | null>(null);

  const reset = useCallback(() => {
    dok3LinkingRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reset();
  }, [reset]);

  /** Clear linking UI without killing the SSE stream -- import continues in background */
  const dismissLinking = useCallback(() => {
    dok3LinkingRef.current = null;
    setState((prev) => ({ ...prev, dok3LinkingInfo: null }));
  }, []);

  const importBrainlift = useCallback(async (formData: FormData): Promise<string | null> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      ...INITIAL_STATE,
      isImporting: true,
      stageLabel: 'Starting import...',
    });

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

        // Process complete SSE events (each ends with \n\n)
        let eventEnd: number;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const eventBlock = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);

          // Parse event block into type and data
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

              setState((prev) => ({
                ...prev,
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
                // DOK3 linking counter (auto mode: has completed/total)
                linkingDok3Progress:
                  event.stage === 'dok3_linking' && 'completed' in event && 'total' in event
                    ? { completed: (event as any).completed, total: (event as any).total }
                    : prev.linkingDok3Progress,
                // DOK4 linking counter (auto mode: has completed/total)
                linkingDok4Progress:
                  event.stage === 'dok4_linking' && 'completed' in event && 'total' in event
                    ? { completed: (event as any).completed, total: (event as any).total }
                    : prev.linkingDok4Progress,
                // DOK3 linking info (manual mode: has dok3Count + slug, no completed/total)
                dok3LinkingInfo:
                  event.stage === 'dok3_linking' && 'dok3Count' in event && 'slug' in event
                    ? (() => {
                        const info = { dok3Count: (event as any).dok3Count, slug: (event as any).slug };
                        dok3LinkingRef.current = info;
                        return info;
                      })()
                    : prev.dok3LinkingInfo,
                // DOK4 extraction info (manual mode: track SPOV count for DOK4LinkingUI)
                dok4ExtractionInfo:
                  event.stage === 'dok4_extraction' && 'dok4Count' in event
                    ? { dok4Count: (event as any).dok4Count }
                    : prev.dok4ExtractionInfo,
                error: event.stage === 'error' && 'error' in event ? event.error : null,
                slug: event.stage === 'complete' && 'slug' in event ? event.slug : prev.slug,
              }));

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
          // 'done' event signals stream complete, but we continue reading until done=true
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
        // User cancelled, reset was already called
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

  return {
    ...state,
    importBrainlift,
    cancel,
    reset,
    dismissLinking,
    dok3LinkingRef,
  };
}
