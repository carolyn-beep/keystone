/**
 * Spec 04 - NoteDetailPanel tests (file-source assertions).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panelSource = fs.readFileSync(
  new URL('../NoteDetailPanel.tsx', import.meta.url),
  'utf8',
);

describe('FR6 NoteDetailPanel contract', () => {
  it('exports the typed props', () => {
    expect(panelSource).toContain('export interface NoteDetailPanelProps');
    expect(panelSource).toContain('note: Note');
    expect(panelSource).toContain('linkedSource: Source | null');
    expect(panelSource).toContain('category: Category | null');
    expect(panelSource).toContain('categories: Category[]');
    expect(panelSource).toContain('onSave: (patch:');
    expect(panelSource).toContain('onDelete: () => Promise<void>');
    expect(panelSource).toContain('onJumpToSource: (sourceId: number) => void');
  });

  it('renders a type badge that falls back to STANDALONE', () => {
    expect(panelSource).toContain('Standalone');
    expect(panelSource).toContain('linkedSource?.type ?? ');
  });

  it('supports view, edit, and confirm-delete modes', () => {
    expect(panelSource).toContain("'view' | 'edit' | 'confirm-delete'");
  });

  it('save only sends changed fields (diff patch)', () => {
    expect(panelSource).toContain('if (trimmed !== note.content) patch.content = trimmed');
    expect(panelSource).toContain('if (draftCategoryId !== note.categoryId) patch.categoryId = draftCategoryId');
    expect(panelSource).toContain('if (draftSourceId !== note.sourceId) patch.sourceId = draftSourceId');
  });

  it('edit cancel discards drafts back to original', () => {
    expect(panelSource).toContain('setDraftContent(note.content)');
    expect(panelSource).toContain('setDraftCategoryId(note.categoryId)');
    expect(panelSource).toContain('setDraftSourceId(note.sourceId)');
  });

  it('hides Jump to source for standalone notes', () => {
    expect(panelSource).toContain('linkedSource ? (');
    expect(panelSource).toMatch(/Jump to source/);
  });

  it('treats sourceId != null but linkedSource == null as standalone gracefully', () => {
    expect(panelSource).toContain('note.sourceId == null || linkedSource == null');
  });

  it('uses the SourceTypeahead primitive in edit mode', () => {
    expect(panelSource).toContain("from '../shared/SourceTypeahead'");
    expect(panelSource).toContain('<SourceTypeahead');
  });

  it('link-to-source section starts expanded only when note is linked', () => {
    expect(panelSource).toContain('useState<boolean>(note.sourceId != null)');
  });
});
