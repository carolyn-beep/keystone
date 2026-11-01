import { useState } from 'react';
import { motion } from 'framer-motion';
import { TactileButton } from '@/components/ui/tactile-button';
import { X } from 'lucide-react';
import { config } from '@/brand';
import { useCategories } from '@/hooks/useCategories';
import type { UseOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import { SuggestionSurface } from './SuggestionSurface';
import { PlaceholderSwap, useRotatingIdea } from './rotating-placeholder';
import { isDuplicateCategory } from './scope-helpers';

/** Shared-layout id linking a rail chip to its created-category twin. */
const categoryChipId = (name: string) => `chip-cat-${name.trim().toLowerCase()}`;

/**
 * Wizard step 4 — Categories. Suggested + manually-added category names seed
 * REAL rows immediately via the existing categories endpoints (no staging
 * state); deselect deletes. Zero categories on Next is legal.
 *
 * Visual treatment is mock-pending (spec 04 FR5): this is the wizard shell
 * vocabulary + neo-editorial conventions, deliberately separable so a restyle
 * pass can swap the presentation without touching the seeding logic.
 */
export function CategoriesStep({
  slug,
  onNext,
  suggestionIdeas,
}: {
  slug: string;
  onNext: () => void;
  /** Loaded category ideas (shared with the rail) for the rotating placeholder. */
  suggestionIdeas: string[];
}) {
  const { categories, createCategory, deleteCategory, isCreating, isRemoving } = useCategories(slug);
  const [draft, setDraft] = useState('');

  // Rotating placeholder over the not-yet-created suggestions; static step
  // copy until ideas load.
  const currentIdea = useRotatingIdea(
    suggestionIdeas.filter((s) => !isDuplicateCategory(categories, s)),
    'Expertise Area',
  );

  // Selected state derives from created rows (the canonical ['categories', slug]
  // query) — no separate selection state to drift.
  const add = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (isDuplicateCategory(categories, trimmed)) return; // duplicate accept is a no-op
    await createCategory(trimmed);
  };

  const commitDraft = async () => {
    await add(draft);
    setDraft('');
  };

  return (
    <div className="flex flex-1 flex-col max-w-[760px]">
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0">Map out the territory</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">
        Name the areas you need to get good at to make this project great. We'll build your learning around each one.
      </p>

      <div className="relative mt-10">
        <input
          data-testid="input-category"
          type="text"
          value={draft}
          placeholder=""
          aria-placeholder={currentIdea}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitDraft();
          }}
          className="font-serif text-[34px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-muted-foreground focus:outline-none w-full pb-1"
        />
        {/* Animated placeholder — hidden the moment the student types. */}
        {draft === '' && <PlaceholderSwap text={currentIdea} />}
      </div>

      {categories.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2.5" data-testid="category-items">
          {categories.map((cat) => (
            <motion.span
              key={cat.id}
              layoutId={categoryChipId(cat.name)}
              layout
              transition={{ type: 'spring', duration: 0.45, bounce: 0 }}
              data-testid="category-chip"
              className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[14px] text-foreground shadow-card"
            >
              {cat.name}
              <button
                type="button"
                aria-label={`Remove ${cat.name}`}
                data-testid="category-chip-remove"
                disabled={isRemoving}
                onClick={() => void deleteCategory(cat.id)}
                className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
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
          data-testid="button-categories-next"
          disabled={isCreating}
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
 * Rail for step 4: category-name suggestions. Accepting a chip seeds a real
 * category row (deduped, case-insensitive). One refresh per step. The
 * suggestions hook lives on the page so the step's rotating placeholder shares
 * the same batch.
 */
export function CategoriesStepRail({
  slug,
  ideas,
}: {
  slug: string | undefined;
  ideas: UseOnboardingSuggestions;
}) {
  const { categories, createCategory } = useCategories(slug ?? '');

  const accept = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (isDuplicateCategory(categories, trimmed)) return;
    await createCategory(trimmed);
  };

  // Created categories leave the rail; chip + created row share a layoutId so
  // the chip travels into the step's list when the row lands.
  const visibleSuggestions = ideas.suggestions.filter((s) => !isDuplicateCategory(categories, s));

  return (
    <SuggestionSurface
      persona={config.wizardPersona}
      title="Suggested areas"
      helper="Tap to add, or type your own"
      suggestions={visibleSuggestions}
      loading={ideas.isLoading}
      onAccept={(phrase) => void accept(phrase)}
      onRefresh={ideas.refresh}
      refreshUsed={ideas.refreshUsed}
      chipLayoutId={categoryChipId}
    />
  );
}
