import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { OnboardingTopicSuggestion } from '@shared/routes';

/**
 * Cycles through loaded suggestion ideas for an input's animated placeholder
 * (features/ux-redesign/onboarding-wizard). Falls back to a static text until
 * ideas arrive; rotates every 2.6s once there are at least two.
 */
export function useRotatingIdea(ideas: string[], fallback: string): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (ideas.length < 2) return;
    const t = setInterval(() => setIndex((i) => i + 1), 2600);
    return () => clearInterval(t);
  }, [ideas.length]);
  return ideas.length > 0 ? ideas[index % ideas.length] : fallback;
}

/**
 * Cycles through structured topic suggestions in sync so all three slots
 * show the same suggestion's parts at the same time.
 */
export function useRotatingStructuredIdea(
  ideas: OnboardingTopicSuggestion[],
  interval = 4500,
): OnboardingTopicSuggestion | null {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (ideas.length < 2) return;
    const t = setInterval(() => setIndex((i) => i + 1), interval);
    return () => clearInterval(t);
  }, [ideas.length, interval]);
  return ideas.length > 0 ? ideas[index % ideas.length] : null;
}

/**
 * The animated stand-in for a native placeholder (which can't animate): an
 * overlay matching the wizard's serif fill-in-the-blank inputs. On text
 * change the old idea swipes up and out while the next surfaces from below.
 * Render inside a `relative` wrapper, only while the input is empty; pair with
 * `aria-placeholder` on the input itself.
 *
 * Pass `className` to override the text size (default: text-[34px]).
 */
export function PlaceholderSwap({ text, className }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 overflow-hidden font-serif leading-[1.25] text-muted-light ${className ?? 'text-[34px]'}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="block truncate"
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0 }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
