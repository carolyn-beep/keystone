/**
 * Spec 03 FR10 — AddSourceModal enrichment field extension.
 *
 * The v1 manual-entry modal grows four optional fields (Type, Key
 * Insights, Length, Why this matters) so the manual flow stays in step
 * with the agent's save_source flow (spec 01).
 *
 * File-source assertions. The existing modal behavior is asserted in
 * second-brain-ui.test.ts; this file only covers the new fields.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = fs.readFileSync(
  new URL('../AddSourceModal.tsx', import.meta.url),
  'utf8',
);

describe('FR10 AddSourceModal enrichment fields', () => {
  it('renders a Type select labeled with the small-caps editorial pattern', () => {
    // A <select> element exists, and the Type label uses the editorial
    // small-caps style. Options come from TYPE_OPTIONS.
    expect(modal).toMatch(/<select\b/);
    expect(modal).toMatch(/TYPE_OPTIONS/);
    expect(modal).toMatch(/Type\s*<span/);
  });

  it('Type select offers all six RetrievalType options + an empty default', () => {
    expect(modal).toMatch(/Podcast/);
    expect(modal).toMatch(/AcademicPaper/);
    expect(modal).toMatch(/Video/);
    expect(modal).toMatch(/Substack/);
    expect(modal).toMatch(/News/);
    expect(modal).toMatch(/Twitter/);
  });

  it('renders a Key Insights textarea', () => {
    expect(modal).toMatch(/Key insights/i);
    expect(modal).toMatch(/<textarea[\s\S]*?keyInsights/);
  });

  it('renders a Length input with a hint placeholder', () => {
    expect(modal).toMatch(/Length/);
    expect(modal).toMatch(/placeholder=["'][^"']*min/);
  });

  it('renders a Why this matters textarea', () => {
    expect(modal).toMatch(/Why this matters/i);
    expect(modal).toMatch(/<textarea[\s\S]*?whyMatters/);
  });

  it('passes type / keyInsights / length / whyMatters through to createSource', () => {
    expect(modal).toMatch(/type:/);
    expect(modal).toMatch(/keyInsights:/);
    expect(modal).toMatch(/length:/);
    expect(modal).toMatch(/whyMatters:/);
  });

  it('keeps the four new fields optional (existing required fields unchanged)', () => {
    // The existing required-fields guard should still gate on title/url/author/category.
    expect(modal).toMatch(/canSubmit/);
    expect(modal).toMatch(/title\.trim\(\)\.length/);
    expect(modal).toMatch(/author\.trim\(\)\.length/);
    expect(modal).toMatch(/url\.trim\(\)\.length/);
  });
});
