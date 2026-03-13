import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useKnowledgeCheck } from '@/hooks/useKnowledgeCheck';
import { QuizQuestion } from './QuizQuestion';
import { QuizResults } from './QuizResults';
import { tokens } from '@/lib/colors';
import type { LearningStreamItem, ExtractedContent } from '@/hooks/useLearningStream';
import type { QuizAnswer } from '@shared/schema';

interface KnowledgeCheckPanelProps {
  slug: string;
  itemId: number;
  item: LearningStreamItem;
}

type PanelState = 'loading' | 'unavailable' | 'quiz' | 'results' | 'completed';

/** Client-side unavailability check to avoid unnecessary POST. */
function getClientUnavailableReason(ec: ExtractedContent | null): string | null {
  if (!ec) return 'pending';
  if (ec.contentType === 'fallback') return 'fallback';
  if (ec.contentType === 'embed') {
    if (ec.embedType === 'spotify' || ec.embedType === 'apple-podcast') return 'podcast';
    if (ec.embedType === 'tweet') return 'tweet';
  }
  return null;
}

const UNAVAILABLE_MESSAGES: Record<string, { title: string; message: string }> = {
  podcast: {
    title: 'Audio Content',
    message:
      "Knowledge Check isn't available for audio content yet. Discuss this content with the study agent instead.",
  },
  tweet: {
    title: 'Tweet',
    message:
      "Knowledge Check isn't available for tweets. Discuss this content with the study agent instead.",
  },
  fallback: {
    title: 'Content Unavailable',
    message: "We couldn't extract this content. Try the Discussion tab instead.",
  },
  pending: {
    title: 'Processing',
    message: 'Content is still being extracted. Check back in a moment.',
  },
};

export function KnowledgeCheckPanel({
  slug,
  itemId,
  item,
}: KnowledgeCheckPanelProps) {
  const {
    quiz,
    isLoading,
    unavailableReason: serverUnavailableReason,
    generateOrGet,
    submitAnswers,
    isSubmitting,
  } = useKnowledgeCheck(slug, itemId);

  const [panelState, setPanelState] = useState<PanelState>('loading');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const hasInitialized = useRef(false);

  // Check client-side unavailability first
  const clientUnavailable = getClientUnavailableReason(item.extractedContent);

  // Initialize on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (clientUnavailable) {
      setPanelState('unavailable');
      return;
    }

    generateOrGet();
  }, [clientUnavailable, generateOrGet]);

  // React to hook state changes
  useEffect(() => {
    if (clientUnavailable) return; // already handled

    if (serverUnavailableReason) {
      setPanelState('unavailable');
      return;
    }

    if (quiz) {
      if (quiz.answers && quiz.answers.length > 0) {
        // Already completed — show previous results
        setPanelState('completed');
      } else if (panelState === 'loading') {
        // Fresh quiz loaded
        setPanelState('quiz');
      }
    }
  }, [quiz, serverUnavailableReason, clientUnavailable, panelState]);

  // Handle answer selection
  const handleAnswer = useCallback(
    (selectedIndex: number) => {
      if (!quiz) return;
      const newAnswer: QuizAnswer = {
        questionIndex: currentQuestionIndex,
        selectedIndex,
        correct: selectedIndex === quiz.questions[currentQuestionIndex].correctIndex,
      };
      setAnswers((prev) => [...prev, newAnswer]);
    },
    [quiz, currentQuestionIndex],
  );

  // Handle next question / submit
  const handleNext = useCallback(async () => {
    if (!quiz) return;

    if (currentQuestionIndex < quiz.questions.length - 1) {
      // More questions
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      // Last question — submit answers
      await submitAnswers(answers);
      setPanelState('results');
    }
  }, [quiz, currentQuestionIndex, answers, submitAnswers]);

  // Determine effective unavailable reason
  const unavailableKey = clientUnavailable || serverUnavailableReason || 'fallback';

  // --- Render states ---

  if (panelState === 'unavailable') {
    const msg = UNAVAILABLE_MESSAGES[unavailableKey] || UNAVAILABLE_MESSAGES.fallback;
    return (
      <div className="flex flex-col h-full bg-card-elevated">
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-center max-w-[240px]"
          >
            <AlertCircle
              size={28}
              className="mx-auto mb-3"
              style={{ color: tokens.warning }}
            />
            <p className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-2">
              {msg.title}
            </p>
            <p className="font-serif text-[13px] leading-relaxed text-muted-foreground m-0">
              {msg.message}
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (panelState === 'loading' || isLoading) {
    return (
      <div className="flex flex-col h-full bg-card-elevated">
        <div className="flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-center"
          >
            <Loader2
              size={24}
              className="mx-auto mb-3 animate-spin"
              style={{ color: tokens.primary }}
            />
            <p className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground mb-1">
              Generating Quiz
            </p>
            <p className="font-serif text-[12px] text-muted-foreground m-0">
              Creating questions from this content...
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  if ((panelState === 'results' || panelState === 'completed') && quiz) {
    const effectiveAnswers = panelState === 'completed' ? quiz.answers! : answers;
    const effectiveScore =
      panelState === 'completed'
        ? quiz.score!
        : effectiveAnswers.filter((a) => a.correct).length;

    return (
      <div className="flex flex-col h-full bg-card-elevated">
        <QuizResults
          questions={quiz.questions}
          answers={effectiveAnswers}
          score={effectiveScore}
          isRevisit={panelState === 'completed'}
        />
      </div>
    );
  }

  if (panelState === 'quiz' && quiz) {
    return (
      <div className="flex flex-col h-full bg-card-elevated">
        {/* Progress bar */}
        <div className="px-5 pb-2">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: tokens.primary }}
              initial={{ width: 0 }}
              animate={{
                width: `${((currentQuestionIndex + (answers.length > currentQuestionIndex ? 1 : 0)) / quiz.questions.length) * 100}%`,
              }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Current question */}
        <div className="flex-1 min-h-0">
          <QuizQuestion
            key={currentQuestionIndex}
            question={quiz.questions[currentQuestionIndex]}
            questionNumber={currentQuestionIndex + 1}
            totalQuestions={quiz.questions.length}
            onAnswer={handleAnswer}
            onNext={handleNext}
            isLast={currentQuestionIndex === quiz.questions.length - 1}
            disabled={isSubmitting}
          />
        </div>
      </div>
    );
  }

  // Fallback (should not reach here)
  return null;
}
