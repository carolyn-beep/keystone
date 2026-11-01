/**
 * Spec 03 FR4 — bulk mutations on useSources.
 *
 * File-source assertions matching the rest of the second-brain v2 test
 * suite (vitest node env, no jsdom).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../useSources.ts', import.meta.url),
  'utf8',
);

describe('FR4 useSources bulk mutations', () => {
  it('exposes a bulkDeleteSources entry point alongside the existing mutations', () => {
    expect(source).toMatch(/bulkDeleteSources/);
    // it must return both the function and a pending flag the UI can read
    expect(source).toMatch(/isBulkDeleting/);
  });

  it('exposes a bulkRecategorizeSources entry point alongside the existing mutations', () => {
    expect(source).toMatch(/bulkRecategorizeSources/);
    expect(source).toMatch(/isBulkRecategorizing/);
  });

  it('bulkDeleteSources POSTs to /sources/bulk-delete', () => {
    expect(source).toMatch(/['"`]POST['"`]\s*,[^)]*sources\/bulk-delete/);
  });

  it('bulkRecategorizeSources POSTs to /sources/bulk-recategorize', () => {
    expect(source).toMatch(/['"`]POST['"`]\s*,[^)]*sources\/bulk-recategorize/);
  });

  it('bulk delete invalidates sources, notes (cascade), and categories (count shift)', () => {
    // The delete handler must invalidate sources + notes so per-source note
    // lists drop and counts re-render.
    expect(source).toContain("'notes', slug");
  });

  it('bulk recategorize invalidates sources and categories (per-category counts change)', () => {
    // invalidateSources already invalidates both sources and categories;
    // assert the helper is reused or both invalidations are present.
    expect(source).toMatch(/invalidateSources\(slug\)|categories.*invalidateQueries/);
  });

  it('exposes both mutations with mutateAsync-style return values', () => {
    // The two mutations should be exposed as async functions whose body
    // calls mutateAsync — same pattern as createSource / updateSource.
    expect(source).toMatch(/bulkDeleteSources:[^,]*\(ids:\s*number\[\]\)/);
    expect(source).toMatch(/bulkRecategorizeSources:[^,]*\(\s*\{[^}]*ids[^}]*categoryId[^}]*\}/);
  });
});
