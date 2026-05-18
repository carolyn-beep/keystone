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

  it('renders placeholder bodies via the legacy panels per spec Decision 7', () => {
    expect(tabSource).toContain('SourcesPanel');
    expect(tabSource).toContain('NotesPanel');
    expect(tabSource).toContain('CategoriesManager');
  });

  it('routes the active sub-tab to its placeholder body', () => {
    expect(tabSource).toMatch(/activeSubTab === 'research-materials'/);
    expect(tabSource).toMatch(/activeSubTab === 'notes'/);
    // categories is the fall-through branch
    expect(tabSource).toContain('CategoriesManager');
  });
});
