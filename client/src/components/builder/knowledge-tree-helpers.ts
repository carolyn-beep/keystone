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

// ─── Relaunch State ─────────────────────────────────────────────────────────

const TRIAGED_BACKLOG_THRESHOLD = 10;

export type RelaunchState =
  | { type: 'hidden' }
  | { type: 'ready'; message: string }
  | { type: 'needs-processing'; message: string }
  | { type: 'backlog-too-large'; message: string };

/**
 * Compute the relaunch state for the unprocessed section footer.
 *
 * Three possible visible states:
 * - ready: can launch a new swarm
 * - needs-processing: triaged items exist but none saved yet — must process first
 * - backlog-too-large: too many triaged items (>10) waiting — must process some first
 */
export function computeRelaunchState(params: {
  unprocessedCount: number;
  triagedCount: number;
  savedCount: number;
  canRelaunch: boolean;
  isRunning: boolean;
}): RelaunchState {
  const { unprocessedCount, triagedCount, savedCount, canRelaunch, isRunning } = params;

  // Still have unprocessed items or swarm is running — no relaunch section
  if (unprocessedCount > 0 || isRunning || !canRelaunch) {
    return { type: 'hidden' };
  }

  // Triaged items exist but nothing saved yet — must process at least one first
  if (triagedCount > 0 && savedCount === 0) {
    return {
      type: 'needs-processing',
      message: 'All caught up! Now open your triaged sources and extract facts and summaries — use the Discussion Agent or add them manually. Once you\'ve fully processed at least one source, you can launch a new research swarm.',
    };
  }

  // Too many triaged items — backlog must come down before new swarm
  if (triagedCount >= TRIAGED_BACKLOG_THRESHOLD) {
    return {
      type: 'backlog-too-large',
      message: `Nice work triaging, but you have ${triagedCount} sources waiting to be processed. Work through some of them first — once you\'re under ${TRIAGED_BACKLOG_THRESHOLD}, you can launch a new swarm.`,
    };
  }

  // Ready to launch
  return {
    type: 'ready',
    message: 'All caught up. Want to find more?',
  };
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
  type: 'swarm-running' | 'no-results';
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
        message: 'Your experts are being researched. Sources will appear here as we find them.',
      };
    }
    return {
      type: 'no-results',
      message: 'The research swarm didn\'t find sources this time. You can start by adding your own, or refine your experts and try again.',
    };
  }

  // Triaged items exist — this is a normal working state, not an empty state.
  // The unprocessed section handles its own "all caught up" + relaunch UI.
  if (triaged.length > 0) {
    return null;
  }

  return null;
}
