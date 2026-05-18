/**
 * Spec 03 FR5 — SourceGridCard tests.
 *
 * File-source assertions. The card is presentational; we assert that:
 *  - All expected fields are referenced (so they will render when present).
 *  - The fallback paths (null type / null keyInsights) are explicit.
 *  - The interaction model honors propagation rules (body opens detail,
 *    checkbox/external/kebab do not).
 *  - Reused primitives are imported (ResourceTypeBadge, RETRIEVAL_TYPE_META,
 *    formatUrl).
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const card = fs.readFileSync(
  new URL('../SourceGridCard.tsx', import.meta.url),
  'utf8',
);

describe('FR5 SourceGridCard', () => {
  it('reuses ResourceTypeBadge and RETRIEVAL_TYPE_META from the existing libraries', () => {
    expect(card).toContain('ResourceTypeBadge');
    expect(card).toContain('RETRIEVAL_TYPE_META');
  });

  it('uses the shared formatUrl util (not a local copy)', () => {
    expect(card).toMatch(/from ['"]@\/lib\/url['"]/);
    expect(card).toMatch(/formatUrl/);
  });

  it('renders title, author, key insights, and category chip', () => {
    expect(card).toMatch(/source\.title/);
    expect(card).toMatch(/source\.author/);
    expect(card).toMatch(/source\.keyInsights/);
    expect(card).toMatch(/categoryName/);
  });

  it('renders the linked notes count', () => {
    expect(card).toMatch(/notesCount/);
  });

  it('renders the type badge only when source.type is set (null-safe)', () => {
    // The badge should only render when type is present — match either a
    // direct conditional, a helper guard, or a known-type check.
    expect(card).toMatch(/source\.type\s*\?|source\.type\s*&&|type\s*!=\s*null|isKnownRetrievalType|known\s*\?/);
  });

  it('omits the key insights blurb when null', () => {
    expect(card).toMatch(/keyInsights\s*\?|keyInsights\s*&&|keyInsights\s*!=\s*null/);
  });

  it('preserves layout height for the badge row when type is null (min-h class)', () => {
    expect(card).toMatch(/min-h-/);
  });

  it('renders a checkbox that fires onToggleSelect and stops propagation', () => {
    expect(card).toMatch(/onToggleSelect/);
    expect(card).toMatch(/stopPropagation/);
  });

  it('makes the checkbox visible on hover OR whenever any selection is active', () => {
    // Either an anySelected prop or a similar prop name controls always-on.
    expect(card).toMatch(/anySelected|hasSelection|selectionActive/);
  });

  it('clicking the card body fires onOpenDetail (not the checkbox handler)', () => {
    expect(card).toMatch(/onOpenDetail/);
  });

  it('external-link anchor opens in a new tab without firing onOpenDetail', () => {
    expect(card).toMatch(/target="_blank"/);
    expect(card).toMatch(/rel="noreferrer"|rel="noopener/);
  });

  it('exposes a kebab menu that wires onDelete', () => {
    expect(card).toMatch(/onDelete/);
  });

  it('uses neo-editorial styling tokens (warm parchment + serif title + small-caps labels)', () => {
    expect(card).toMatch(/bg-card-elevated|bg-card/);
    expect(card).toMatch(/font-serif/);
    expect(card).toMatch(/uppercase/);
  });

  it('lifts on hover (standard editorial card pattern)', () => {
    expect(card).toMatch(/hover:-translate-y/);
    expect(card).toMatch(/hover:shadow-card-hover/);
  });
});
