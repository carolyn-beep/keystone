import { useState } from 'react';
import { motion } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import { X } from 'lucide-react';
import { config } from '@/brand';
import type { UseOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import { SuggestionSurface } from './SuggestionSurface';
import { PlaceholderSwap, useRotatingIdea } from './rotating-placeholder';
import { addScopeItem, removeScopeItem, type ScopeVariant } from './scope-helpers';

const COPY: Record<ScopeVariant, { heading: string; helper: string; placeholder: string; railTitle: string }> = {
  in: {
    heading: "What's in scope?",
    helper: 'The more specific, the better. It helps us surface the right research material.',
    placeholder: 'List things to include',
    railTitle: 'Ideas to include',
  },
  out: {
    heading: "What's out of scope?",
    helper: "This helps us filter out content that's not relevant to your learning.",
    placeholder: 'Things this project is NOT about',
    railTitle: 'Ideas to exclude',
  },
};

/** Shared-layout id linking a rail chip to its accepted-list twin. */
const scopeChipId = (variant: ScopeVariant, value: string) =>
  `chip-${variant}-${value.trim().toLowerCase()}`;

/** Rail suggestions minus already-accepted items (addScopeItem semantics). */
const remainingSuggestions = (suggestions: string[], items: string[]) =>
  suggestions.filter((s) => !items.some((i) => i.toLowerCase() === s.trim().toLowerCase()));

interface ScopeStepProps {
  variant: ScopeVariant;
  /** Accepted items (lifted to the page so the rail's chips share the list). */
  items: string[];
  onItemsChange: (items: string[]) => void;
  /** Advance to the next step (page handles the PATCH). */
  onNext: () => void;
  /**
   * Loaded suggestions (shared with the rail). While the entry line is empty
   * its placeholder cycles through the not-yet-accepted ones.
   */
  suggestionIdeas: string[];
}

/**
 * Wizard steps 2-3 — In Scope / Out of Scope (screen2/screen3 restyle). A
 * free-entry line (Enter adds an item), accepted items as removable chips, and
 * CONFIRM. Zero items is legal. The page owns persistence (buildScopePatch).
 */
export function ScopeStep({ variant, items, onItemsChange, onNext, suggestionIdeas }: ScopeStepProps) {
  const [draft, setDraft] = useState('');
  const copy = COPY[variant];

  // Rotating placeholder over the not-yet-accepted suggestions; static step
  // copy until ideas load.
  const currentIdea = useRotatingIdea(remainingSuggestions(suggestionIdeas, items), copy.placeholder);

  const commitDraft = () => {
    const next = addScopeItem(items, draft);
    if (next !== items) onItemsChange(next);
    setDraft('');
  };

  return (
    <div className="flex flex-1 flex-col max-w-[760px]">
      <span className="text-[12px] uppercase tracking-[0.35em] font-semibold text-primary">
        {variant === 'in' ? 'In Scope' : 'Out of Scope'}
      </span>
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0 mt-3">{copy.heading}</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">{copy.helper}</p>

      <div className="relative mt-10">
        <input
          data-testid="input-scope"
          type="text"
          value={draft}
          autoFocus
          placeholder=""
          aria-placeholder={currentIdea}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
          }}
          className="font-serif text-[34px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none w-full pb-1"
        />
        {/* Animated placeholder — hidden the moment the student types. */}
        {draft === '' && <PlaceholderSwap text={currentIdea} />}
      </div>

      {items.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2.5" data-testid="scope-items">
          {items.map((item) => (
            <motion.span
              key={item}
              layoutId={scopeChipId(variant, item)}
              layout
              transition={{ type: 'spring', duration: 0.45, bounce: 0 }}
              data-testid="scope-chip"
              className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[14px] text-foreground shadow-card"
            >
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                data-testid="scope-chip-remove"
                onClick={() => onItemsChange(removeScopeItem(items, item))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={14} />
              </button>
            </motion.span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-8">
        <TactileButton
          variant="raised"
          data-testid="button-scope-next"
          onClick={onNext}
          className="text-[12px] uppercase tracking-[0.25em] px-8 py-3"
        >
          Confirm
        </TactileButton>
      </div>
    </div>
  );
}

/**
 * Rail for the scope steps: kind-matched suggestion chips. Accepting a chip
 * adds it to the shared items list (deduped). One refresh per step. The
 * suggestions hook lives on the page so the step's rotating placeholder shares
 * the same batch.
 */
export function ScopeStepRail({
  variant,
  ideas,
  items,
  onItemsChange,
}: {
  variant: ScopeVariant;
  ideas: UseOnboardingSuggestions;
  items: string[];
  onItemsChange: (items: string[]) => void;
}) {
  const copy = COPY[variant];

  // Accepted phrases leave the rail (same dedupe semantics as addScopeItem),
  // landing in the step's list in the same commit — the shared layoutId makes
  // the chip travel across.
  const visibleSuggestions = remainingSuggestions(ideas.suggestions, items);

  return (
    <SuggestionSurface
      persona={config.wizardPersona}
      title={copy.railTitle}
      helper="Select from below or type your own"
      suggestions={visibleSuggestions}
      loading={ideas.isLoading}
      onAccept={(phrase) => onItemsChange(addScopeItem(items, phrase))}
      onRefresh={ideas.refresh}
      refreshUsed={ideas.refreshUsed}
      chipLayoutId={(phrase) => scopeChipId(variant, phrase)}
    />
  );
}
