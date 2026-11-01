/**
 * GradingExplainer — orchestrator for the generic explainer modal flow.
 *
 * Owns:
 *   - currentStep state (resets to 0 when reopened)
 *   - "complete-seen" semantics: onCompleteSeen fires exactly once per
 *     logical close, regardless of source (Finish button, X, Escape,
 *     overlay click). Ref-guarded.
 *
 * Receives:
 *   - open / onOpenChange — standard controlled-modal pattern; parent
 *     decides when to open (e.g. on first visit to a tab).
 *   - dokLevel — for future analytics / a11y labels.
 *   - screens — ordered array of screen elements (typically ExplainerScreen).
 *   - onCompleteSeen — wired to useHasSeenExplainer().markSeen by parent.
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExplainerShell } from './ExplainerShell';
import type { GradingExplainerProps } from './types';

export function GradingExplainer({
  open,
  onOpenChange,
  dokLevel,
  screens,
  onCompleteSeen,
}: GradingExplainerProps): JSX.Element | null {
  const [currentStep, setCurrentStep] = useState(0);
  const completeSeenFiredRef = useRef(false);

  // Reset step + fire-once guard whenever the modal transitions to open.
  useEffect(() => {
    if (open) {
      setCurrentStep(0);
      completeSeenFiredRef.current = false;
    }
  }, [open]);

  const fireCompleteSeenOnce = useCallback(() => {
    if (!completeSeenFiredRef.current) {
      completeSeenFiredRef.current = true;
      onCompleteSeen?.();
    }
  }, [onCompleteSeen]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Any close path (X, Escape, overlay) flows through here.
        fireCompleteSeenOnce();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, fireCompleteSeenOnce],
  );

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStep((s) => Math.min(screens.length - 1, s + 1));
  }, [screens.length]);

  const handleFinish = useCallback(() => {
    fireCompleteSeenOnce();
    onOpenChange(false);
  }, [fireCompleteSeenOnce, onOpenChange]);

  // Defensive: don't render with zero screens. Avoids index errors and
  // keeps the component a no-op for misconfigured consumers.
  if (screens.length === 0) {
    return null;
  }

  // Clamp currentStep in case `screens` shrinks between renders.
  const safeStep = Math.min(currentStep, screens.length - 1);

  return (
    <ExplainerShell
      open={open}
      onOpenChange={handleOpenChange}
      currentStep={safeStep}
      totalSteps={screens.length}
      onBack={handleBack}
      onNext={handleNext}
      onFinish={handleFinish}
    >
      <div data-dok-level={dokLevel} className="flex min-h-0 flex-1 flex-col">
        {screens[safeStep]}
      </div>
    </ExplainerShell>
  );
}
