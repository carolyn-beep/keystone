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
    expect(modalSource).toContain('onCreated?: (note: Note) => void');
  });

  it('does NOT expose a category prop — category is inherited from the linked source', () => {
    expect(modalSource).not.toContain('defaultCategoryId');
    expect(modalSource).not.toContain('useCategories');
  });

  it('does NOT render a category form field', () => {
    expect(modalSource).not.toMatch(/<select[\s\S]*Uncategorized/);
    expect(modalSource).not.toMatch(/Category[\s\S]{0,40}<select/);
  });

  it('disables Save when body is empty (trimmed)', () => {
    expect(modalSource).toContain('const trimmed = content.trim()');
    expect(modalSource).toContain('const canSubmit = trimmed.length > 0 && !isCreating');
    expect(modalSource).toContain('disabled={!canSubmit}');
  });

  it('Escape closes the modal', () => {
    expect(modalSource).toContain("event.key === 'Escape'");
  });

  it('backdrop click closes the modal', () => {
    // The full-screen overlay wrapper closes on click; the inner form stops
    // propagation so clicks inside the modal don't close it.
    expect(modalSource).toContain('onClick={onClose}');
    expect(modalSource).toContain('onClick={(event) => event.stopPropagation()}');
  });

  it('Link-to-source section auto-expands when defaultSourceId is provided', () => {
    expect(modalSource).toContain('useState<boolean>(defaultSourceId != null)');
  });

  it('pre-fills source from defaultSourceId', () => {
    expect(modalSource).toContain('useState<number | null>(defaultSourceId ?? null)');
  });

  it('submit calls createNote with content, sourceId, and the effective categoryId', () => {
    // Category is now inherited from the linked source (or the user's pick when
    // standalone) via effectiveCategoryId, so createNote carries categoryId too.
    expect(modalSource).toContain('createNote({');
    expect(modalSource).toContain('content: trimmed,');
    expect(modalSource).toContain('sourceId,');
    expect(modalSource).toContain('categoryId: effectiveCategoryId');
  });

  it('shows inline error on network failure (modal stays open)', () => {
    expect(modalSource).toContain('catch (err)');
    expect(modalSource).toContain('setError(');
  });

  it('uses SourceTypeahead in the link section', () => {
    expect(modalSource).toContain("from '../shared/SourceTypeahead'");
    expect(modalSource).toContain('<SourceTypeahead');
  });

  it('does NOT clip the SourceTypeahead dropdown with overflow-hidden on the panel', () => {
    expect(modalSource).not.toMatch(/max-w-\[560px\][^"`]*overflow-hidden/);
  });
});
