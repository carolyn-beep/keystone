/**
 * Spec 05-categories-tab - FR6 tests for the CategoryRow component.
 *
 * File-source assertions (vitest node env, no jsdom).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const rowSource = fs.readFileSync(
  new URL('../CategoryRow.tsx', import.meta.url),
  'utf8',
);

describe('FR6 CategoryRow - props contract', () => {
  it('exports a CategoryRow component', () => {
    expect(rowSource).toMatch(/export\s+(default\s+)?function\s+CategoryRow\b|export\s+const\s+CategoryRow\s*=/);
  });

  it('declares the documented props', () => {
    // Spec lists: category, isEditing, canDelete, onStartEdit, onSaveEdit,
    // onCancelEdit, onDelete, optional onMoveUp/onMoveDown.
    expect(rowSource).toMatch(/category[:?]\s*/);
    expect(rowSource).toMatch(/isEditing:\s*boolean/);
    expect(rowSource).toMatch(/canDelete:\s*boolean/);
    expect(rowSource).toMatch(/onStartEdit:/);
    expect(rowSource).toMatch(/onSaveEdit:/);
    expect(rowSource).toMatch(/onCancelEdit:/);
    expect(rowSource).toMatch(/onDelete:/);
    expect(rowSource).toMatch(/onMoveUp\?:/);
    expect(rowSource).toMatch(/onMoveDown\?:/);
  });
});

describe('FR6 CategoryRow - read-mode UI', () => {
  it('imports edit + delete icons from lucide-react', () => {
    expect(rowSource).toMatch(/from\s+['"]lucide-react['"]/);
    // Pencil for edit, Trash2 (or Trash) for delete are the established icons.
    expect(rowSource).toMatch(/\bPencil\b/);
    expect(rowSource).toMatch(/\bTrash2?\b/);
  });

  it('renders source + note count text', () => {
    expect(rowSource).toMatch(/sourceCount/);
    expect(rowSource).toMatch(/noteCount/);
  });

  it('uses hover-reveal opacity classes on hover-only controls', () => {
    expect(rowSource).toMatch(/opacity-0/);
    expect(rowSource).toMatch(/group-hover:opacity-100/);
  });

  it('uses neo-editorial typographic tokens', () => {
    expect(rowSource).toMatch(/font-serif|font-(sans|mono)/);
    expect(rowSource).toMatch(/text-muted-foreground|text-foreground/);
    expect(rowSource).toMatch(/tracking-/);
  });
});

describe('FR6 CategoryRow - delete affordance', () => {
  it('passes disabled={!canDelete} on the delete button', () => {
    expect(rowSource).toMatch(/disabled=\{!canDelete\}/);
  });

  it('surfaces the disabled and enabled tooltip strings', () => {
    expect(rowSource).toContain('Move sources to another category first');
    expect(rowSource).toContain('Notes in this category will become uncategorized.');
  });

  it('uses a title attribute (or similar) for tooltip surface', () => {
    expect(rowSource).toMatch(/title=\{/);
  });
});

describe('FR6 CategoryRow - edit-mode behavior', () => {
  it('renders an input when isEditing', () => {
    expect(rowSource).toMatch(/<input/);
    expect(rowSource).toMatch(/isEditing/);
  });

  it('handles Enter to save the trimmed value', () => {
    expect(rowSource).toMatch(/['"]Enter['"]/);
    expect(rowSource).toMatch(/\.trim\(\)/);
    expect(rowSource).toMatch(/onSaveEdit/);
  });

  it('skips onSaveEdit when the trimmed value is empty', () => {
    // The save handler must guard against empty trimmed input.
    expect(rowSource).toMatch(/if\s*\(\s*!?\s*trimmed|trimmed\.length\s*===\s*0|trimmed\s*===\s*['"]{2}/);
  });

  it('handles Escape to cancel edit', () => {
    expect(rowSource).toMatch(/['"]Escape['"]/);
    expect(rowSource).toMatch(/onCancelEdit/);
  });

  it('autofocuses the rename input', () => {
    expect(rowSource).toMatch(/autoFocus/);
  });
});

describe('FR6 CategoryRow - move-up / move-down buttons', () => {
  it('renders move buttons only when callbacks are provided', () => {
    expect(rowSource).toMatch(/onMoveUp\s*&&|onMoveUp\s*\?|onMoveUp\s*!=\s*null/);
    expect(rowSource).toMatch(/onMoveDown\s*&&|onMoveDown\s*\?|onMoveDown\s*!=\s*null/);
  });

  it('uses chevron-up / chevron-down icons from lucide-react', () => {
    expect(rowSource).toMatch(/\bChevronUp\b/);
    expect(rowSource).toMatch(/\bChevronDown\b/);
  });
});
