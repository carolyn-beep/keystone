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
  error: string | null;
  slug: string | null;
}

export function useImportWithProgress() {
  const [state, setState] = useState<ImportState>({
    isImporting: false,
    currentStage: null,
    stageLabel: '',
    progress: 0,
    gradingProgress: null,
    error: null,
    slug: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({
      isImporting: false,
      currentStage: null,
      stageLabel: '',
      progress: 0,
      gradingProgress: null,
      error: null,
      slug: null,
    });
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    reset();
  }, [reset]);

  const importBrainlift = useCallback(async (formData: FormData): Promise<string | null> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      isImporting: true,
      currentStage: null,
      stageLabel: 'Starting import...',
      progress: 0,
      gradingProgress: null,
      error: null,
      slug: null,
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
                gradingProgress:
                  event.stage === 'grading' && 'completed' in event && 'total' in event
                    ? { completed: event.completed, total: event.total }
                    : prev.gradingProgress,
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
  };
}
