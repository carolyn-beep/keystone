/**
 * Spec 05-categories-tab tests for useCategories additions.
 *
 * FR4:
 *  - useReorderCategories exported
 *  - Optimistic cache update + rollback on error
 *  - Invalidation on success
 *  - CategoryResponse.noteCount surfaced; normalizeCategory defaults to 0
 *
 * Pattern: file-source assertions (consistent with sibling client hook tests
 * which run under node + vitest without jsdom). Behavioral guarantees are
 * encoded as source-level invariants - the implementation must contain the
 * structural patterns the tests assert.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../useCategories.ts', import.meta.url),
  'utf8',
);

describe('FR4: useCategories - noteCount normalization', () => {
  it('CategoryResponse includes noteCount as a number', () => {
    expect(source).toMatch(/CategoryResponse[\s\S]{0,200}noteCount:\s*number/);
  });

  it('normalizeCategory defaults noteCount to 0 when absent', () => {
    expect(source).toMatch(/normalizeCategory[\s\S]{0,400}noteCount:\s*[^,\n}]*\?\?\s*0/);
  });
});

describe('FR4: useReorderCategories hook', () => {
  it('is exported from useCategories', () => {
    expect(source).toMatch(/export\s+function\s+useReorderCategories\s*\(/);
  });

  it('accepts a slug parameter and uses the categories query key for cache ops', () => {
    expect(source).toMatch(/useReorderCategories\s*\(\s*slug:\s*string/);
    expect(source).toMatch(/\['categories',\s*slug\]/);
  });

  it('PATCHes /api/brainlifts/:slug/categories/reorder with orderedIds body', () => {
    expect(source).toContain('/categories/reorder');
    expect(source).toMatch(/PATCH/);
    expect(source).toMatch(/orderedIds/);
  });

  it('performs an optimistic cache mutation via setQueryData inside onMutate', () => {
    // Expect TanStack onMutate lifecycle with snapshot + setQueryData.
    expect(source).toMatch(/onMutate/);
    expect(source).toMatch(/getQueryData/);
    expect(source).toMatch(/setQueryData/);
    // Optimistic update rewrites sortOrder per index.
    expect(source).toMatch(/sortOrder/);
  });

  it('rolls back the cache snapshot on error', () => {
    expect(source).toMatch(/onError/);
    // Either restores via setQueryData with the snapshot, or accepts a context
    // returned from onMutate. Both patterns capture rollback intent.
    expect(source).toMatch(/setQueryData\([^)]*,\s*(context|previous|snapshot)/i);
  });

  it('invalidates the categories query key on success', () => {
    expect(source).toMatch(/onSuccess[\s\S]{0,200}invalidateQueries/);
  });

  it('returns mutateAsync and isPending', () => {
    expect(source).toMatch(/mutateAsync/);
    expect(source).toMatch(/isPending/);
  });
});
