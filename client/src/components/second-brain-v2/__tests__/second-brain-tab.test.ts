/**
 * Spec 02 - FR1: Tests for the rewritten SecondBrainTab shell.
 *
 * File-source assertions matching the rest of the second-brain test
 * suite (Vitest `node` env, no jsdom).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const tabSource = fs.readFileSync(
  new URL('../../SecondBrainTab.tsx', import.meta.url),
  'utf8',
);

describe('FR1 SecondBrainTab shell', () => {
  it('keeps the default export and the same props contract', () => {
    expect(tabSource).toContain('export default function SecondBrainTab');
    expect(tabSource).toMatch(/\{ slug, brainlift[^}]*\}/);
    expect(tabSource).toContain('SecondBrainTabProps');
  });

  it('renders the editorial header verbatim', () => {
    expect(tabSource).toContain('Second Brain');
    expect(tabSource).toContain('central library');
    expect(tabSource).toContain('font-serif text-[16px] italic');
  });

  it('declares the three sub-tabs with stable ids', () => {
    expect(tabSource).toContain("'research-materials'");
    expect(tabSource).toContain("'notes'");
    expect(tabSource).toContain("'categories'");
  });

  it('reads ?sb= from useSearch with default fallback', () => {
    expect(tabSource).toContain("from 'wouter'");
    expect(tabSource).toContain('useSearch');
    expect(tabSource).toContain("'research-materials'");
    expect(tabSource).toContain('VALID_SUB_TABS');
  });

  it('returns the default sub-tab when ?sb= is missing or invalid', () => {
    expect(tabSource).toMatch(/parseSubTab\(searchString: string\): SubTab/);
    expect(tabSource).toMatch(/return 'research-materials'/);
  });

  it('writes ?sb= via replaceState and dispatches popstate (matches Dashboard pattern)', () => {
    expect(tabSource).toContain('window.history.replaceState');
    expect(tabSource).toContain("params.set('sb', next)");
    expect(tabSource).toContain('new PopStateEvent');
  });

  it('renders the SubTabStrip primitive with the three sub-tabs', () => {
    expect(tabSource).toContain('SubTabStrip');
    expect(tabSource).toContain('tabs={SUB_TABS}');
    expect(tabSource).toContain('active={activeSubTab}');
    expect(tabSource).toContain('onChange={setActiveSubTab}');
  });

  it('renders the v2 components for all three sub-tab bodies (specs 03/04/05)', () => {
    expect(tabSource).toMatch(/import\s*\{[^}]*ResearchMaterialsTab[^}]*\}\s*from\s*['"][^'"]*second-brain-v2/);
    expect(tabSource).toMatch(/import\s*\{[^}]*NotesTab[^}]*\}\s*from\s*['"][^'"]*second-brain-v2/);
    expect(tabSource).toMatch(/import\s*\{[^}]*CategoriesTab[^}]*\}\s*from\s*['"][^'"]*second-brain-v2/);
    expect(tabSource).toMatch(/<ResearchMaterialsTab\b/);
    expect(tabSource).toMatch(/<NotesTab\b/);
    expect(tabSource).toMatch(/<CategoriesTab\b/);
    // Legacy v1 panels are no longer mounted by the shell
    expect(tabSource).not.toMatch(/<SourcesPanel\b/);
    expect(tabSource).not.toMatch(/<NotesPanel\b/);
    expect(tabSource).not.toMatch(/<CategoriesManager\b/);
  });

  it('routes the active sub-tab to its body', () => {
    expect(tabSource).toMatch(/activeSubTab === 'research-materials'/);
    expect(tabSource).toMatch(/activeSubTab === 'notes'/);
    // categories is the fall-through branch, now rendering the v2 CategoriesTab.
    expect(tabSource).toContain('CategoriesTab');
  });
});
