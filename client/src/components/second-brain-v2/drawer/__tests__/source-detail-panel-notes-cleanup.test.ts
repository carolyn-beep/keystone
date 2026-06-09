/**
 * Spec 02 FR5 — SourceDetailPanel "Linked Notes preview" cleanup assertions.
 *
 * Notes triage now happens in the reader (NotesPanel). The drawer keeps
 * the primary `Read source` CTA and the secondary `View linked notes in
 * Notes tab` link, but the inline preview section is removed.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panelSource = fs.readFileSync(
  new URL('../SourceDetailPanel.tsx', import.meta.url),
  'utf8',
);

describe('FR5: SourceDetailPanel — Linked Notes preview removed', () => {
  it('does NOT contain the MAX_PREVIEW_NOTES constant anymore', () => {
    expect(panelSource).not.toContain('MAX_PREVIEW_NOTES');
  });

  it('does NOT contain the previewNotes derivation', () => {
    expect(panelSource).not.toContain('previewNotes');
  });

  it('does NOT contain the overflowNotesCount derivation', () => {
    expect(panelSource).not.toContain('overflowNotesCount');
  });

  it('does NOT contain the "Linked Notes" heading literal', () => {
    expect(panelSource).not.toContain('Linked Notes');
  });

  it('does NOT contain the empty-state copy "No notes linked yet"', () => {
    expect(panelSource).not.toContain('No notes linked yet');
  });
});

describe('FR5: SourceDetailPanel — primary + secondary CTAs preserved', () => {
  it('keeps the "Read source" primary CTA', () => {
    expect(panelSource).toContain('Read source');
  });

  it('keeps the "View linked notes in Notes tab" secondary link', () => {
    expect(panelSource).toContain('View linked notes in Notes tab');
  });
});
