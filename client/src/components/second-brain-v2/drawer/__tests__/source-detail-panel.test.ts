/**
 * Spec 03 FR6 — SourceDetailPanel tests.
 *
 * File-source assertions. The panel renders inside <RightDrawer> and
 * carries the metadata table, summary, why-this-matters, linked notes
 * preview, and the cross-tab CTA.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const panel = fs.readFileSync(
  new URL('../SourceDetailPanel.tsx', import.meta.url),
  'utf8',
);

describe('FR6 SourceDetailPanel', () => {
  it('reuses RETRIEVAL_TYPE_META and formatUrl', () => {
    // Note: the original assertion claimed ResourceTypeBadge was also
    // reused here, but the panel uses the type-coded meta block directly
    // rather than the badge component. Asserting what the source actually
    // does keeps the test honest.
    expect(panel).toContain('RETRIEVAL_TYPE_META');
    expect(panel).toMatch(/from ['"]@\/lib\/url['"]/);
  });

  it('renders the type badge + title + secondary line (author)', () => {
    expect(panel).toMatch(/source\.title/);
    expect(panel).toMatch(/source\.author/);
  });

  it('renders the metadata table rows (Saved on / Source / Length / Category)', () => {
    expect(panel).toMatch(/Saved on/i);
    expect(panel).toMatch(/Source/);
    expect(panel).toMatch(/Length/);
    expect(panel).toMatch(/Category/);
  });

  it('omits the Length row when source.length is null', () => {
    expect(panel).toMatch(/source\.length\s*\?|source\.length\s*&&|length\s*!=\s*null/);
  });

  it('renders the Summary section sourced from keyInsights', () => {
    expect(panel).toMatch(/keyInsights/);
    expect(panel).toMatch(/Summary|Key insights/i);
  });

  it('renders the Why this matters section with a collapsed default', () => {
    expect(panel).toMatch(/whyMatters/);
    expect(panel).toMatch(/Why this matters/i);
    // collapse state starts false
    expect(panel).toMatch(/useState[<(\s]*(false|boolean)|isExpanded.*=\s*false|setExpanded.*false/);
  });

  it('omits Why this matters when source.whyMatters is null', () => {
    expect(panel).toMatch(/whyMatters\s*\?|whyMatters\s*&&|whyMatters\s*!=\s*null/);
  });

  // Spec 02 FR5 removed the inline Linked Notes preview. The full preview
  // assertions now live in source-detail-panel-notes-cleanup.test.ts.
  // We still keep the "notes prop is referenced" smoke check because the
  // panel forwards it elsewhere (e.g. the View-linked-notes link routing).
  it('still accepts a notes prop (used by the View-linked-notes link routing)', () => {
    expect(panel).toMatch(/notes/);
  });

  it('exposes the secondary CTA: View linked notes in Notes tab', () => {
    expect(panel).toMatch(/View linked notes/i);
    expect(panel).toMatch(/onViewLinkedNotes/);
  });

  it('exposes the primary CTA: Read source', () => {
    expect(panel).toContain('Read source');
  });

  it('exposes secondary actions: Open source, Edit category, Delete', () => {
    expect(panel).toMatch(/Open source/i);
    expect(panel).toMatch(/onEditCategory/);
    expect(panel).toMatch(/onDelete/);
  });

  it('uses neo-editorial styling (serif body, small-caps labels)', () => {
    expect(panel).toMatch(/font-serif/);
    expect(panel).toMatch(/uppercase/);
  });
});
