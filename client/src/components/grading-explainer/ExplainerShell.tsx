/**
 * ExplainerShell — generic modal mechanics for grading explainer flows.
 *
 * The shell owns:
 *   - Radix Dialog primitives (Portal, Overlay, Content) for focus trap,
 *     Escape, aria-modal, scroll lock, focus return.
 *   - The PERSISTENT modal frame (border, surface, shadow, padding). It stays
 *     mounted across screen swaps and animates its own width/height so only the
 *     content fades while the window itself smoothly resizes.
 *   - The persistent footer (Back / step indicator / Next-or-Finish) and the
 *     close button — they live on the frame, so they never fade with content.
 *   - Modal-state context plus a `registerPanelClassName` channel so each
 *     screen can hand the frame its per-screen width / max-height.
 *
 * Transition choreography (see ExplainerPanel below) is a deliberate sequence,
 * NOT a cross-fade:
 *   1. fade current content out
 *   2. measure the next screen, then smoothly resize the window to it
 *   3. fade the next content in
 *
 * Spec: features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EASE_STANDARD,
  PANEL_RESIZE_MS,
  withReducedMotion,
} from './motion-tokens';
import type { ExplainerShellProps } from './types';

interface ShellContextValue {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  /** True while a screen transition is mid-flight (nav is gated). */
  isAnimating: boolean;
  /**
   * Lets the active <ExplainerScreen> hand the persistent frame its per-screen
   * sizing classes (e.g. a wide rubric layout). The frame measures against
   * these to compute its resize target.
   */
  registerPanelClassName: (panelClassName: string | undefined) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

function useShellContext(component: string): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error(`${component} must be rendered inside <ExplainerShell>`);
  }
  return ctx;
}

/** Public hook for child screens to reach the shell (e.g. to register sizing). */
export function useExplainerShell(): ShellContextValue {
  return useShellContext('useExplainerShell');
}

// Persistent frame styling. The default narrow panel; screens may widen it via
// the registered panelClassName (e.g. 'w-[min(...)] max-w-none max-h-[96vh]').
const PANEL_BASE =
  'relative flex w-full max-w-2xl flex-col gap-6 rounded-xl border border-border bg-card p-8 text-foreground shadow-xl';

export function ExplainerShell({
  open,
  onOpenChange,
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onFinish,
  children,
}: ExplainerShellProps): JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        {/* Content is a full-viewport flex centerer. The frame inside resizes
            via its own width/height (not a transform), so centering needs no
            transform of its own. pointer-events pass through everywhere except
            the frame, so backdrop clicks still reach the Overlay and close. */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          data-testid="explainer-shell-content"
        >
          {/* ExplainerPanel holds the transition state. It lives inside Content,
              which Radix unmounts on close, so each open starts fresh. */}
          <ExplainerPanel
            currentStep={currentStep}
            totalSteps={totalSteps}
            onBack={onBack}
            onNext={onNext}
            onFinish={onFinish}
          >
            {children}
          </ExplainerPanel>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface ExplainerPanelProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  children: ReactNode;
}

