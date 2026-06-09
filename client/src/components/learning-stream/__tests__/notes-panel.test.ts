/**
 * Spec 02 FR4 — NotesPanel source-as-string assertions.
 *
 * The host that wires the composer + list + toast together. We assert
 * the hook composition, smart-default resolver shape, conditional toast
 * mount, and composer ref forwarding.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../NotesPanel.tsx', import.meta.url),
  'utf8',
);

describe('FR4: NotesPanel export + props', () => {
  it('exports the component', () => {
    expect(componentSource).toMatch(/export\s+function\s+NotesPanel\s*\(/);
  });

  it('accepts slug, item, source, composerRef props', () => {
    expect(componentSource).toMatch(/slug/);
    expect(componentSource).toMatch(/item/);
    expect(componentSource).toMatch(/source/);
    expect(componentSource).toMatch(/composerRef/);
  });
});

describe('FR4: NotesPanel composes the data hooks', () => {
  it('reads notes via useNotesForSource', () => {
    expect(componentSource).toMatch(/useNotesForSource/);
  });

  it('reads categories via useCategories', () => {
    expect(componentSource).toMatch(/useCategories/);
  });

  it('does not smart-default new sources from recent category history', () => {
    expect(componentSource).not.toMatch(/useRecentCategory/);
    expect(componentSource).not.toMatch(/recentCategoryId/);
  });
});

describe('FR4: NotesPanel smart-default category', () => {
  it('only uses source.categoryId as the default category', () => {
    expect(componentSource).toMatch(/source\?\.categoryId|source\.categoryId/);
    expect(componentSource).toMatch(/useMemo/);
  });
});

describe('FR4: NotesPanel auto-bookmark toast', () => {
  it('renders AutoBookmarkToast conditionally on lastAutoBookmark state', () => {
    expect(componentSource).toMatch(/AutoBookmarkToast/);
    expect(componentSource).toMatch(/lastAutoBookmark/);
  });

  it('reads autoBookmarked from the onSaved response', () => {
    expect(componentSource).toMatch(/autoBookmarked/);
  });
});

describe('FR4: NotesPanel empty state', () => {
  it('renders the source-specific empty-state copy', () => {
    expect(componentSource).toMatch(/No notes for this source yet/);
  });
});

describe('Polish: NotesPanel category behavior', () => {
  it('tracks the composer category without filtering the source notes list by categoryId', () => {
    expect(componentSource).toMatch(/composerCategory/);
    expect(componentSource).not.toMatch(/visibleNotes/);
    expect(componentSource).not.toMatch(/note\.categoryId\s*===\s*composerCategory\.categoryId/);
  });

  it('passes controlled category state into NoteComposer', () => {
    expect(componentSource).toMatch(/categoryValue=\{composerCategory\}/);
    expect(componentSource).toMatch(/onCategoryValueChange=/);
  });

  it('locks the composer category when the source already has a category', () => {
    expect(componentSource).toMatch(/hasLockedSourceCategory/);
    expect(componentSource).toMatch(/categoryReadOnly=\{hasLockedSourceCategory\}/);
    expect(componentSource).toMatch(/source\.categoryId/);
  });
});

describe('FR4: NotesPanel composer wiring', () => {
  it('forwards composerRef to <NoteComposer ref={composerRef}>', () => {
    expect(componentSource).toMatch(/<NoteComposer[\s\S]*ref=\{composerRef\}/);
  });
});
