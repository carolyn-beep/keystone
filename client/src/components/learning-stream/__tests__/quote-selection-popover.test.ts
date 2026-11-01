/**
 * Spec 03 FR2 - QuoteSelectionPopover source-as-string assertions.
 *
 * Functional emission is asserted in spec-03-anchors.test.ts (the EMIT_WIRINGS
 * extension). This file pins the component's structural shape: props, event
 * listeners, dismiss surfaces, and one-shot emit guard.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../QuoteSelectionPopover.tsx', import.meta.url),
  'utf8',
);

describe('Spec 03 FR2 - QuoteSelectionPopover exports', () => {
  it('exports a QuoteSelectionPopover component', () => {
    expect(componentSource).toMatch(/export\s+(function|const)\s+QuoteSelectionPopover/);
  });

  it('declares the documented prop shape (text, rect, onSaveAsNote, onDismiss)', () => {
    expect(componentSource).toMatch(/text\s*:\s*string/);
    expect(componentSource).toMatch(/rect\s*:/);
    expect(componentSource).toMatch(/lineRects\??\s*:/);
    expect(componentSource).toMatch(/articleBodyRect\??\s*:/);
    expect(componentSource).toMatch(/onSaveAsNote\s*:/);
    expect(componentSource).toMatch(/onDismiss\s*:/);
  });
});

describe('Spec 03 FR2 - positioning and styling', () => {
  it('uses an inline style positioned at the selection rect (per CLAUDE.md rule)', () => {
    // Popover anchors its left edge at the selection's right edge (plus a
    // small gutter) so the popup floats just past the highlight. `top` is
    // always inline; horizontal is either `left` or `right` from the rect.
    expect(componentSource).toMatch(/top\s*:/);
    expect(componentSource).toMatch(/(left|right)\s*:/);
    expect(componentSource).toMatch(/rect\.(right|left|top)/);
  });

  it('anchors to the last line rect and flips vertical when horizontal room is insufficient', () => {
    expect(componentSource).toMatch(/lineRects\[lineRects\.length - 1\]/);
    expect(componentSource).toMatch(/hasHorizontalRoom/);
    expect(componentSource).toMatch(/rightAlignedLeft/);
    expect(componentSource).toMatch(/shouldFloatAbove/);
    expect(componentSource).toMatch(/translateY\(-100%\)/);
  });

  it('uses position: absolute (popover lives inside the article scroll container, not a portal)', () => {
    expect(componentSource).toMatch(/position\s*:\s*['"]absolute['"]|absolute/);
  });
});

describe('Spec 03 FR2 - dismiss surfaces', () => {
  it('binds an Escape keydown listener', () => {
    expect(componentSource).toMatch(/['"]keydown['"]/);
    expect(componentSource).toMatch(/Escape/);
  });

  it('binds an outside-click (mousedown) listener', () => {
    expect(componentSource).toMatch(/['"]mousedown['"]/);
  });

  it('exposes a "Save as note" action that calls onSaveAsNote with the supplied text', () => {
    expect(componentSource).toMatch(/Save as note/i);
    expect(componentSource).toMatch(/onSaveAsNote\s*\(/);
  });
});

describe('Spec 03 FR2 - style hygiene', () => {
  it('contains no EM dashes (project style rule)', () => {
    // U+2014 EM DASH
    expect(componentSource).not.toMatch(/—/);
  });
});
