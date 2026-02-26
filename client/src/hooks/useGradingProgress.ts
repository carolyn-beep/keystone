import { useState, useCallback, useRef } from 'react';
import {
  type ImportProgress,
  type ImportStage,
  STAGE_LABELS,
} from '@shared/import-progress';
import { queryClient } from '@/lib/queryClient';
import type { GradingProgress } from './useImportWithProgress';

export interface GradingState {
  isGrading: boolean;
  currentStage: ImportStage | null;
  stageLabel: string;
  progress: number;
  gradingProgress: GradingProgress | null;
  gradingDok2Progress: GradingProgress | null;
  gradingDok3Progress: GradingProgress | null;
  error: string | null;
  slug: string | null;
}

// Weights tuned for cascade-only stages (must sum to 100)
const CASCADE_WEIGHTS: Partial<Record<ImportStage, number>> = {
  grading: 45,
  grading_dok2: 20,
  grading_dok3: 15,
  experts: 12,
  redundancy: 8,
};

const CASCADE_STAGES: Exclude<ImportStage, 'complete' | 'error'>[] = [
  'grading',
  'grading_dok2',
  'grading_dok3',
  'experts',
  'redundancy',
];

function calculateCascadeProgress(event: ImportProgress): number {
  if (event.stage === 'complete') return 100;
  if (event.stage === 'error') return 0;

  const currentIndex = CASCADE_STAGES.indexOf(event.stage as any);
  if (currentIndex === -1) return 0;

  let progress = 0;
  for (let i = 0; i < currentIndex; i++) {
    progress += CASCADE_WEIGHTS[CASCADE_STAGES[i]] ?? 0;
  }

  const currentWeight = CASCADE_WEIGHTS[event.stage as keyof typeof CASCADE_WEIGHTS] ?? 0;
  if (
    (event.stage === 'grading' || event.stage === 'grading_dok2' || event.stage === 'grading_dok3') &&
    'completed' in event &&
    'total' in event
  ) {
    const partial = event.total > 0 ? event.completed / event.total : 0;
    progress += currentWeight * partial;
  } else {
    progress += currentWeight * 0.5;
  }

  return Math.min(progress, 99);
}

export function useGradingProgress() {
  const [state, setState] = useState<GradingState>({
    isGrading: false,
    currentStage: null,
    stageLabel: '',
    progress: 0,
    gradingProgress: null,
    gradingDok2Progress: null,
    gradingDok3Progress: null,
    error: null,
    slug: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState({
      isGrading: false,
      currentStage: null,
      stageLabel: '',
      progress: 0,
      gradingProgress: null,
      gradingDok2Progress: null,
      gradingDok3Progress: null,
      error: null,
      slug: null,
    });
  }, []);

  const startGrading = useCallback(async (slug: string): Promise<string | null> => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      isGrading: true,
      currentStage: null,
      stageLabel: 'Starting grading cascade...',
      progress: 0,
      gradingProgress: null,
      gradingDok2Progress: null,
      gradingDok3Progress: null,
      error: null,
      slug: null,
    });

    try {
      const response = await fetch(`/api/brainlifts/${slug}/start-grading`, {
        method: 'POST',
        credentials: 'include',
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorMessage = 'Grading failed';
        try {
          const data = await response.json();
          errorMessage = data.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read response stream');

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
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }

          if (eventType === 'progress' && eventData) {
            try {
              const event = JSON.parse(eventData) as ImportProgress;
              const progress = calculateCascadeProgress(event);

              setState((prev) => ({
                ...prev,
                currentStage: event.stage,
                stageLabel: event.message || STAGE_LABELS[event.stage],
                progress,
                gradingProgress:
                  event.stage === 'grading' && 'completed' in event && 'total' in event
                    ? { completed: event.completed, total: event.total }
                    : prev.gradingProgress,
                gradingDok2Progress:
                  event.stage === 'grading_dok2' && 'completed' in event && 'total' in event
                    ? { completed: event.completed, total: event.total }
                    : prev.gradingDok2Progress,
                gradingDok3Progress:
                  event.stage === 'grading_dok3' && 'completed' in event && 'total' in event
                    ? { completed: event.completed, total: event.total }
                    : prev.gradingDok3Progress,
                error: event.stage === 'error' && 'error' in event ? event.error : null,
                slug: event.stage === 'complete' && 'slug' in event ? event.slug : prev.slug,
              }));

              if (event.stage === 'complete' && 'slug' in event) {
                resultSlug = event.slug;
              }

              if (event.stage === 'error') {
                throw new Error('error' in event ? event.error : 'Grading failed');
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Grading failed') {
                console.warn('Failed to parse SSE event:', parseErr);
              } else {
                throw parseErr;
              }
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/brainlifts'] });

      setState((prev) => ({
        ...prev,
        isGrading: false,
        progress: 100,
      }));

      return resultSlug;
    } catch (err: any) {
      if (err.name === 'AbortError') return null;

      setState((prev) => ({
        ...prev,
        isGrading: false,
        error: err.message || 'Grading failed',
      }));

      return null;
    } finally {
      abortControllerRef.current = null;
    }
  }, []);

  return {
    ...state,
    startGrading,
    cancel,
  };
}
