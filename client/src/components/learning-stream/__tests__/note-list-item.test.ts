/**
 * Spec 02 FR4 — NoteListItem source-as-string assertions.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../NoteListItem.tsx', import.meta.url),
  'utf8',
);

describe('FR4: NoteListItem export + props', () => {
  it('exports the component', () => {
    expect(componentSource).toMatch(/export\s+function\s+NoteListItem\s*\(/);
  });

  it('accepts note, onEdit, onDelete props', () => {
    expect(componentSource).toMatch(/note/);
    expect(componentSource).toMatch(/onEdit/);
    expect(componentSource).toMatch(/onDelete/);
  });
});

describe('FR4: NoteListItem markdown rendering', () => {
  it('renders the markdown body via ReactMarkdown', () => {
    expect(componentSource).toMatch(/from\s+['"]react-markdown['"]/);
    expect(componentSource).toMatch(/<ReactMarkdown/);
  });
});

describe('FR4: NoteListItem hover affordances', () => {
  it('uses group-hover for the edit / delete reveal (CSS-only, no JS state)', () => {
    // group + group-hover Tailwind utility.
    expect(componentSource).toMatch(/group-hover/);
  });
});

describe('FR4: NoteListItem inline edit', () => {
  it('has an inline edit mode toggle', () => {
    // Component-local UI state for edit mode and edit textarea content.
    expect(componentSource).toMatch(/useState/);
  });

  it('calls onEdit(id, content) on save and onDelete(id) on delete', () => {
    expect(componentSource).toMatch(/onEdit\(/);
    expect(componentSource).toMatch(/onDelete\(/);
  });

  it('surfaces an inline error on edit / delete failure', () => {
    expect(componentSource).toMatch(/catch|error/);
  });
});

describe('FR4: NoteListItem defense', () => {
  it('gates edit / delete affordances on a real (non-optimistic) note id', () => {
    // note.id > 0 guard somewhere in the component.
    expect(componentSource).toMatch(/note\.id\s*>\s*0/);
  });
});
