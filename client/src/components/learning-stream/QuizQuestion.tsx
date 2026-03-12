import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X as XIcon } from 'lucide-react';
import { TactileButton } from '@/components/ui/tactile-button';
import { tokens } from '@/lib/colors';
import type { QuizQuestion as QuizQuestionType } from '@shared/schema';

interface QuizQuestionProps {
  question: QuizQuestionType;
  questionNumber: number;
  totalQuestions: number;
  onAnswer: (selectedIndex: number) => void;
  onNext: () => void;
  isLast: boolean;
  disabled?: boolean;
}

export function QuizQuestion({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  onNext,
  isLast,
  disabled = false,
}: QuizQuestionProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const answered = selectedIndex !== null;
  const isCorrect = answered && selectedIndex === question.correctIndex;

  function handleSelect(index: number) {
    if (answered || disabled) return;
    setSelectedIndex(index);
    onAnswer(index);
  }

  function getOptionStyle(index: number) {
    if (!answered) {
      return {
        bg: 'bg-card border border-border shadow-none',
        cursor: 'cursor-pointer hover:bg-card-elevated hover:shadow-card',
        icon: null,
      };
    }

    // After answering
    if (index === question.correctIndex) {
      return {
        bg: '',
        cursor: '',
        icon: <Check size={16} />,
        style: {
          backgroundColor: tokens.successSoft,
          borderColor: tokens.success,
          borderWidth: '1px',
          borderStyle: 'solid',
        },
      };
    }

    if (index === selectedIndex && index !== question.correctIndex) {
      return {
        bg: '',
        cursor: '',
        icon: <XIcon size={16} />,
        style: {
          backgroundColor: tokens.dangerSoft,
          borderColor: tokens.danger,
          borderWidth: '1px',
          borderStyle: 'solid',
        },
      };
    }

    // Unselected, not correct
    return {
      bg: 'bg-card border border-border opacity-50',
      cursor: '',
      icon: null,
    };
  }

  return (
    <div className="flex flex-col h-full">
      {/* Question counter */}
      <div className="px-5 pt-5 pb-2">
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground">
          Question {questionNumber} of {totalQuestions}
        </span>
      </div>

      {/* Question text */}
      <div className="px-5 pb-4">
        <p className="font-serif text-[15px] leading-relaxed text-foreground italic m-0">
          {question.question}
        </p>
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto px-5 space-y-2.5 scrollbar-styled">
        {question.options.map((option, index) => {
          const optionStyle = getOptionStyle(index);
          return (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(index)}
              disabled={answered || disabled}
              className={`w-full text-left flex items-start gap-3 p-3.5 rounded-lg transition-all duration-300 ${
                optionStyle.bg
              } ${optionStyle.cursor} ${
                answered || disabled ? 'cursor-default' : ''
              }`}
              style={optionStyle.style}
            >
              {/* Option letter */}
              <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-muted-foreground mt-0.5 shrink-0 w-4">
                {String.fromCharCode(65 + index)}.
              </span>

              {/* Option text */}
              <span className="font-serif text-[14px] leading-relaxed text-foreground flex-1">
                {option}
              </span>

              {/* Result icon */}
              {optionStyle.icon && (
                <span
                  className="mt-0.5 shrink-0"
                  style={{
                    color:
                      index === question.correctIndex
                        ? tokens.success
                        : tokens.danger,
                  }}
                >
                  {optionStyle.icon}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Explanation + Next button (after answering) */}
      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            className="px-5 pb-5 pt-3 border-t border-border mt-3"
          >
            {/* Correct/Incorrect badge */}
            <div className="mb-2">
              {isCorrect ? (
                <span
                  className="px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold"
                  style={{
                    backgroundColor: tokens.successSoft,
                    color: tokens.success,
                  }}
                >
                  Correct
                </span>
              ) : (
                <span
                  className="px-[6px] py-[2px] rounded text-[9px] uppercase tracking-[0.25em] font-semibold"
                  style={{
                    backgroundColor: tokens.dangerSoft,
                    color: tokens.danger,
                  }}
                >
                  Incorrect
                </span>
              )}
            </div>

            {/* Explanation text */}
            <p className="font-serif text-[13px] leading-relaxed text-muted-foreground m-0 mb-4">
              {question.explanation}
            </p>

            {/* Next / See Results button */}
            <TactileButton
              variant="raised"
              onClick={onNext}
              className="text-[12px] w-full"
            >
              {isLast ? 'See Results' : 'Next Question'}
            </TactileButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
