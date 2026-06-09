/**
 * Spec 03 FR1 - ContentViewer selection signal source-as-string assertions.
 *
 * The Vitest env runs in `node` without jsdom; full render of ContentViewer
 * pulls react-markdown + react-tweet which need a DOM. Source-as-string keeps
 * the assertions surgical and matches the project's established pattern for
 * onboarding wiring (see spec-03-anchors.test.ts).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = fs.readFileSync(
  new URL('../ContentViewer.tsx', import.meta.url),
  'utf8',
);

describe('Spec 03 FR1 - ContentViewer wraps the article body', () => {
  it('renders a data-reader-article-body wrapper', () => {
    expect(componentSource).toMatch(/data-reader-article-body/);
  });

  it('accepts an optional onTextSelection prop', () => {
    expect(componentSource).toMatch(/onTextSelection\??\s*:/);
  });

  it('threads onTextSelection through from ContentViewer to the article branch', () => {
    // Either ContentViewer destructures it and passes it to ArticleViewer,
    // or ArticleViewer reads it from a parent ref. Either way the prop name
    // should appear at least twice (declaration + usage).
    const matches = componentSource.match(/onTextSelection/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Spec 03 FR1 - selection handler', () => {
  it('reads window.getSelection() on mouseup', () => {
    expect(componentSource).toMatch(/window\.getSelection\s*\(/);
    expect(componentSource).toMatch(/onMouseUp/);
  });

  it('gates on a minimum trimmed length (2 chars per Decision 3)', () => {
    // The handler should compare a trimmed selection length to >= 2 or > 1
    // and emit null otherwise. Accept either form.
    const hasMinLengthGate =
      /\.length\s*[<>]=?\s*2/.test(componentSource) ||
      /\.length\s*<\s*2/.test(componentSource);
    expect(
      hasMinLengthGate,
      'selection handler should reject selections shorter than 2 chars',
    ).toBe(true);
  });

  it('computes a rect via getBoundingClientRect', () => {
    expect(componentSource).toMatch(/getBoundingClientRect\s*\(/);
  });

  it('emits per-line client rects so the popover can anchor to the selection end line', () => {
    expect(componentSource).toMatch(/getClientRects\s*\(/);
    expect(componentSource).toMatch(/lineRects/);
  });

  it('does not add the selection handler to non-article branches', () => {
    // Embeds, PDFs, pending, and fallback states do not register the handler.
    // The wrapper + handler should live inside ArticleViewer only. Anchor on
    // the JSX attribute literal (not on doc-comment mentions of the attribute
    // name) by requiring a leading whitespace before the attribute.
    const articleStart = componentSource.indexOf('function ArticleViewer');
    expect(articleStart).toBeGreaterThan(-1);
    const wrapperPosition = componentSource.search(/\sdata-reader-article-body/);
    expect(wrapperPosition).toBeGreaterThan(articleStart);
  });
});
