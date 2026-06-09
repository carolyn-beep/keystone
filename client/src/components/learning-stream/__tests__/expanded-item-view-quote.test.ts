/**
 * Spec 03 FR3 - ExpandedItemView quote wiring source-as-string assertions.
 *
 * ExpandedItemView is too heavy to render in the node Vitest env (PanelGroup,
 * TanStack Query, multiple panels). Source-as-string pins the wiring: state
 * hook, ref hook, callback prop pass-through, prefill template.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../ExpandedItemView.tsx', import.meta.url),
  'utf8',
);

describe('Spec 03 FR3 - selection state and composer ref', () => {
  it('holds selection in a useState with the documented shape', () => {
    expect(componentSource).toMatch(/ReaderSelectionPayload/);
    expect(componentSource).toMatch(/useState\s*<\s*ReaderSelectionPayload\s*\|\s*null/);
  });

  it('declares a composerRef via useRef<NoteComposerHandle>', () => {
    expect(componentSource).toMatch(/NoteComposerHandle/);
    expect(componentSource).toMatch(/useRef\s*<\s*NoteComposerHandle/);
  });
});

describe('Spec 03 FR3 - wiring', () => {
  it('imports QuoteSelectionPopover', () => {
    expect(componentSource).toMatch(/from\s+['"]\.\/QuoteSelectionPopover['"]/);
  });

  it('passes onTextSelection to ContentViewer', () => {
    expect(componentSource).toMatch(/onTextSelection\s*=/);
  });

  it('passes composerRef to NotesPanel', () => {
    expect(componentSource).toMatch(/composerRef\s*=\s*\{composerRef\}/);
  });

  it('renders QuoteSelectionPopover gated on the selection being non-null', () => {
    // Either a `selection &&` short-circuit or `selection !== null` ternary
    // that produces a <QuoteSelectionPopover ... />.
    const hasGatedRender =
      /selection\s*&&[\s\S]*<QuoteSelectionPopover/.test(componentSource) ||
      /selection\s*!==\s*null[\s\S]*<QuoteSelectionPopover/.test(componentSource) ||
      /selection\s*\?[\s\S]*<QuoteSelectionPopover/.test(componentSource);
    expect(
      hasGatedRender,
      'QuoteSelectionPopover should render only when selection is non-null',
    ).toBe(true);
  });
});

describe('Spec 03 FR3 - prefill format', () => {
  it('uses the documented `> {text}\\n\\n` blockquote prefill template', () => {
    // Either a template literal with `> ${...}\n\n` or a string concat that
    // yields the same shape.
    const hasBlockquoteTemplate = /`>\s*\$\{[^}]+\}\\n\\n`/.test(componentSource);
    expect(
      hasBlockquoteTemplate,
      'prefill should produce a `> {text}\\n\\n` blockquote string',
    ).toBe(true);
  });

  it('clears the selection after the user saves as note', () => {
    // The save handler should null out the selection state.
    expect(componentSource).toMatch(/setSelection\s*\(\s*null\s*\)/);
  });
});
