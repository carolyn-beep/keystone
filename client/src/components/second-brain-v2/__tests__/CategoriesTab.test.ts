/**
 * Spec 05-categories-tab - FR5 + FR7 tests for the CategoriesTab orchestrator.
 *
 * File-source assertions (same pattern as the spec 02 second-brain-tab.test.ts).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const tabSource = fs.readFileSync(
  new URL('../CategoriesTab.tsx', import.meta.url),
  'utf8',
);

const shellSource = fs.readFileSync(
  new URL('../../SecondBrainTab.tsx', import.meta.url),
  'utf8',
);

const typesSource = fs.readFileSync(
  new URL('../../../types/second-brain.ts', import.meta.url),
  'utf8',
);

describe('FR5 CategoriesTab - props and imports', () => {
  it('exports a function component named CategoriesTab with { slug } props', () => {
    expect(tabSource).toMatch(/export\s+(default\s+)?function\s+CategoriesTab\b/);
    expect(tabSource).toMatch(/interface\s+CategoriesTabProps\s*\{[^}]*slug:\s*string/);
  });

  it('imports useCategories and useReorderCategories from the hook', () => {
    expect(tabSource).toMatch(/from\s+['"]@\/hooks\/useCategories['"]/);
    expect(tabSource).toMatch(/useCategories/);
    expect(tabSource).toMatch(/useReorderCategories/);
  });

  it('composes FilterBar slots from the v2 shared primitives', () => {
    expect(tabSource).toMatch(/FilterBar/);
    // Search + Sort + Trailing slots used.
    expect(tabSource).toMatch(/<FilterBar\.Search/);
    expect(tabSource).toMatch(/<FilterBar\.Sort/);
    expect(tabSource).toMatch(/<FilterBar\.Trailing/);
  });

  it('references CategoryRow for per-row rendering', () => {
    expect(tabSource).toMatch(/CategoryRow/);
    expect(tabSource).toMatch(/from\s+['"]\.\/CategoryRow['"]/);
  });

  it('references AddCategoryModal from the spec 03 modals path OR an inline placeholder', () => {
    // Either the canonical import path is present, OR a fallback in-file modal
    // (named *Modal) is defined. Both keep the tab functional at merge time.
    const usesSpec03Path = /AddCategoryModal[\s\S]{0,200}from\s+['"][^'"]*\/modals\/AddCategoryModal['"]/.test(tabSource);
    const usesInlineFallback = /function\s+\w*AddCategoryModal\w*\s*\(/.test(tabSource)
      || /const\s+\w*AddCategoryModal\w*\s*=/.test(tabSource);
    expect(usesSpec03Path || usesInlineFallback).toBe(true);
  });
});

describe('FR5 CategoriesTab - sort modes', () => {
  it('declares all three sort options with the exact ids from spec', () => {
    expect(tabSource).toMatch(/['"]manual['"]/);
    expect(tabSource).toMatch(/['"]alphabetical['"]/);
    expect(tabSource).toMatch(/['"]most-sources['"]/);
  });

  it('uses sourceCount descending for the "most-sources" sort', () => {
    // The sort helper must reference sourceCount in the most-sources branch.
    expect(tabSource).toMatch(/most-sources[\s\S]{0,400}sourceCount/);
  });

  it('uses localeCompare for the alphabetical sort', () => {
    expect(tabSource).toMatch(/alphabetical[\s\S]{0,300}localeCompare/);
  });

  it('uses sortOrder for the manual sort', () => {
    expect(tabSource).toMatch(/manual[\s\S]{0,400}sortOrder/);
  });
});

describe('FR5 CategoriesTab - empty states', () => {
  it('renders the no-categories-at-all copy verbatim', () => {
    expect(tabSource).toContain('No categories yet. Add one to organize your research.');
  });

  it('renders the search-returns-zero copy verbatim', () => {
    expect(tabSource).toContain('No categories match.');
  });
});

describe('FR5 CategoriesTab - edit + reorder coordination', () => {
  it('clears editingId when sortBy changes', () => {
    // The sortBy setter call site must reset editingId near the same statement.
    expect(tabSource).toMatch(/setEditingId\(null\)/);
    expect(tabSource).toMatch(/setSortBy/);
    // Look for a function or handler that calls both setSortBy and setEditingId(null).
    const hasCombinedHandler = /(setSortBy[\s\S]{0,200}setEditingId\(null\))|(setEditingId\(null\)[\s\S]{0,200}setSortBy)/.test(tabSource);
    expect(hasCombinedHandler).toBe(true);
  });

  it('gates move-up/move-down callbacks on manual sort mode', () => {
    // The row props that pass onMoveUp/onMoveDown should be conditional on sortBy === 'manual'.
    expect(tabSource).toMatch(/onMoveUp/);
    expect(tabSource).toMatch(/onMoveDown/);
    expect(tabSource).toMatch(/sortBy\s*===\s*['"]manual['"]/);
  });

  it('wires reorder to useReorderCategories.mutateAsync', () => {
    expect(tabSource).toMatch(/mutateAsync/);
  });
});

describe('FR7 - type extension and shell wiring', () => {
  it('extends Category with optional noteCount', () => {
    expect(typesSource).toMatch(/interface\s+Category\b[\s\S]{0,400}noteCount\?:\s*number/);
  });

  it('SecondBrainTab now renders CategoriesTab (v2) in the categories branch', () => {
    expect(shellSource).toContain('CategoriesTab');
    expect(shellSource).toMatch(/from\s+['"]@?\/?components?\/?second-brain-v2\/CategoriesTab['"]|from\s+['"]\.\/second-brain-v2\/CategoriesTab['"]/);
    // No reference to the v1 CategoriesManager anymore.
    expect(shellSource).not.toMatch(/CategoriesManager/);
  });
});
