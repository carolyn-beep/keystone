/**
 * Pure helper functions for the Phase 3 Source Detail workspace.
 *
 * Extracted from components for testability. These functions have no
 * React dependencies -- they compute view state from API data.
 */

// ─── URL Navigation ─────────────────────────────────────────────────────────

/**
 * Parse the `item` query param from a URL search string.
 * Returns null for missing, empty, or non-numeric values.
 */
export function parseItemParam(searchString: string): number | null {
  const params = new URLSearchParams(searchString);
  const raw = params.get('item');
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return isNaN(id) ? null : id;
}

/**
 * Build URL search string that removes the `item` param while preserving others.
 * Returns the new search string (including leading `?`).
 */
export function buildListReturnUrl(currentSearch: string): string {
  const params = new URLSearchParams(currentSearch);
  params.delete('item');
  const result = params.toString();
  return result ? `?${result}` : '';
}

// ─── Builder Mode Detection ─────────────────────────────────────────────────

export type ViewMode = 'stream' | 'builder';

/**
 * Determine if the view is in builder mode.
 */
export function isBuilderMode(mode: ViewMode | undefined): boolean {
  return mode === 'builder';
}

// ─── Tab Configuration ──────────────────────────────────────────────────────

export type RightPanelTab = 'discuss' | 'quiz' | 'manual';

export interface TabConfig {
  key: RightPanelTab;
  label: string;
}

/**
 * Get the tab configuration based on view mode.
 * Builder mode: Discussion + Manual
 * Stream mode: Discuss + Quiz
 */
export function getTabsForMode(mode: ViewMode | undefined): TabConfig[] {
  if (mode === 'builder') {
    return [
      { key: 'discuss', label: 'Discussion' },
      { key: 'manual', label: 'Manual' },
    ];
  }
  return [
    { key: 'discuss', label: 'Discuss' },
    { key: 'quiz', label: 'Quiz' },
  ];
}

/**
 * Get the default active tab for a mode.
 */
export function getDefaultTab(mode: ViewMode | undefined): RightPanelTab {
  return 'discuss';
}

// ─── Extraction Badge ───────────────────────────────────────────────────────

export interface ExtractionCounts {
  facts: number;
  summaries: number;
}

/**
 * Format extraction counts for the header badge.
 * Returns a human-readable string like "3 facts, 1 summary".
 */
export function formatExtractionBadge(counts: ExtractionCounts): string {
  const factLabel = counts.facts === 1 ? 'fact' : 'facts';
  const summaryLabel = counts.summaries === 1 ? 'summary' : 'summaries';
  return `${counts.facts} ${factLabel}, ${counts.summaries} ${summaryLabel}`;
}

/**
 * Determine if the extraction badge should be visible.
 * Only shown in builder mode.
 */
export function shouldShowExtractionBadge(
  mode: ViewMode | undefined,
): boolean {
  return mode === 'builder';
}

// ─── Manual Tab Empty State ─────────────────────────────────────────────────

export interface ManualTabData {
  facts: unknown[];
  summaries: unknown[];
}

/**
 * Compute the empty state message for the Manual tab.
 * Returns null when there are facts or summaries.
 */
export function computeManualTabEmpty(data: ManualTabData): string | null {
  if (data.facts.length > 0 || data.summaries.length > 0) return null;
  return 'No facts or summaries yet. Start extracting from this source.';
}

// ─── Footer Visibility ──────────────────────────────────────────────────────

/**
 * Determine if the ExpandedItemView footer should be visible.
 * In builder mode, footer shows when there are triage actions (Keep/Discard for pending items).
 */
export function shouldShowFooter(
  mode: ViewMode | undefined,
  hasActions: boolean,
  hasNavigation: boolean
): boolean {
  if (mode === 'builder') return hasActions;
  return hasActions || hasNavigation;
}