function ExplainerPanel({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onFinish,
  children,
}: ExplainerPanelProps): JSX.Element {
  const reducedMotion = useReducedMotion() ?? false;

  // Per-screen sizing the active screen registers; the frame measures against
  // it to compute its resize target.
  const [panelClassName, setPanelClassName] = useState<string | undefined>(undefined);
  const registerPanelClassName = useCallback((next: string | undefined) => {
    setPanelClassName((prev) => (prev === next ? prev : next));
  }, []);

  // displayStep / renderedChildren lag currentStep: they only swap to the new
  // screen at the midpoint of the transition (after the old content has faded
  // out), so the window can resize around invisible content.
  const [displayStep, setDisplayStep] = useState(currentStep);
  const [renderedChildren, setRenderedChildren] = useState<ReactNode>(children);
  const [frameStyle, setFrameStyle] = useState<CSSProperties>({});
  const [isAnimating, setIsAnimating] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  // Content opacity is driven imperatively via the Web Animations API rather
  // than React/CSS, so render timing during the transition can't interfere with
  // the fade (CSS-transition start-value timing is fragile across re-renders).
  const contentRef = useRef<HTMLDivElement>(null);
  const childrenRef = useRef<ReactNode>(children);
  childrenRef.current = children;
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;
  const runIdRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // The three-phase transition, kicked off whenever currentStep diverges from
  // what's on screen.
  useEffect(() => {
    if (currentStep === displayStep) return;

    const runId = ++runIdRef.current;
    clearTimers();
    setIsAnimating(true);

    const resize = withReducedMotion(PANEL_RESIZE_MS, reducedMotion);

    // Phase 1 — hide the current content. Set the resting opacity to 0 so it
    // stays hidden through the resize.
    const content = contentRef.current;
    if (content) {
      content.style.opacity = '0';
      // Fade-out disabled. To restore: re-import FADE_OUT_MS, add
      //   const fadeOut = withReducedMotion(FADE_OUT_MS, reducedMotion);
      // then animate here and set the swap delay below to `fadeOut + 10`:
      //   if (fadeOut > 0) {
      //     content.animate([{ opacity: 1 }, { opacity: 0 }],
      //       { duration: fadeOut, easing: EASE_STANDARD });
      //   }
    }

    // No fade-out, so swap on the next frame instead of waiting out a duration.
    const t1 = window.setTimeout(() => {
      if (runIdRef.current !== runId) return;

      const el = frameRef.current;
      const fromW = el?.offsetWidth ?? 0;
      const fromH = el?.offsetHeight ?? 0;

      // Phase 2a — lock the frame at its current size and swap in the next
      // screen. The content stays at resting opacity 0 (set above), so the swap
      // and the resize that follows happen while it's invisible.
      flushSync(() => {
        setFrameStyle({ width: fromW, height: fromH });
        setRenderedChildren(childrenRef.current);
        setDisplayStep(currentStepRef.current);
      });

      // Phase 2b — measure the next screen's natural size. Clearing the inline
      // lock momentarily lets the panelClassName + content drive size; this is
      // synchronous (no paint between) so the frame never flashes.
      let toW = fromW;
      let toH = fromH;
      if (el) {
        const savedW = el.style.width;
        const savedH = el.style.height;
        el.style.width = '';
        el.style.height = '';
        toW = el.offsetWidth;
        toH = el.offsetHeight;
        el.style.width = savedW;
        el.style.height = savedH;
      }

      // Phase 2c — animate the frame from its locked size to the measured one,
      // one frame later so the browser registers the start value first.
      requestAnimationFrame(() => {
        if (runIdRef.current !== runId) return;
        setFrameStyle({
          width: toW,
          height: toH,
          transition: `width ${resize}ms ${EASE_STANDARD}, height ${resize}ms ${EASE_STANDARD}`,
        });

        const t2 = window.setTimeout(() => {
          if (runIdRef.current !== runId) return;

          // Phase 3 — reveal the next content instantly once the resize ends
          // (no fade-in; keeps the flow snappy). Then release the size lock back
          // to natural sizing (target == natural, so no jump) and re-enable nav.
          const c = contentRef.current;
          if (c) c.style.opacity = '1';
          setFrameStyle({});
          setIsAnimating(false);
        }, resize + 30);
        timersRef.current.push(t2);
      });
    }, 16);
    timersRef.current.push(t1);
    // Only re-run when the target step changes; everything else is read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const ctx = useMemo<ShellContextValue>(
    () => ({
      currentStep: displayStep,
      totalSteps,
      onBack,
      onNext,
      onFinish,
      isAnimating,
      registerPanelClassName,
    }),
    [displayStep, totalSteps, onBack, onNext, onFinish, isAnimating, registerPanelClassName],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div
        ref={frameRef}
        style={frameStyle}
        className={cn(PANEL_BASE, 'pointer-events-auto overflow-hidden', panelClassName)}
        data-testid="explainer-panel"
      >
        <ExplainerCloseButton />

        {/* Content slot — only this fades (opacity driven imperatively). */}
        <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
          {renderedChildren}
        </div>

        <ExplainerFooter className="shrink-0" />
      </div>
    </ShellContext.Provider>
  );
}

/**
 * Dismiss button. Positioned absolutely; the rendering panel must have
 * `position: relative` so the X anchors to its top-right corner.
 */
export function ExplainerCloseButton(): JSX.Element {
  return (
    <DialogPrimitive.Close
      aria-label="Close"
      className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <X className="h-4 w-4" />
    </DialogPrimitive.Close>
  );
}

/**
 * Back / "Step N of total" + dots / Next-or-Finish row. Rendered once on the
 * persistent frame, so it never fades with the content and its step dots
 * transition smoothly via `transition-colors` as the active step changes.
 */
export function ExplainerFooter({ className }: { className?: string }): JSX.Element {
  const { currentStep, totalSteps, onBack, onNext, onFinish, isAnimating } =
    useShellContext('ExplainerFooter');
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep >= totalSteps - 1;

  return (
    <footer
      className={[
        'flex items-center justify-between gap-4 border-t border-border pt-4 text-foreground',
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      <button
        type="button"
        onClick={() => {
          if (!isAnimating) onBack();
        }}
        disabled={isFirstStep}
        aria-disabled={isFirstStep}
        className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-sidebar disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="explainer-back-button"
      >
        Back
      </button>

      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Step {currentStep + 1} of {totalSteps}
        </span>
        <StepDots currentStep={currentStep} totalSteps={totalSteps} />
      </div>

      {isLastStep ? (
        <button
          type="button"
          onClick={() => {
            if (!isAnimating) onFinish();
          }}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-[color:var(--on-primary-hex)] transition-colors hover:bg-[color:var(--primary-hover-hex)]"
          data-testid="explainer-finish-button"
        >
          Finish
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!isAnimating) onNext();
          }}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-[color:var(--on-primary-hex)] transition-colors hover:bg-[color:var(--primary-hover-hex)]"
          data-testid="explainer-next-button"
        >
          Next
        </button>
      )}
    </footer>
  );
}

interface StepDotsProps {
  currentStep: number;
  totalSteps: number;
}

function StepDots({ currentStep, totalSteps }: StepDotsProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
      className="flex items-center gap-2"
      data-testid="explainer-step-dots"
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const isActive = i === currentStep;
        return (
          <span
            key={i}
            aria-hidden="true"
            data-active={isActive}
            className={[
              'h-2 w-2 rounded-full transition-colors duration-300',
              isActive ? 'bg-primary' : 'bg-border',
            ].join(' ')}
          />
        );
      })}
    </div>
  );
}
