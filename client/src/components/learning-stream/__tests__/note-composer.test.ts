/**
 * Spec 02 FR4 — NoteComposer source-as-string assertions.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../NoteComposer.tsx', import.meta.url),
  'utf8',
);

describe('FR4: NoteComposer is a forward-ref component', () => {
  it('uses React.forwardRef', () => {
    expect(componentSource).toMatch(/forwardRef\s*</);
  });

  it('exposes NoteComposerHandle with prefill and focus', () => {
    expect(componentSource).toMatch(/NoteComposerHandle/);
    expect(componentSource).toMatch(/prefill/);
    expect(componentSource).toMatch(/focus/);
  });
});

describe('FR4: NoteComposer mutation surface', () => {
  it('calls useNotesForSource for the create mutation (no direct apiRequest)', () => {
    expect(componentSource).toMatch(/useNotesForSource/);
    expect(componentSource).not.toMatch(/apiRequest\(/);
  });

  it('does not persist a recent category default for new reader items', () => {
    expect(componentSource).not.toMatch(/useRecentCategory/);
    expect(componentSource).not.toMatch(/setRecentCategoryId/);
  });
});

describe('FR4: NoteComposer save / keyboard', () => {
  it('handles Cmd+Enter / Ctrl+Enter to save', () => {
    // Look for metaKey/ctrlKey + Enter combination.
    expect(componentSource).toMatch(/metaKey|ctrlKey/);
    expect(componentSource).toMatch(/Enter/);
  });

  it('validates on save when content trimmed empty OR chip unset OR chip new+empty', () => {
    // The click / keyboard path should reference trim(), the chip value union
    // (kind === 'existing' or kind === 'new' with non-empty name), and local
    // validation error state.
    expect(componentSource).toMatch(/\.trim\(\)/);
    expect(componentSource).toMatch(/kind\s*===\s*['"]existing['"]/);
    expect(componentSource).toMatch(/kind\s*===\s*['"]new['"]/);
    expect(componentSource).toMatch(/setContentError/);
    expect(componentSource).toMatch(/setCategoryError/);
  });

  it('skips chip validation when the category pill is read-only', () => {
    expect(componentSource).toMatch(/categoryReadOnly/);
    expect(componentSource).toMatch(/categoryReadOnly\s*\|\|/);
    expect(componentSource).toMatch(/setCategoryError\(categoryReadOnly \? false : !hasCategory\)/);
    expect(componentSource).toMatch(/readOnly=\{categoryReadOnly\}/);
  });

  it('keeps the Save button clickable for validation feedback', () => {
    expect(componentSource).toMatch(/onClick=\{\(\)\s*=>\s*void handleSave\(\)\}/);
    expect(componentSource).not.toMatch(/disabled=\{isSaveDisabled\}/);
  });

  it('auto-expands the textarea without showing an internal scrollbar', () => {
    expect(componentSource).toMatch(/scrollHeight/);
    expect(componentSource).toMatch(/style\.height\s*=\s*['"]auto['"]/);
    expect(componentSource).toMatch(/overflow-hidden/);
  });
});

describe('FR4: NoteComposer payload', () => {
  it('sends categoryId for existing chip, categoryName for new chip', () => {
    expect(componentSource).toMatch(/categoryId/);
    expect(componentSource).toMatch(/categoryName/);
  });

  it('sends sourceId when known else learningStreamItemId', () => {
    expect(componentSource).toMatch(/sourceId/);
    expect(componentSource).toMatch(/learningStreamItemId/);
  });
});

describe('FR4: NoteComposer error path', () => {
  it('surfaces an inline error message on createNote failure', () => {
    expect(componentSource).toMatch(/catch|onError/);
  });
});
