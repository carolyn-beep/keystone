/**
 * Shared types for the Grading Explainer modal infrastructure.
 *
 * This module is the contract between the generic shell (ExplainerShell,
 * ExplainerScreen, GradingExplainer) and the per-DOK content folders
 * (dok1/, future dok2/, dok3/, dok4/).
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md
 */

import type React from 'react';

export type DokLevel = 'dok1' | 'dok2' | 'dok3' | 'dok4';

export type RubricScore = 0 | 1 | 2 | 3 | 4 | 5;

export interface ExplainerScreenProps {
  /** Screen title — rendered as the Dialog title in serif. */
  title: string;
  /** Optional one-line subtitle below the title. */
  subtitle?: string;
  /** Optional hero block (illustration, callout, etc.) above the body. */
  hero?: React.ReactNode;
  /**
   * Optional class overrides on the per-screen visual panel. Lets each screen
   * pick its own width / max-height / overflow without coupling the shell.
   * Example: 'max-w-5xl max-h-[92vh]' for content-dense screens.
   */
  panelClassName?: string;
  /** Main screen content. */
  children: React.ReactNode;
}

export interface ExplainerShellProps {
  /** Controlled open state (parent owns). */
  open: boolean;
  /** Called when the modal requests close (X, Escape, overlay, programmatic). */
  onOpenChange: (open: boolean) => void;
  /** 0-indexed current step. */
  currentStep: number;
  /** Total number of steps in the flow (drives step-dot count + Finish gating). */
  totalSteps: number;
  /** Decrement current step. Should be a no-op on step 0. */
  onBack: () => void;
  /** Advance current step. Called only when not on last step. */
  onNext: () => void;
  /** Called when the user clicks Finish on the last step. */
  onFinish: () => void;
  /** The active screen (typically an <ExplainerScreen>). */
  children: React.ReactNode;
}

export interface GradingExplainerProps {
  /** Controlled open state (parent owns; spec 02 wires this up on Dashboard). */
  open: boolean;
  /** Called when the modal closes (any reason). */
  onOpenChange: (open: boolean) => void;
  /** Which DOK level's explainer this is. Used for analytics + a11y labels. */
  dokLevel: DokLevel;
  /**
   * Ordered list of screen elements (typically <ExplainerScreen>). The shell
   * renders one at a time, switched by currentStep state held internally.
   */
  screens: React.ReactElement[];
  /**
   * Called exactly once per logical close (Finish OR X OR Escape OR overlay).
   * Wire to useHasSeenExplainer().markSeen so the modal does not auto-show
   * again. Idempotency is guaranteed by the orchestrator's ref guard.
   */
  onCompleteSeen?: () => void;
}
