/**
 * Pure helper functions for category management in the Knowledge Tree.
 *
 * Extracted from components for testability. These functions have no
 * React dependencies -- they compute view state from API data.
 */

import type { SavedItemView } from '@/hooks/useKnowledgeTree';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CategoryResponse {
  id: number;
  name: string;
  sortOrder: number | null;
  sourceCount: number;
}

export interface CategoryGroup {
  categoryId: number;
  categoryName: string;
  items: SavedItemView[];
}

export interface CategoryDropdownOption {
  value: number | null;
  label: string;
}

// ─── Grouping Logic ─────────────────────────────────────────────────────────

/**
 * Determine whether the saved section should render as category groups.
 * Returns true only when at least one category exists.
 */
export function shouldShowCategoryGroups(categories: CategoryResponse[]): boolean {
  return categories.length > 0;
}

/**
 * Group saved items by their category, ordered by category sortOrder.
 * Returns a group per category (including empty groups for categories with no saved items).
 * Uncategorized items are NOT included here -- use computeUncategorizedGroup.
 */
export function groupSavedItemsByCategory(
  items: SavedItemView[],
  categories: CategoryResponse[]
): CategoryGroup[] {
  // Build a map of categoryId -> items
  const itemsByCategory = new Map<number, SavedItemView[]>();
  for (const cat of categories) {
    itemsByCategory.set(cat.id, []);
  }

  for (const item of items) {
    if (item.categoryId !== null && itemsByCategory.has(item.categoryId)) {
      itemsByCategory.get(item.categoryId)!.push(item);
    }
  }

  return categories.map(cat => ({
    categoryId: cat.id,
    categoryName: cat.name,
    items: itemsByCategory.get(cat.id) ?? [],
  }));
}

/**
 * Extract items with no category assignment (categoryId === null).
 */
export function computeUncategorizedGroup(items: SavedItemView[]): SavedItemView[] {
  return items.filter(item => item.categoryId === null);
}

// ─── Dropdown Logic ─────────────────────────────────────────────────────────

/**
 * Build dropdown options for category assignment.
 * Always includes "Uncategorized" (value: null) as the first option,
 * followed by categories in the order provided.
 */
export function buildCategoryDropdownOptions(
  categories: CategoryResponse[]
): CategoryDropdownOption[] {
  return [
    { value: null, label: 'Uncategorized' },
    ...categories.map(cat => ({ value: cat.id, label: cat.name })),
  ];
}
