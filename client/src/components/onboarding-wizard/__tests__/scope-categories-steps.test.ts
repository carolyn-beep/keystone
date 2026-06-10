/**
 * Tests for 04-suggestion-steps FR4 (Scope steps) + FR5 (Categories step).
 *
 * Node-env: pure helpers tested directly + file-source pattern checks for the
 * component / page wiring. Mirrors spec 03's convention.
 */

import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { WIZARD_STEPS } from '../wizard-machine';
import {
  buildScopePatch,
  addScopeItem,
  removeScopeItem,
  isDuplicateCategory,
} from '../scope-helpers';

function readSource(relativePath: string): string {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

// ─── FR4: scope PATCH body construction ──────────────────────────────────────

describe('FR4: buildScopePatch', () => {
  it('step 2 forward move writes inScope + the step', () => {
    const patch = buildScopePatch({
      variant: 'in',
      items: ['whales', 'reefs'],
      target: 3,
      highWater: 2,
    });
    expect(patch).toEqual({ inScope: ['whales', 'reefs'], step: 3 });
  });

  it('step 3 forward move writes outOfScope + the step', () => {
    const patch = buildScopePatch({
      variant: 'out',
      items: ['ponds'],
      target: 4,
      highWater: 3,
    });
    expect(patch).toEqual({ outOfScope: ['ponds'], step: 4 });
  });

  it('a backward-revisit edit writes scope WITHOUT a step', () => {
    const patch = buildScopePatch({
      variant: 'in',
      items: ['whales'],
      target: 3,
      highWater: 5, // already past — not a forward move
    });
    expect(patch).toEqual({ inScope: ['whales'] });
    expect('step' in patch).toBe(false);
  });

  it('a same-step move writes scope without a step', () => {
    const patch = buildScopePatch({ variant: 'out', items: [], target: 3, highWater: 3 });
    expect(patch).toEqual({ outOfScope: [] });
  });

  it('zero items is legal and still produces a valid scope array', () => {
    const patch = buildScopePatch({ variant: 'in', items: [], target: 3, highWater: 2 });
    expect(patch).toEqual({ inScope: [], step: 3 });
  });
});

// ─── FR4: item list merge / remove ───────────────────────────────────────────

describe('FR4: addScopeItem / removeScopeItem', () => {
  it('adds a trimmed item', () => {
    expect(addScopeItem(['whales'], '  reefs  ')).toEqual(['whales', 'reefs']);
  });

  it('ignores an empty / whitespace-only entry', () => {
    expect(addScopeItem(['whales'], '   ')).toEqual(['whales']);
    expect(addScopeItem(['whales'], '')).toEqual(['whales']);
  });

  it('dedupes case-insensitively (accept + manual land in one list, no dupes)', () => {
    expect(addScopeItem(['Whales'], 'whales')).toEqual(['Whales']);
  });

  it('removes an item by value', () => {
    expect(removeScopeItem(['whales', 'reefs'], 'whales')).toEqual(['reefs']);
  });
});

// ─── FR5: category dedupe ────────────────────────────────────────────────────

describe('FR5: isDuplicateCategory (case-insensitive vs existing)', () => {
  const existing = [{ name: 'Ecology' }, { name: 'Marine Life' }];

  it('flags an exact-name duplicate', () => {
    expect(isDuplicateCategory(existing, 'Ecology')).toBe(true);
  });

  it('flags a case-insensitive duplicate', () => {
    expect(isDuplicateCategory(existing, 'ecology')).toBe(true);
    expect(isDuplicateCategory(existing, 'MARINE LIFE')).toBe(true);
  });

  it('flags a whitespace-padded duplicate', () => {
    expect(isDuplicateCategory(existing, '  Ecology  ')).toBe(true);
  });

  it('passes a genuinely new name', () => {
    expect(isDuplicateCategory(existing, 'Conservation')).toBe(false);
  });
});

// ─── FR4/FR5: wizard-machine + page wiring ───────────────────────────────────

describe('FR4/FR5: wizard-machine no longer marks steps 2-4 as placeholder', () => {
  it('steps 2, 3, 4 are not placeholders (steps 5, 6 still are)', () => {
    const byId = (id: number) => WIZARD_STEPS.find((s) => s.id === id)!;
    expect(byId(2).placeholder).toBe(false);
    expect(byId(3).placeholder).toBe(false);
    expect(byId(4).placeholder).toBe(false);
    expect(byId(5).placeholder).toBe(true);
    expect(byId(6).placeholder).toBe(true);
  });
});

describe('FR4: ScopeStep source', () => {
  const source = readSource('../ScopeStep.tsx');

  it('supports an in/out variant', () => {
    expect(source).toMatch(/'in'\s*\|\s*'out'|variant/);
  });

  it('takes its items list as a controlled prop (lifted for the shared rail)', () => {
    // The page owns + hydrates the list (resume scope) so the main column and
    // the separate rail slot share it; ScopeStep is controlled.
    expect(source).toMatch(/items/);
    expect(source).toMatch(/onItemsChange/);
  });

  it('renders removable chips and a free-entry line (Enter adds)', () => {
    expect(source).toMatch(/Enter/);
    expect(source).toContain('SuggestionSurface');
  });

  it('persists through buildScopePatch on submit', () => {
    expect(source).toContain('buildScopePatch');
  });
});

describe('FR5: CategoriesStep source', () => {
  const source = readSource('../CategoriesStep.tsx');

  it('uses useCategories for create / delete (real rows, no staging state)', () => {
    expect(source).toMatch(/useCategories/);
    expect(source).toMatch(/createCategory/);
    expect(source).toMatch(/deleteCategory/);
  });

  it('fetches kind:categories suggestions', () => {
    expect(source).toContain('SuggestionSurface');
    expect(source).toMatch(/categories/);
  });

  it('dedupes before POSTing via isDuplicateCategory', () => {
    expect(source).toContain('isDuplicateCategory');
  });
});

describe('FR4/FR5: OnboardingWizard wires the new steps', () => {
  const source = readSource('../../../pages/OnboardingWizard.tsx');

  it('renders ScopeStep for the scope steps and CategoriesStep for step 4', () => {
    expect(source).toContain('ScopeStep');
    expect(source).toContain('CategoriesStep');
  });

  it('hydrates scope items from the resumed row (resume.data.inScope / outOfScope)', () => {
    expect(source).toMatch(/resume\.data\.inScope|resume\.data\?\.inScope/);
    expect(source).toMatch(/resume\.data\.outOfScope|resume\.data\?\.outOfScope/);
  });

  it('adds no starter-pack trigger (step 4 → 5 is a plain forward PATCH; spec 05 owns the hook)', () => {
    // No starter-pack import / job-queue call wired in this spec.
    expect(source).not.toMatch(/withJob|starterPack|starter-pack['"]/);
  });
});
