/**
 * Pangram API types and typed error classes.
 *
 * Pangram is the third-party AI-writing-detection API. Internal codename only --
 * never exposed in any UI string, agent prompt, MCP response, or template.
 * External label everywhere is "AI Writing Signal".
 */

export interface PangramRequest {
  text: string;
  public_dashboard_link?: boolean;
}

export interface PangramWindow {
  text: string;
  /** Descriptive label e.g. "AI-Generated", "Human". */
  label: string;
  ai_assistance_score: number;
  confidence: 'High' | 'Medium' | 'Low';
  start_index: number;
  end_index: number;
  word_count: number;
  token_length: number;
}

export interface PangramResponse {
  /** The input text that was analyzed. */
  text: string;
  /** API version identifier, e.g. "3.0". */
  version: string;
  /** Raw Pangram top-level classification. Translated to external label via predictionShortToLabel(). */
  prediction_short: 'Human' | 'AI-Assisted' | 'Mixed' | 'AI';
  fraction_ai: number;
  fraction_ai_assisted: number;
  fraction_human: number;
  num_ai_segments: number;
  num_ai_assisted_segments: number;
  num_human_segments: number;
  dashboard_link?: string;
  /** Short user-facing summary line e.g. "Likely AI-Assisted". */
  headline: string;
  /** Longer explanation. */
  prediction: string;
  windows: PangramWindow[];
}

// ── Typed errors ──────────────────────────────────────────────────────────────

export class PangramHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly bodyExcerpt: string,
  ) {
    super(message);
    this.name = 'PangramHttpError';
  }
}

export class PangramNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PangramNetworkError';
  }
}

export class PangramTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Pangram request timed out after ${timeoutMs}ms`);
    this.name = 'PangramTimeoutError';
  }
}

export class PangramResponseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'PangramResponseError';
  }
}
