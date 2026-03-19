/**
 * Pure helper functions for the Phase 3 Knowledge Tree list view.
 *
 * Extracted from components for testability. These functions have no
 * React dependencies -- they compute view state from API data.
 */

// ─── Section Counts ─────────────────────────────────────────────────────────

export function computeSectionCounts(
  unprocessed: unknown[],
  triaged: unknown[],
  saved: unknown[]
): { unprocessed: number; triaged: number; saved: number } {
  return {
    unprocessed: unprocessed.length,
    triaged: triaged.length,
    saved: saved.length,
  };
}

// ─── URL Builders ───────────────────────────────────────────────────────────

/**
 * Build the URL search string for navigating to an item's detail view.
 * Format: ?screen=3&item={itemId}
 */
export function buildItemDetailUrl(itemId: number): string {
  return `?screen=3&item=${itemId}`;
}

/**
 * Build the URL for the MissionDashboard (learning stream tab).
 */
export function buildMissionDashboardUrl(slug: string): string {
  return `/brainlifts/${slug}?tab=learning-stream`;
}

// ─── Extraction Count Formatting ────────────────────────────────────────────

/**
 * Format fact and summary counts with proper pluralization.
 */
export function formatExtractionCounts(factCount: number, summaryCount: number): string {
  const factLabel = factCount === 1 ? 'fact' : 'facts';
  const summaryLabel = summaryCount === 1 ? 'summary' : 'summaries';
  return `${factCount} ${factLabel}, ${summaryCount} ${summaryLabel}`;
}

// ─── Swarm Status ───────────────────────────────────────────────────────────

/**
 * Determine whether the swarm status bar should be visible.
 */
export function computeSwarmVisibility(research: {
  isRunning: boolean;
  canRelaunch: boolean;
}): boolean {
  return research.isRunning;
}

// ─── Relaunch Visibility ────────────────────────────────────────────────────

/**
 * Determine whether the "Start New Research" button should be shown.
 */
export function computeRelaunchVisibility(params: {
  unprocessedCount: number;
  canRelaunch: boolean;
  isRunning: boolean;
}): boolean {
  return params.unprocessedCount === 0 && params.canRelaunch && !params.isRunning;
}

// ─── Manual Source Validation ───────────────────────────────────────────────

interface ValidationResult {
  valid: boolean;
  errors: {
    url?: string;
    title?: string;
  };
}

/**
 * Validate manual source form input.
 * URL must be a valid http/https URL. Title must be non-empty.
 */
export function validateManualSource(url: string, title: string): ValidationResult {
  const errors: { url?: string; title?: string } = {};

  // Validate URL
  if (!url || url.trim().length === 0) {
    errors.url = 'URL is required';
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.url = 'Only http and https URLs are allowed';
      }
    } catch {
      errors.url = 'Please enter a valid URL';
    }
  }

  // Validate title
  if (!title || title.trim().length === 0) {
    errors.title = 'Title is required';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── Empty State Computation ────────────────────────────────────────────────

interface EmptyStateInput {
  unprocessed: unknown[];
  triaged: unknown[];
  saved: unknown[];
  research: { isRunning: boolean; canRelaunch: boolean };
}

interface EmptyState {
  type: 'swarm-running' | 'no-results' | 'all-triaged';
  message: string;
}

/**
 * Compute which empty state message to show, if any.
 *
 * Returns null when content exists and no empty state is needed.
 * Priority order:
 * 1. Swarm running, no items at all
 * 2. Swarm finished, no items at all
 * 3. All unprocessed triaged, nothing saved yet
 */
export function computeEmptyState(input: EmptyStateInput): EmptyState | null {
  const { unprocessed, triaged, saved, research } = input;
  const totalItems = unprocessed.length + triaged.length + saved.length;

  // If there are unprocessed items, no empty state needed
  if (unprocessed.length > 0) return null;

  // If saved items exist, workspace is active
  if (saved.length > 0) return null;

  // No items at all
  if (totalItems === 0) {
    if (research.isRunning) {
      return {
        type: 'swarm-running',
        message: 'Your experts are being researched. Sources will appear here as they\'re found.',
      };
    }
    return {
      type: 'no-results',
      message: 'The research swarm didn\'t find sources. Add your own or refine your experts.',
    };
  }

  // Items exist but all in triaged, none saved
  if (triaged.length > 0 && saved.length === 0) {
    return {
      type: 'all-triaged',
      message: 'You\'ve reviewed all findings. Open a source to start extracting facts and summaries.',
    };
  }

  return null;
}
