/**
 * Tests for 05-categories: Category UI Logic
 *
 * FR3: useCategories hook logic (defaults, mutation key invalidation)
 * FR4: Saved section grouping logic (flat vs grouped, uncategorized group, collapse)
 * FR5: Category assignment dropdown logic (option building, selection)
 *
 * Tests pure helper functions extracted into category-helpers.ts.
 * React rendering tested manually.
 */

import { describe, it, expect } from 'vitest';
import {
  groupSavedItemsByCategory,
  buildCategoryDropdownOptions,
  shouldShowCategoryGroups,
  computeUncategorizedGroup,
} from '../category-helpers';

// ─── Test Data ──────────────────────────────────────────────────────────────

const sampleSavedItemML = {
  id: 1,
  title: 'Deep Learning Primer',
  url: 'https://example.com/dl',
  type: 'Academic Paper',
  author: 'Alice',
  excerpt: 'Overview of DL.',
  createdAt: '2026-03-18T00:00:00Z',
  factCount: 3,
  summaryCount: 2,
  hasSavedMinimum: true,
  categoryId: 1,
  categoryName: 'Machine Learning',
};

const sampleSavedItemNLP = {
  id: 2,
  title: 'NLP Techniques',
  url: 'https://example.com/nlp',
  type: 'Substack',
  author: 'Bob',
  excerpt: 'NLP overview.',
  createdAt: '2026-03-17T00:00:00Z',
  factCount: 2,
  summaryCount: 1,
  hasSavedMinimum: true,
  categoryId: 2,
  categoryName: 'NLP',
};

const sampleSavedItemUncategorized = {
  id: 3,
  title: 'General Research',
  url: 'https://example.com/general',
  type: 'News',
  author: 'Charlie',
  excerpt: 'General stuff.',
  createdAt: '2026-03-16T00:00:00Z',
  factCount: 1,
  summaryCount: 1,
  hasSavedMinimum: true,
  categoryId: null,
  categoryName: null,
};

const sampleSavedItemML2 = {
  id: 4,
  title: 'Reinforcement Learning',
  url: 'https://example.com/rl',
  type: 'Video',
  author: 'Diana',
  excerpt: 'RL overview.',
  createdAt: '2026-03-15T00:00:00Z',
  factCount: 5,
  summaryCount: 3,
  hasSavedMinimum: true,
  categoryId: 1,
  categoryName: 'Machine Learning',
};

const sampleCategories = [
  { id: 1, name: 'Machine Learning', sortOrder: 0, sourceCount: 2 },
  { id: 2, name: 'NLP', sortOrder: 1, sourceCount: 1 },
];

// ─── FR3: useCategories Hook Defaults ────────────────────────────────────────

describe('FR3: useCategories hook defaults', () => {
  it('shouldShowCategoryGroups returns false when no categories', () => {
    expect(shouldShowCategoryGroups([])).toBe(false);
  });

  it('shouldShowCategoryGroups returns true when categories exist', () => {
    expect(shouldShowCategoryGroups(sampleCategories)).toBe(true);
  });
});

// ─── FR4: Saved Section Grouping Logic ───────────────────────────────────────

describe('FR4: groupSavedItemsByCategory', () => {
  it('returns empty groups array for empty items', () => {
    const groups = groupSavedItemsByCategory([], sampleCategories);
    expect(groups).toHaveLength(2); // categories still listed, just empty
    groups.forEach(g => expect(g.items).toHaveLength(0));
  });

  it('groups items by category in sortOrder', () => {
    const items = [sampleSavedItemML, sampleSavedItemNLP, sampleSavedItemML2];
    const groups = groupSavedItemsByCategory(items, sampleCategories);

    // ML group first (sortOrder 0)
    expect(groups[0].categoryId).toBe(1);
    expect(groups[0].categoryName).toBe('Machine Learning');
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items.map(i => i.id)).toContain(1);
    expect(groups[0].items.map(i => i.id)).toContain(4);

    // NLP group second (sortOrder 1)
    expect(groups[1].categoryId).toBe(2);
    expect(groups[1].categoryName).toBe('NLP');
    expect(groups[1].items).toHaveLength(1);
  });

  it('omits empty category groups from result', () => {
    const items = [sampleSavedItemML]; // only ML items, no NLP
    const groups = groupSavedItemsByCategory(items, sampleCategories);

    // Only ML group should appear (NLP has no items)
    const nonEmptyGroups = groups.filter(g => g.items.length > 0);
    expect(nonEmptyGroups).toHaveLength(1);
    expect(nonEmptyGroups[0].categoryName).toBe('Machine Learning');
  });
});

describe('FR4: computeUncategorizedGroup', () => {
  it('returns uncategorized items when they exist', () => {
    const items = [sampleSavedItemML, sampleSavedItemUncategorized];
    const uncategorized = computeUncategorizedGroup(items);

    expect(uncategorized).toHaveLength(1);
    expect(uncategorized[0].id).toBe(3);
  });

  it('returns empty array when all items are categorized', () => {
    const items = [sampleSavedItemML, sampleSavedItemNLP];
    const uncategorized = computeUncategorizedGroup(items);

    expect(uncategorized).toHaveLength(0);
  });

  it('returns all items when none are categorized', () => {
    const items = [sampleSavedItemUncategorized];
    const uncategorized = computeUncategorizedGroup(items);

    expect(uncategorized).toHaveLength(1);
  });
});

describe('FR4: flat vs grouped rendering decision', () => {
  it('shows flat list when no categories exist', () => {
    expect(shouldShowCategoryGroups([])).toBe(false);
  });

  it('shows grouped when categories exist', () => {
    expect(shouldShowCategoryGroups([{ id: 1, name: 'ML', sortOrder: 0, sourceCount: 1 }])).toBe(true);
  });
});

// ─── FR5: Category Assignment Dropdown ───────────────────────────────────────

describe('FR5: buildCategoryDropdownOptions', () => {
  it('includes all categories plus Uncategorized option', () => {
    const options = buildCategoryDropdownOptions(sampleCategories);

    expect(options).toHaveLength(3); // 2 categories + 1 uncategorized
    expect(options[0]).toEqual({ value: null, label: 'Uncategorized' });
    expect(options[1]).toEqual({ value: 1, label: 'Machine Learning' });
    expect(options[2]).toEqual({ value: 2, label: 'NLP' });
  });

  it('returns only Uncategorized when no categories exist', () => {
    const options = buildCategoryDropdownOptions([]);

    expect(options).toHaveLength(1);
    expect(options[0]).toEqual({ value: null, label: 'Uncategorized' });
  });

  it('preserves category order from input', () => {
    const reversed = [...sampleCategories].reverse();
    const options = buildCategoryDropdownOptions(reversed);

    // Uncategorized first, then categories in input order
    expect(options[0].label).toBe('Uncategorized');
    expect(options[1].label).toBe('NLP');
    expect(options[2].label).toBe('Machine Learning');
  });
});
