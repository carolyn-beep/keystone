import { useState } from 'react';
import { TactileButton } from '@/components/ui/tactile-button';
import { X } from 'lucide-react';
import { config } from '@/brand';
import { useOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import { SuggestionSurface } from './SuggestionSurface';
import { addScopeItem, removeScopeItem, type ScopeVariant } from './scope-helpers';

const COPY: Record<ScopeVariant, { heading: string; helper: string; placeholder: string; railTitle: string; refreshLabel: string }> = {
  in: {
    heading: "What's in scope?",
    helper: 'Try and make it specific. This will help us create your personalised learning content.',
    placeholder: 'List things to include.',
    railTitle: 'Suggestions for In Scope',
    refreshLabel: 'Refine In Scope',
  },
  out: {
    heading: "What's out of scope?",
    helper: "This helps us filter out content that's not relevant to your learning.",
    placeholder: 'List things to exclude.',
    railTitle: 'Suggestions for Out of Scope',
    refreshLabel: 'Refine Out of Scope',
  },
};

interface ScopeStepProps {
  variant: ScopeVariant;
  /** Accepted items (lifted to the page so the rail's chips share the list). */
  items: string[];
  onItemsChange: (items: string[]) => void;
  /** Advance to the next step (page handles the PATCH). */
  onNext: () => void;
}

/**
 * Wizard steps 2-3 — In Scope / Out of Scope (screen2/screen3 restyle). A
 * free-entry line (Enter adds an item), accepted items as removable chips, and
 * CONFIRM. Zero items is legal. The page owns persistence (buildScopePatch).
 */
export function ScopeStep({ variant, items, onItemsChange, onNext }: ScopeStepProps) {
  const [draft, setDraft] = useState('');
  const copy = COPY[variant];

  const commitDraft = () => {
    const next = addScopeItem(items, draft);
    if (next !== items) onItemsChange(next);
    setDraft('');
  };

  return (
    <div className="max-w-[760px]">
      <span className="text-[12px] uppercase tracking-[0.35em] font-semibold text-primary">
        {variant === 'in' ? 'In Scope' : 'Out of Scope'}
      </span>
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0 mt-3">{copy.heading}</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">{copy.helper}</p>

      <div className="mt-10">
        <input
          data-testid="input-scope"
          type="text"
          value={draft}
          autoFocus
          placeholder={copy.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
          }}
          className="font-serif text-[34px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light w-full pb-1"
        />
      </div>

      {items.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2.5" data-testid="scope-items">
          {items.map((item) => (
            <span
              key={item}
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
            </span>
          ))}
        </div>
      )}

      <div className="mt-16">
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
 * adds it to the shared items list (deduped). One refresh per step.
 */
export function ScopeStepRail({
  variant,
  slug,
  items,
  onItemsChange,
}: {
  variant: ScopeVariant;
  slug: string | undefined;
  items: string[];
  onItemsChange: (items: string[]) => void;
}) {
  const kind = variant === 'in' ? 'in-scope' : 'out-of-scope';
  const { suggestions, isLoading, refresh, refreshUsed } = useOnboardingSuggestions({
    kind,
    slug,
    enabled: Boolean(slug),
  });
  const copy = COPY[variant];

  return (
    <SuggestionSurface
      persona={config.wizardPersona}
      title={copy.railTitle}
      helper="Select from below or type your own"
      suggestions={suggestions}
      loading={isLoading}
      onAccept={(phrase) => onItemsChange(addScopeItem(items, phrase))}
      onRefresh={refresh}
      refreshUsed={refreshUsed}
      refreshLabel={copy.refreshLabel}
    />
  );
}
