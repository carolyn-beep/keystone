import { useState } from 'react';
import { TactileButton } from '@/components/ui/tactile-button';
import { X } from 'lucide-react';
import { config } from '@/brand';
import { useCategories } from '@/hooks/useCategories';
import { useOnboardingSuggestions } from '@/hooks/useOnboardingSuggestions';
import { SuggestionSurface } from './SuggestionSurface';
import { isDuplicateCategory } from './scope-helpers';

/**
 * Wizard step 4 — Categories. Suggested + manually-added category names seed
 * REAL rows immediately via the existing categories endpoints (no staging
 * state); deselect deletes. Zero categories on Next is legal.
 *
 * Visual treatment is mock-pending (spec 04 FR5): this is the wizard shell
 * vocabulary + neo-editorial conventions, deliberately separable so a restyle
 * pass can swap the presentation without touching the seeding logic.
 */
export function CategoriesStep({ slug, onNext }: { slug: string; onNext: () => void }) {
  const { categories, createCategory, deleteCategory, isCreating, isRemoving } = useCategories(slug);
  const [draft, setDraft] = useState('');

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
    <div className="max-w-[760px]">
      <span className="text-[12px] uppercase tracking-[0.35em] font-semibold text-primary">Categories</span>
      <h2 className="text-[28px] font-bold tracking-tight leading-[1.1] m-0 mt-3">Map out the territory</h2>
      <p className="font-serif italic text-[15px] text-muted-foreground m-0 mt-2">
        Pick a few categories to organise what you learn. You can always change these later.
      </p>

      <div className="mt-10">
        <input
          data-testid="input-category"
          type="text"
          value={draft}
          placeholder="Add a category."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitDraft();
          }}
          className="font-serif text-[34px] leading-[1.25] text-foreground bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none placeholder:text-muted-light w-full pb-1"
        />
      </div>

      {categories.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2.5" data-testid="category-items">
          {categories.map((cat) => (
            <span
              key={cat.id}
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
            </span>
          ))}
        </div>
      )}

      <div className="mt-16">
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
 * category row (deduped, case-insensitive). One refresh per step.
 */
export function CategoriesStepRail({ slug }: { slug: string | undefined }) {
  const { categories, createCategory } = useCategories(slug ?? '');
  const { suggestions, isLoading, refresh, refreshUsed } = useOnboardingSuggestions({
    kind: 'categories',
    slug,
    enabled: Boolean(slug),
  });

  const accept = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    if (isDuplicateCategory(categories, trimmed)) return;
    await createCategory(trimmed);
  };

  return (
    <SuggestionSurface
      persona={config.wizardPersona}
      title="Suggested categories"
      helper="Tap to add, or type your own"
      suggestions={suggestions}
      loading={isLoading}
      onAccept={(phrase) => void accept(phrase)}
      onRefresh={refresh}
      refreshUsed={refreshUsed}
      refreshLabel="Generate more"
    />
  );
}
