/**
 * Spec 02 FR2 — useNotesForSource hook source-as-string assertions.
 *
 * Matches the existing convention in this folder (vitest `node` env, no
 * jsdom). We assert the SHAPE of the implementation: endpoint, key shape,
 * gating, autoBookmark cache invalidation surface, reversal of returned
 * data.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const hookSource = fs.readFileSync(
  new URL('../useNotesForSource.ts', import.meta.url),
  'utf8',
);

describe('FR2: useNotesForSource export', () => {
  it('exports the hook', () => {
    expect(hookSource).toMatch(/export\s+function\s+useNotesForSource\s*\(/);
  });
});

describe('FR2: useNotesForSource — query', () => {
  it('uses the shared getNotesQueryKey from useNotes.ts', () => {
    expect(hookSource).toMatch(/import\s*\{[^}]*getNotesQueryKey[^}]*\}\s*from\s*['"]\.\/useNotes['"]/);
    expect(hookSource).toMatch(/getNotesQueryKey\s*\(\s*slug\s*,\s*sourceId/);
  });

  it('gates the query on sourceId being a number (no GET pre-first-save)', () => {
    // enabled flag must reference typeof sourceId === 'number' (or equivalent)
    expect(hookSource).toMatch(/enabled[\s\S]{0,80}typeof\s+sourceId\s*===\s*['"]number['"]/);
  });

  it('returns data reversed (newest first per FEATURE.md decision #13)', () => {
    // Some reverse() of the asc-ordered server payload before returning.
    expect(hookSource).toMatch(/\.slice\(\)\.reverse\(\)|\[\.\.\.[^\]]+\]\.reverse\(\)|reversed/);
  });
});

describe('FR2: useNotesForSource — createNote', () => {
  it('POSTs to /api/brainlifts/:slug/notes/from-reader', () => {
    expect(hookSource).toMatch(/apiRequest\(\s*['"]POST['"]\s*,\s*`\/api\/brainlifts\/\$\{slug\}\/notes\/from-reader`/);
  });

  it('accepts categoryId | categoryName and sourceId | learningStreamItemId in the payload', () => {
    expect(hookSource).toMatch(/content/);
    expect(hookSource).toMatch(/categoryId/);
    expect(hookSource).toMatch(/categoryName/);
    expect(hookSource).toMatch(/learningStreamItemId/);
  });

  it('invalidates sources, learning-stream, and stats caches when autoBookmarked is true', () => {
    // Source must contain conditional invalidation for both keys gated on autoBookmarked.
    expect(hookSource).toMatch(/autoBookmarked/);
    expect(hookSource).toMatch(/invalidateQueries\([^)]*\['sources',\s*slug\]/);
    expect(hookSource).toMatch(/invalidateQueries\([^)]*\['learning-stream',\s*slug\]/);
    expect(hookSource).toMatch(/invalidateQueries\([^)]*\['learning-stream-stats',\s*slug\]/);
  });

  it('always invalidates the notes cache on save success', () => {
    expect(hookSource).toMatch(/invalidateQueries\([^)]*\['notes',\s*slug\]/);
  });
});

describe('FR2: useNotesForSource — update / delete', () => {
  it('PATCHes existing /notes/:id endpoint for updates', () => {
    expect(hookSource).toMatch(/apiRequest\(\s*['"]PATCH['"]\s*,\s*`\/api\/brainlifts\/\$\{slug\}\/notes\/\$\{[^}]+\}`/);
  });

  it('DELETEs via the existing /notes/:id endpoint', () => {
    expect(hookSource).toMatch(/apiRequest\(\s*['"]DELETE['"]\s*,\s*`\/api\/brainlifts\/\$\{slug\}\/notes\/\$\{[^}]+\}`/);
  });
});

describe('FR2: useNotesForSource — return shape', () => {
  it('returns data, isLoading, error, createNote, updateNote, deleteNote, isCreating', () => {
    expect(hookSource).toMatch(/data:/);
    expect(hookSource).toMatch(/isLoading/);
    expect(hookSource).toMatch(/error/);
    expect(hookSource).toMatch(/createNote/);
    expect(hookSource).toMatch(/updateNote/);
    expect(hookSource).toMatch(/deleteNote/);
    expect(hookSource).toMatch(/isCreating/);
  });
});
