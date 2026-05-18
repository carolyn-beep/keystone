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
  it('reuses ResourceTypeBadge, RETRIEVAL_TYPE_META, and formatUrl', () => {
    expect(panel).toContain('ResourceTypeBadge');
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

  it('renders the Linked Notes preview with up to 3 rows', () => {
    expect(panel).toMatch(/notes/);
    // Either an explicit slice(0, 3) or a 3-cap constant
    expect(panel).toMatch(/slice\(0,\s*3\)|MAX_PREVIEW|PREVIEW_NOTES/);
  });

  it('shows an empty state when no notes are linked', () => {
    expect(panel).toMatch(/No notes linked|no notes/i);
  });

  it('exposes the primary CTA: View linked notes in Notes tab', () => {
    expect(panel).toMatch(/View linked notes/i);
    expect(panel).toMatch(/onViewLinkedNotes/);
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
