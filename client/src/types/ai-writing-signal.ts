/**
 * AI Writing Signal -- shared client/server payload contract.
 *
 * Surfaced on DOK2 summaries, DOK3 insights, and DOK4 SPOVs. Returned by
 * the web GET routes per spec 02; consumed by SummariesTab, InsightsTab,
 * and DOK4Tab via the shared <AiWritingSignalChip /> component.
 *
 * Field semantics: see the spec-research.md test plan + source-tracing
 * table under the feature folder for this signal. The label string is
 * re-exported from @shared/schema so the union of valid label values has a
 * single source of truth across client and server.
 */

import type { AiWritingSignalLabel } from '@shared/schema';

export type { AiWritingSignalLabel };

export type AiWritingSignalStatus = 'analyzing' | 'done' | 'error';

export type AiWritingSignalConfidence = 'High' | 'Medium' | 'Low';

export interface AiWritingSignalPayload {
  status: AiWritingSignalStatus;
  label: AiWritingSignalLabel | null;
  version: string | null;
  fractions: {
    ai: number;
    aiAssisted: number;
    human: number;
  } | null;
  headline: string | null;
  /** Dominant-window confidence (computed server-side). */
  confidence: AiWritingSignalConfidence | null;
  errorMessage: string | null;
  analyzedAt: string | null;
}
