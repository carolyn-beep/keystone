import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';
import confetti from 'canvas-confetti';
import { tokens } from '@/lib/colors';
import type { QuizQuestion, QuizAnswer } from '@shared/schema';

interface QuizResultsProps {
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  score: number;
  isRevisit: boolean;
}

function getEncouragementMessage(score: number, total: number): string {
  if (score === total) {
    return 'Perfect recall \u2014 you clearly know this material.';
  }
  if (score === total - 1) {
    return 'Strong understanding. Review the one you missed.';
  }
  if (score >= Math.ceil(total / 2)) {
    return 'Good start. Review what you missed before summarizing.';
  }
  return "Some concepts didn't stick yet. Try re-reading or discussing with the study agent.";
}

const DOK2_NUDGE = 'Ready to put it in your own words with a DOK2 summary?';

export function QuizResults({
  questions,
  answers,
  score,
  isRevisit,
}: QuizResultsProps) {
  const confettiFired = useRef(false);

  // Fire confetti on perfect score, first visit only
  useEffect(() => {
    if (score === questions.length && !isRevisit && !confettiFired.current) {
      confettiFired.current = true;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#56643F', '#D97706', '#3B6E8F', '#953A34', '#22150D'],
        disableForReducedMotion: true,
      });
    }
  }, [score, questions.length, isRevisit]);

  const total = questions.length;
  const encouragement = getEncouragementMessage(score, total);

  // Build a lookup from questionIndex -> answer for fast access
  const answerMap = new Map(answers.map((a) => [a.questionIndex, a]));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          {isRevisit ? 'Previous Results' : 'Results'}
        </span>
      </div>

      {/* Score */}
      <div className="px-5 pb-3 flex items-baseline gap-2">
        <span
          className="font-serif text-[54px] leading-none font-normal tracking-wide"
          style={{ color: score === total ? tokens.success : tokens.primary }}
        >
          {score}
        </span>
        <span className="font-serif text-[20px] text-muted-foreground leading-none">
          out of {total}
        </span>
      </div>

      {/* Encouragement */}
      <div className="px-5 pb-2">
        <p className="font-serif text-[14px] leading-relaxed text-foreground m-0">
          {encouragement}
        </p>
      </div>

      {/* DOK2 nudge */}
      <div className="px-5 pb-4">
        <p className="font-serif text-[13px] leading-relaxed text-muted-foreground italic m-0">
          {DOK2_NUDGE}
        </p>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-border" />

      {/* Question review list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3 scrollbar-styled">
        {questions.map((q, index) => {
          const answer = answerMap.get(index);
          const correct = answer?.correct ?? false;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="rounded-lg p-3"
              style={{ backgroundColor: correct ? tokens.successSoft : tokens.dangerSoft }}
            >
              {/* Question header with badge */}
              <div className="flex items-start gap-2 mb-1.5">
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: correct ? tokens.success : tokens.danger }}
                >
                  {correct ? <Check size={14} /> : <XIcon size={14} />}
                </span>
                <span className="font-serif text-[13px] leading-relaxed text-foreground flex-1">
                  {q.question}
                </span>
                <span
                  className="px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold shrink-0"
                  style={{
                    backgroundColor: correct ? tokens.successSoft : tokens.dangerSoft,
                    color: correct ? tokens.success : tokens.danger,
                  }}
                >
                  {correct ? 'Correct' : 'Incorrect'}
                </span>
              </div>

              {/* Show selected vs correct for wrong answers */}
              {!correct && answer && (
                <div className="ml-6 mb-1.5 space-y-0.5">
                  <p className="text-[12px] text-muted-foreground m-0">
                    <span className="font-semibold" style={{ color: tokens.danger }}>
                      Your answer:
                    </span>{' '}
                    {q.options[answer.selectedIndex]}
                  </p>
                  <p className="text-[12px] text-muted-foreground m-0">
                    <span className="font-semibold" style={{ color: tokens.success }}>
                      Correct answer:
                    </span>{' '}
                    {q.options[q.correctIndex]}
                  </p>
                </div>
              )}

              {/* Explanation */}
              <p className="ml-6 font-serif text-[12px] leading-relaxed text-muted-foreground m-0 italic">
                {q.explanation}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
