import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import type { WizardPersona } from '@/brand/types';
import { ThinkingLine, ChipSkeletons } from './loading-states';

interface SuggestionSurfaceProps {
  /** Brand persona (read from the brand config slot — no brand conditionals here). */
  persona: WizardPersona;
  /** Rail heading above the chips, e.g. "Suggestions for Out of Scope". */
  title: string;
  /** Optional italic helper under the title, e.g. "Select from below or type your own". */
  helper?: string;
  suggestions: string[];
  loading: boolean;
  /** Tap-to-accept a chip; the accepted phrase leaves the list upstream. */
  onAccept: (phrase: string) => void;
  /** Single refresh affordance. Disables after one use per step. */
  onRefresh: () => void;
  refreshUsed: boolean;
  /**
   * Shared-layout id for a chip (framer-motion layoutId). When the accepting
   * step renders its accepted item with the same id in the same commit, the
   * chip visually travels from the rail into the step's list (and back when
   * removed). Omit for steps where accept doesn't move the chip (topic).
   */
  chipLayoutId?: (phrase: string) => string;
  /** Optional slot rendered above the chips (e.g. the step-1 pro-tip card). */
  children?: React.ReactNode;
}

const chipSpring = { type: 'spring', duration: 0.45, bounce: 0 } as const;

/**
 * Wizard suggestion rail (04-suggestion-steps FR3). Persona header + a chip
 * list (tap to accept) + a single refresh affordance. Per the screen2/screen3
 * restyle mocks. Empty + not-loading renders no chip section (silent empty
 * state — no empty shell, no error wall); the persona header always remains.
 */
export function SuggestionSurface({
  persona,
  title,
  helper,
  suggestions,
  loading,
  onAccept,
  onRefresh,
  refreshUsed,
  chipLayoutId,
  children,
}: SuggestionSurfaceProps) {
  const { Mascot } = persona;
  const hasChips = suggestions.length > 0;

  // Chips of a fresh batch stack one by one (progressive mount, not a group
  // pop). `seenRef` distinguishes a genuinely new batch (initial load,
  // refresh) from filter churn — an accepted chip leaving / coming back must
  // not restart the stagger.
  const [revealed, setRevealed] = useState(0);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const hasNew = suggestions.some((s) => !seenRef.current.has(s));
    suggestions.forEach((s) => seenRef.current.add(s));
    if (hasNew) setRevealed(0);
  }, [suggestions]);

  useEffect(() => {
    if (revealed >= suggestions.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 90);
    return () => clearTimeout(t);
  }, [revealed, suggestions.length]);

  return (
    <div className="flex h-full w-full flex-col px-8 py-6" data-testid="suggestion-surface">
      {/* Persona header — mascot (when present) + name label (always). */}
      <div className="flex items-center gap-3">
        {Mascot ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card shadow-card">
            <Mascot className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-card">
            {persona.name.slice(0, 2)}
          </span>
        )}
        <span className="text-[15px] font-bold text-foreground" data-testid="persona-name">
          {persona.name}
        </span>
      </div>

      {/* Optional pro-tip / context slot. */}
      {children}

      {/* Chip section — only when loading or when there are chips. */}
      {(loading || hasChips) && (
        <div className="mt-auto pt-10">
          {/* The chip section is bottom-anchored, so each newly stacked chip
              pushes the heading upward — layout="position" makes that ride
              smooth instead of jumping row by row. */}
          <motion.h3
            layout="position"
            transition={chipSpring}
            className="m-0 text-[18px] font-bold leading-tight text-foreground"
          >
            {title}
          </motion.h3>
          {helper && (
            <motion.p
              layout="position"
              transition={chipSpring}
              className="m-0 mt-1 font-serif text-[14px] italic text-muted-foreground"
            >
              {helper}
            </motion.p>
          )}

          {loading && !hasChips ? (
            <div className="mt-5 space-y-4">
              <ThinkingLine message="Thinking of a few ideas" data-testid="suggestions-loading" />
              <ChipSkeletons />
            </div>
          ) : (
            <motion.div
              layout="position"
              transition={chipSpring}
              className="mt-5 flex flex-wrap gap-2.5"
              data-testid="suggestion-chips"
            >
              {suggestions.slice(0, revealed).map((phrase) => (
                <motion.button
                  key={phrase}
                  layoutId={chipLayoutId?.(phrase)}
                  layout
                  initial={{ opacity: 0, scale: 0.85, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={chipSpring}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  type="button"
                  data-testid="suggestion-chip"
                  onClick={() => onAccept(phrase)}
                  className="rounded-full bg-card px-4 py-2 text-[14px] text-foreground shadow-card"
                >
                  {phrase}
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Single refresh affordance, disabled after one use. */}
          <motion.div layout="position" transition={chipSpring} className="mt-6">
            <TactileButton
              variant="inset"
              data-testid="suggestion-refresh"
              onClick={onRefresh}
              disabled={refreshUsed || loading}
              className="text-[11px] uppercase tracking-[0.2em] px-4 py-2"
            >
              Give me more ideas
            </TactileButton>
          </motion.div>
        </div>
      )}
    </div>
  );
}
