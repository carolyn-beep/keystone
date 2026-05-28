/**
 * Motion tokens for the grading explainer modal.
 *
 * One source of truth for the screen-transition choreography so timings and
 * easing stay consistent. The transition is a deliberate sequence, NOT a
 * cross-fade:
 *
 *   1. fade the current content out
 *   2. smoothly resize the modal window to the next screen's measured size
 *   3. reveal the next content instantly (no fade-in — keeps it snappy)
 *
 * Register: neo-editorial — smooth and unhurried, never flashy. Real
 * width/height transitions (no transform scaling) so the frame never distorts.
 */

/** Phase 1: current content fades out. */
export const FADE_OUT_MS = 150;
/** Phase 2: the window resizes to the destination measures. The headline. */
export const PANEL_RESIZE_MS = 150;

/** Calm, symmetric easing for every phase. */
export const EASE_STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** Collapse a duration to 0 when the user prefers reduced motion. */
export function withReducedMotion(ms: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : ms;
}
