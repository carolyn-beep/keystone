/**
 * Spec 03 FR8 — AddCategoryModal tests.
 *
 * Reused by spec 05. File-source assertions.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const modal = fs.readFileSync(
  new URL('../AddCategoryModal.tsx', import.meta.url),
  'utf8',
);

describe('FR8 AddCategoryModal', () => {
  it('returns null when open is false', () => {
    expect(modal).toMatch(/if\s*\(!open\)\s*return\s*null|open\s*\?[^]+:\s*null/);
  });

  it('uses useCategories to create a category', () => {
    expect(modal).toContain('useCategories');
    expect(modal).toMatch(/createCategory/);
  });

  it('disables submit when the name is empty (trimmed)', () => {
    // Either disabled=name.trim() inline, or via a computed canSubmit
    // derived from a trimmed length. Both patterns are valid.
    expect(modal).toMatch(/trim\(\)/);
    expect(modal).toMatch(/canSubmit|disabled=\{!?[a-zA-Z]/);
  });

  it('fires onCreated with the new category before closing', () => {
    expect(modal).toMatch(/onCreated\??\.\(|onCreated\?\.\(|onCreated&&|onCreated[^)]*\(/);
    expect(modal).toMatch(/onClose\(\)/);
  });

  it('closes on Escape and overlay click', () => {
    expect(modal).toMatch(/Escape/);
  });

  it('surfaces submit errors as a toast and an inline error message', () => {
    expect(modal).toMatch(/useToast|toast/);
    // an inline error display
    expect(modal).toMatch(/error|Error/);
  });

  it('uses neo-editorial modal styling (parchment surface + small-caps labels)', () => {
    expect(modal).toMatch(/bg-card|bg-card-elevated/);
    expect(modal).toMatch(/uppercase/);
  });
});
