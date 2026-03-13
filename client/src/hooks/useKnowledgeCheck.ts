import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { QuizQuestion, QuizAnswer } from '@shared/schema';

/** Frontend representation of a quiz (mirrors KnowledgeCheckQuiz DB type). */
export interface KnowledgeCheckQuiz {
  id: number;
  itemId: number;
  questions: QuizQuestion[];
  answers: QuizAnswer[] | null;
  score: number | null;
  completedAt: string | null;
}

/** POST /quiz response: quiz, unavailable, or generating (server polling in progress). */
type GenerateResponse =
  | { quiz: KnowledgeCheckQuiz }
  | { unavailable: true; reason: string }
  | { status: 'generating' };

/** PATCH /quiz response: always returns the updated quiz. */
interface SubmitResponse {
  quiz: KnowledgeCheckQuiz;
}

export interface UseKnowledgeCheckReturn {
  quiz: KnowledgeCheckQuiz | null;
  isLoading: boolean;
  unavailableReason: string | null;
  generateOrGet: () => void;
  submitAnswers: (answers: QuizAnswer[]) => Promise<void>;
  isSubmitting: boolean;
}

export function useKnowledgeCheck(slug: string, itemId: number): UseKnowledgeCheckReturn {
  const [quiz, setQuiz] = useState<KnowledgeCheckQuiz | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  const generateMutation = useMutation({
    mutationFn: async (): Promise<GenerateResponse> => {
      const res = await apiRequest(
        'POST',
        `/api/brainlifts/${slug}/learning-stream/${itemId}/quiz`,
      );
      return res.json();
    },
    onSuccess: (data) => {
      if ('unavailable' in data && data.unavailable) {
        setUnavailableReason(data.reason);
      } else if ('quiz' in data) {
        setQuiz(data.quiz);
        retryCountRef.current = 0;
      } else if ('status' in data && data.status === 'generating') {
        // Auto-retry once after 3s delay (max 1 retry to prevent loops)
        if (retryCountRef.current < 1) {
          retryCountRef.current += 1;
          setTimeout(() => generateMutation.mutate(), 3000);
        }
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (answers: QuizAnswer[]): Promise<SubmitResponse> => {
      const res = await apiRequest(
        'PATCH',
        `/api/brainlifts/${slug}/learning-stream/${itemId}/quiz`,
        { answers },
      );
      return res.json();
    },
    onSuccess: (data) => {
      setQuiz(data.quiz);
    },
  });

  const generateOrGet = useCallback(() => {
    retryCountRef.current = 0;
    generateMutation.mutate();
  }, [generateMutation]);

  const submitAnswers = useCallback(
    async (answers: QuizAnswer[]): Promise<void> => {
      await submitMutation.mutateAsync(answers);
    },
    [submitMutation],
  );

  return {
    quiz,
    isLoading: generateMutation.isPending,
    unavailableReason,
    generateOrGet,
    submitAnswers,
    isSubmitting: submitMutation.isPending,
  };
}
