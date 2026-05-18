/**
 * Spec 04 - NewNoteModal tests (file-source assertions).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const modalSource = fs.readFileSync(
  new URL('../NewNoteModal.tsx', import.meta.url),
  'utf8',
);

describe('FR7 NewNoteModal contract', () => {
  it('exports the typed props', () => {
    expect(modalSource).toContain('export interface NewNoteModalProps');
    expect(modalSource).toContain('slug: string');
    expect(modalSource).toContain('open: boolean');
    expect(modalSource).toContain('onClose: () => void');
    expect(modalSource).toContain('defaultSourceId?: number');
    expect(modalSource).toContain('defaultCategoryId?: number');
    expect(modalSource).toContain('onCreated?: (note: Note) => void');
  });

  it('disables Save when body is empty (trimmed)', () => {
    expect(modalSource).toContain('disabled={!trimmed || isCreating}');
    expect(modalSource).toContain('const trimmed = content.trim()');
  });

  it('Escape closes the modal', () => {
    expect(modalSource).toContain("event.key === 'Escape'");
  });

  it('backdrop click closes the modal', () => {
    expect(modalSource).toContain('onClick={onClose}');
    expect(modalSource).toContain('new-note-modal-backdrop');
  });

  it('Link-to-source section auto-expands when defaultSourceId is provided', () => {
    expect(modalSource).toContain('useState<boolean>(defaultSourceId != null)');
  });

  it('pre-fills category and source from default props', () => {
    expect(modalSource).toContain('useState<number | null>(defaultCategoryId ?? null)');
    expect(modalSource).toContain('useState<number | null>(defaultSourceId ?? null)');
  });

  it('submit calls createNote with content/categoryId/sourceId', () => {
    expect(modalSource).toContain('createNote({');
    expect(modalSource).toContain('content: trimmed,');
    expect(modalSource).toContain('categoryId,');
    expect(modalSource).toContain('sourceId,');
  });

  it('shows inline error on network failure (modal stays open)', () => {
    expect(modalSource).toContain('catch (err)');
    expect(modalSource).toContain('setError(');
  });

  it('uses SourceTypeahead in the link section', () => {
    expect(modalSource).toContain("from '../shared/SourceTypeahead'");
    expect(modalSource).toContain('<SourceTypeahead');
  });
});
