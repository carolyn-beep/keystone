import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import { config } from '@/brand';
import type { UseOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import type { OnboardingTopicSuggestion } from '@shared/routes';
import { PlaceholderSwap, useRotatingStructuredIdea } from './rotating-placeholder';
import { ThinkingLine, TopicCardSkeletons } from './loading-states';

interface TopicStepProps {
  onConfirm: (topic: string) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  subject: string;
  onSubjectChange: (v: string) => void;
  focus: string;
  onFocusChange: (v: string) => void;
  goal: string;
  onGoalChange: (v: string) => void;
  /** Structured ideas for the animated slot placeholders. */
  placeholderIdeas: OnboardingTopicSuggestion[];
}

function joinTopic(subject: string, focus: string, goal: string): string {
  let result = subject;
  if (focus.trim()) result += `, specifically focusing on ${focus}`;
  if (goal.trim()) result += `, in order to ${goal}`;
  return result;
}

/**
 * Wizard step 1 — Topic. Three fill-in-the-blank inputs joined by the fixed
 * connector phrases "specifically focusing on" and "in order to". All three
 * parts are required before CONFIRM is enabled. The joined string is passed
 * to onConfirm; nothing persists until then.
 */
export function TopicStep({
  onConfirm,
  isSubmitting,
  error,
  subject,
  onSubjectChange,
  focus,
  onFocusChange,
  goal,
  onGoalChange,
  placeholderIdeas,
}: TopicStepProps) {
  const focusRef = useRef<HTMLInputElement>(null);
  const goalRef = useRef<HTMLInputElement>(null);
  const currentIdea = useRotatingStructuredIdea(placeholderIdeas);

  const canConfirm =
    subject.trim().length >= 3 &&
    focus.trim().length >= 3 &&
    goal.trim().length >= 3 &&
    !isSubmitting;

  const handleConfirm = () => {
    if (!canConfirm) return;
    void onConfirm(joinTopic(subject, focus, goal)).catch(() => {});
  };

  return (
    <div className="flex flex-1 flex-col max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">What's your project about?</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">
        Go as specific or as broad as you like.
      </p>

      <div className="mt-10 space-y-7">
        <div>
          <label htmlFor="topic-subject" className="font-serif text-[34px] leading-[1.25] text-foreground">
            I'll be working on
          </label>
          <div className="relative mt-3">
            <input
              id="topic-subject"
              data-testid="input-topic-subject"
              type="text"
              value={subject}
              autoFocus
              placeholder=""
              aria-placeholder={currentIdea?.topic ?? 'e.g. Rocket propulsion'}
              onChange={(e) => onSubjectChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  focusRef.current?.focus();
                }
              }}
              className="font-serif text-[28px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none w-full pb-1"
            />
            {subject === '' && currentIdea && (
              <PlaceholderSwap text={currentIdea.topic} className="text-[28px]" />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="topic-focus" className="font-serif italic text-[20px] leading-[1.25] text-muted-foreground">
            specifically focusing on
          </label>
          <div className="relative mt-3">
            <input
              ref={focusRef}
              id="topic-focus"
              data-testid="input-topic-focus"
              type="text"
              value={focus}
              placeholder=""
              aria-placeholder={currentIdea?.focus ?? 'e.g. the chemistry of solid rocket motors'}
              onChange={(e) => onFocusChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  goalRef.current?.focus();
                }
              }}
              className="font-serif text-[28px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none w-full pb-1"
            />
            {focus === '' && currentIdea && (
              <PlaceholderSwap text={currentIdea.focus} className="text-[28px]" />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="topic-goal" className="font-serif italic text-[20px] leading-[1.25] text-muted-foreground">
            in order to
          </label>
          <div className="relative mt-3">
            <input
              ref={goalRef}
              id="topic-goal"
              data-testid="input-topic-goal"
              type="text"
              value={goal}
              placeholder=""
              aria-placeholder={currentIdea?.why ?? 'e.g. build rockets that go higher'}
              onChange={(e) => onGoalChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              className="font-serif text-[28px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none w-full pb-1"
            />
            {goal === '' && currentIdea && (
              <PlaceholderSwap text={currentIdea.why} className="text-[28px]" />
            )}
          </div>
        </div>
      </div>

      {error && (
        <p data-testid="topic-error" className="font-serif italic text-[14px] text-destructive mt-6 m-0">
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <TactileButton
          variant="raised"
          data-testid="button-confirm-topic"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          {isSubmitting ? 'Creating…' : 'Confirm'}
        </TactileButton>
      </div>
    </div>
  );
}

const cardTween = { type: 'tween', duration: 0.35, ease: 'easeInOut' } as const;
const VISIBLE_COUNT = 4;
const ROTATION_INTERVAL = 4500;

/**
 * Rail for step 1: structured topic suggestion cards. Shows up to 4 at a time.
 * Initial batch staggers in; once visible, rotates every ROTATION_INTERVAL ms --
 * top card exits right, remaining shift up, new card enters from below.
 */
export function TopicStepRail({
  ideas,
  onAccept,
}: {
  ideas: UseOnboardingSuggestions;
  onAccept: (s: OnboardingTopicSuggestion) => void;
}) {
  const { Mascot } = config.wizardPersona;
  const { structured, isLoading, refresh, refreshUsed } = ideas;
  const total = structured.length;
  const hasItems = total > 0;

  // startIndex: the first card of the visible window (wraps around).
  const [startIndex, setStartIndex] = useState(0);
  // revealed: how many of the current window have staggered in (0..VISIBLE_COUNT).
  const [revealed, setRevealed] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());

  // Reset stagger + window when a new batch arrives.
  useEffect(() => {
    const hasNew = structured.some((s) => !seenRef.current.has(s.text));
    structured.forEach((s) => seenRef.current.add(s.text));
    if (hasNew) {
      setStartIndex(0);
      setRevealed(0);
    }
  }, [structured]);

  // Stagger: reveal one card every 90ms until the window is full.
  const windowSize = Math.min(VISIBLE_COUNT, total);
  useEffect(() => {
    if (revealed >= windowSize) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 90);
    return () => clearTimeout(t);
  }, [revealed, windowSize]);

  // Rotation: once stagger is done and there are more cards than the window,
  // advance the window every ROTATION_INTERVAL ms.
  useEffect(() => {
    if (total <= VISIBLE_COUNT || revealed < windowSize) return;
    const t = setInterval(() => setStartIndex((i) => i + 1), ROTATION_INTERVAL);
    return () => clearInterval(t);
  }, [total, revealed, windowSize]);

  // Derive the visible slice (wrapping).
  const visibleCards = total === 0
    ? []
    : Array.from({ length: windowSize }, (_, i) => structured[(startIndex + i) % total]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-8 py-6" data-testid="suggestion-surface">
      {/* Persona header */}
      <div className="flex items-center gap-3">
        {Mascot ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card shadow-card">
            <Mascot className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-card">
            {config.wizardPersona.name.slice(0, 2)}
          </span>
        )}
        <span className="text-[15px] font-bold text-foreground">{config.wizardPersona.name}</span>
      </div>

      {(isLoading || hasItems) && (
        <div className="mt-auto pt-10">
          <h3 className="m-0 text-[18px] font-bold leading-tight text-foreground">
            Need a starting point?
          </h3>
          <p className="m-0 mt-1 font-serif text-[14px] italic text-muted-foreground">
            Tap an idea to fill it in
          </p>

          {isLoading && !hasItems ? (
            <div className="mt-5 space-y-4">
              <ThinkingLine message="Thinking of a few ideas" data-testid="suggestions-loading" />
              <TopicCardSkeletons />
            </div>
          ) : (
            <div className="relative mt-5 flex flex-col gap-2.5 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                {visibleCards.slice(0, revealed).map((s) => (
                  <motion.button
                    key={s.text}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 40 }}
                    transition={cardTween}
                    type="button"
                    data-testid="suggestion-chip"
                    onClick={() => onAccept(s)}
                    className="w-full rounded-lg bg-card px-4 py-3 text-left shadow-card transition-shadow duration-150 hover:shadow-md"
                  >
                    <div className="font-serif text-[14px] font-semibold leading-snug text-foreground">
                      {s.topic}
                    </div>
                    <div className="mt-1">
                      <div className="font-serif italic text-[10px] text-muted-foreground">
                        specifically focusing on
                      </div>
                      <div className="font-serif text-[12px] leading-snug text-foreground mt-1">
                        {s.focus}
                      </div>
                    </div>
                    <div className="mt-1">
                      <div className="font-serif italic text-[10px] text-muted-foreground">
                        in order to
                      </div>
                      <div className="font-serif text-[12px] leading-snug text-foreground mt-1">
                        {s.why}
                      </div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="mt-6">
            <TactileButton
              variant="inset"
              data-testid="suggestion-refresh"
              onClick={refresh}
              disabled={refreshUsed || isLoading}
              className="text-[11px] uppercase tracking-[0.2em] px-4 py-2"
            >
              Give me more ideas
            </TactileButton>
          </div>
        </div>
      )}
    </div>
  );
}
