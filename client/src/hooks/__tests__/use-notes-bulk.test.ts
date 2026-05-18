/**
 * Spec 04 - useBulkDeleteNotes / useBulkRecategorizeNotes hook tests.
 *
 * File-source assertions matching the existing second-brain test
 * convention (Vitest `node` env, no jsdom, no @tanstack/react-query
 * rendering setup). We assert the SHAPE of the hook implementation:
 * endpoint, method, payload, cache invalidation, optimistic update
 * with rollback.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const hookSource = fs.readFileSync(
  new URL('../useNotes.ts', import.meta.url),
  'utf8',
);

describe('FR10 useBulkDeleteNotes', () => {
  it('exports the hook', () => {
    expect(hookSource).toContain('export function useBulkDeleteNotes(slug: string)');
  });

  it('POSTs to /notes/bulk-delete with { ids }', () => {
    expect(hookSource).toMatch(/apiRequest\('POST', `\/api\/brainlifts\/\$\{slug\}\/notes\/bulk-delete`, \{ ids \}\)/);
  });

  it('returns { mutateAsync, isPending }', () => {
    expect(hookSource).toContain('mutateAsync: (ids: number[])');
    expect(hookSource).toContain('isPending: mutation.isPending');
  });

  it('optimistically removes ids and rolls back on error', () => {
    expect(hookSource).toContain("queryClient.getQueriesData<Note[]>({ queryKey: ['notes', slug] })");
    expect(hookSource).toContain('value.filter((n) => !idSet.has(n.id))');
    expect(hookSource).toContain('queryClient.setQueryData(key, value)');
  });

  it('invalidates the notes cache on success', () => {
    expect(hookSource).toContain('invalidateNotes(slug)');
  });
});

describe('FR10 useBulkRecategorizeNotes', () => {
  it('exports the hook', () => {
    expect(hookSource).toContain('export function useBulkRecategorizeNotes(slug: string)');
  });

  it('POSTs to /notes/bulk-recategorize with { ids, categoryId }', () => {
    expect(hookSource).toMatch(/apiRequest\(\s*'POST',\s*`\/api\/brainlifts\/\$\{slug\}\/notes\/bulk-recategorize`,\s*\{ ids, categoryId \}/);
  });

  it('accepts categoryId: null (allowed for notes — clears category)', () => {
    expect(hookSource).toContain('categoryId: number | null');
  });

  it('optimistically updates the categoryId in cache', () => {
    expect(hookSource).toContain('idSet.has(n.id) ? { ...n, categoryId } : n');
  });

  it('returns { mutateAsync, isPending }', () => {
    expect(hookSource).toContain('mutateAsync: (args: { ids: number[]; categoryId: number | null })');
  });
});
