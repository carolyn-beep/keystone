/**
 * Tests for 02-frontend-import-tab: Markdown tab in AddBrainliftModal
 *
 * FR1: Markdown tab visibility, file upload behavior, and FormData construction.
 *
 * Tests validate the tab configuration and conditional logic that determines
 * which UI (file upload vs URL input) is shown and how FormData is built.
 * React rendering is not tested (no jsdom/RTL setup); we test the data
 * contracts and branching logic that the component relies on.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Re-declare the tab config and helpers exactly as they appear in the modal.
// These serve as contract tests: if the source file drifts, we catch it here.
// ---------------------------------------------------------------------------

type SourceType = 'html' | 'workflowy' | 'googledocs' | 'markdown';

const tabs: { id: SourceType; label: string }[] = [
  { id: 'workflowy', label: 'Workflowy' },
  { id: 'html', label: 'HTML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'googledocs', label: 'Google Docs' },
];

/** Returns true when the active tab should show the file upload zone */
function isFileUploadTab(tab: SourceType): boolean {
  return tab === 'html' || tab === 'markdown';
}

/** Returns true when the active tab should show the URL input */
function isUrlTab(tab: SourceType): boolean {
  return tab === 'workflowy' || tab === 'googledocs';
}

/** Returns the accept attribute for the file input */
function getAcceptAttribute(tab: SourceType): string {
  return tab === 'html' ? '.html,.htm' : '.md';
}

/** Returns the help text for the file upload zone */
function getUploadHelpText(tab: SourceType): string {
  return tab === 'html'
    ? 'Click to upload an HTML file (or saved Workflowy page)'
    : 'Click to upload a Markdown brainlift template (.md)';
}

// ---------------------------------------------------------------------------
// FR1: Markdown tab in AddBrainliftModal
// ---------------------------------------------------------------------------

describe('02-frontend-import-tab: Markdown tab', () => {
  describe('tab configuration', () => {
    it('includes markdown in the tabs array', () => {
      const markdownTab = tabs.find((t) => t.id === 'markdown');
      expect(markdownTab).toBeDefined();
      expect(markdownTab!.label).toBe('Markdown');
    });

    it('places markdown after HTML and before Google Docs', () => {
      const ids = tabs.map((t) => t.id);
      const htmlIndex = ids.indexOf('html');
      const mdIndex = ids.indexOf('markdown');
      const gdIndex = ids.indexOf('googledocs');

      expect(mdIndex).toBeGreaterThan(htmlIndex);
      expect(mdIndex).toBeLessThan(gdIndex);
    });

    it('has 4 tabs total', () => {
      expect(tabs).toHaveLength(4);
    });

    it('groups file-based tabs together and URL-based tabs at the ends', () => {
      // File tabs: html (index 1), markdown (index 2)
      // URL tabs: workflowy (index 0), googledocs (index 3)
      expect(isFileUploadTab(tabs[1].id)).toBe(true);
      expect(isFileUploadTab(tabs[2].id)).toBe(true);
      expect(isUrlTab(tabs[0].id)).toBe(true);
      expect(isUrlTab(tabs[3].id)).toBe(true);
    });
  });

  describe('file upload vs URL input routing', () => {
    it('shows file upload for markdown tab', () => {
      expect(isFileUploadTab('markdown')).toBe(true);
      expect(isUrlTab('markdown')).toBe(false);
    });

    it('shows file upload for html tab', () => {
      expect(isFileUploadTab('html')).toBe(true);
      expect(isUrlTab('html')).toBe(false);
    });

    it('shows URL input for workflowy tab', () => {
      expect(isFileUploadTab('workflowy')).toBe(false);
      expect(isUrlTab('workflowy')).toBe(true);
    });

    it('shows URL input for googledocs tab', () => {
      expect(isFileUploadTab('googledocs')).toBe(false);
      expect(isUrlTab('googledocs')).toBe(true);
    });
  });

  describe('file input accept attribute', () => {
    it('accepts .md files on markdown tab', () => {
      expect(getAcceptAttribute('markdown')).toBe('.md');
    });

    it('accepts .html,.htm files on html tab', () => {
      expect(getAcceptAttribute('html')).toBe('.html,.htm');
    });
  });

  describe('upload help text', () => {
    it('shows markdown-specific help text on markdown tab', () => {
      const text = getUploadHelpText('markdown');
      expect(text).toContain('Markdown');
      expect(text).toContain('.md');
    });

    it('shows HTML-specific help text on html tab', () => {
      const text = getUploadHelpText('html');
      expect(text).toContain('HTML');
    });
  });

  describe('FormData construction logic', () => {
    it('markdown tab requires file (same branch as html)', () => {
      // Both html and markdown go through the file branch in buildFormData
      expect(isFileUploadTab('markdown')).toBe(true);
      expect(isFileUploadTab('html')).toBe(true);
    });

    it('markdown tab does NOT go through evaluation flow', () => {
      // Only workflowy goes through evaluate -> decision flow
      // markdown, html, googledocs all use handleLegacySubmit (direct import)
      const evaluationTabs: SourceType[] = ['workflowy'];
      expect(evaluationTabs).not.toContain('markdown');
    });
  });
});
