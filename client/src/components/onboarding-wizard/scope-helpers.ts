/**
 * Pure helpers for the scope (steps 2-3) and categories (step 4) wizard steps
 * (04-suggestion-steps FR4/FR5). Framework-free so they unit-test in the
 * node vitest env without JSX.
 */

import type { OnboardingPatchInput } from '@shared/routes';

export type ScopeVariant = 'in' | 'out';

/**
 * Build the PATCH body for a scope step submit. The scope array always
 * persists (zero items is legal). `step` is included ONLY when the move is
 * forward past the high-water mark — a same-step or backward-revisit edit
 * persists scope without a step write (mirrors the spec 03 forward-only rule).
 */
export function buildScopePatch(args: {
  variant: ScopeVariant;
  items: string[];
  target: number;
  highWater: number;
}): OnboardingPatchInput {
  const patch: OnboardingPatchInput =
    args.variant === 'in' ? { inScope: args.items } : { outOfScope: args.items };
  if (args.target > args.highWater) {
    patch.step = args.target;
  }
  return patch;
}

/**
 * Add a trimmed item to a scope list. Empty / whitespace-only entries are
 * ignored; case-insensitive duplicates are dropped (suggestion accept and
 * manual entry land in one deduped list).
 */
export function addScopeItem(items: string[], raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return items;
  const exists = items.some((i) => i.toLowerCase() === trimmed.toLowerCase());
  if (exists) return items;
  return [...items, trimmed];
}

/** Remove an item from a scope list by exact value. */
export function removeScopeItem(items: string[], value: string): string[] {
  return items.filter((i) => i !== value);
}

/**
 * Whether `name` (trimmed, case-insensitive) already exists among the given
 * categories. Used to make a duplicate accept a no-op before POSTing.
 */
export function isDuplicateCategory(existing: { name: string }[], name: string): boolean {
  const key = name.trim().toLowerCase();
  return existing.some((c) => c.name.trim().toLowerCase() === key);
}
