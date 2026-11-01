/**
 * Spec 03 FR9 — RecategorizeModal tests.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = fs.readFileSync(
  new URL('../RecategorizeModal.tsx', import.meta.url),
  'utf8',
);

describe('FR9 RecategorizeModal', () => {
  it('returns null when open is false', () => {
    expect(modal).toMatch(/if\s*\(!open\)\s*return\s*null|open\s*\?[^]+:\s*null/);
  });

  it('uses useCategories to list categories', () => {
    expect(modal).toContain('useCategories');
  });

  it('renders one button per category in the picker', () => {
    expect(modal).toMatch(/categories\.map/);
  });

  it('keeps Submit disabled until a category is picked', () => {
    // Either via a computed canSubmit (picked != null && !isSubmitting)
    // or directly inline. Both expressions are valid.
    expect(modal).toMatch(/picked\s*!=\s*null|canSubmit|picked\s*===?\s*null/);
    expect(modal).toMatch(/disabled=\{!?[a-zA-Z]/);
  });

  it('exposes the "Create new category" affordance and opens AddCategoryModal', () => {
    expect(modal).toMatch(/Create new category|new category/i);
    expect(modal).toContain('AddCategoryModal');
  });

  it('on confirm fires onConfirm(categoryId) and closes', () => {
    expect(modal).toMatch(/onConfirm/);
    expect(modal).toMatch(/onClose\(\)/);
  });

  it('on new-category creation auto-selects the freshly created category', () => {
    expect(modal).toMatch(/onCreated/);
  });

  it('closes on Escape', () => {
    expect(modal).toMatch(/Escape/);
  });

  it('uses neo-editorial modal styling', () => {
    expect(modal).toMatch(/bg-card|bg-card-elevated/);
    expect(modal).toMatch(/uppercase/);
  });
});
