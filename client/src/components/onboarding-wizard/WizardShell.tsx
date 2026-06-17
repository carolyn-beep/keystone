import { useRef, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { WIZARD_STEPS, FIRST_STEP, LAST_STEP } from './wizard-machine';

interface WizardShellProps {
  /** Active step id (1..6). */
  step: number;
  /** Header eyebrow + title shown top-left (per screen1 restyle). */
  title: string;
  subtitle?: string;
  /** Right-rail slot. Empty/static in this spec; specs 04-06 fill it. */
  rail?: ReactNode;
  /** Back control. Hidden on the first step. */
  onBack?: () => void;
  children: ReactNode;
}

// Direction-aware step transition: enter slides in from the travel direction,
// exit is softer and quicker than the enter (per make-interfaces-feel-better).
const stepVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 28 * direction }),
  center: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', duration: 0.35, bounce: 0 },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: -16 * direction,
    transition: { duration: 0.14, ease: 'easeIn' },
  }),
};

// The rail trails the main column slightly (stagger) and moves on y only.
const railVariants: Variants = {
  enter: { opacity: 0, y: 10 },
  center: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.35, bounce: 0, delay: 0.08 },
  },
  exit: { opacity: 0, y: 6, transition: { duration: 0.14, ease: 'easeIn' } },
};

/**
 * Full-screen onboarding chrome (features/ux-redesign/onboarding-wizard).
 * Per the screen mocks: the main column (header + step body + progress) is a
 * floating rounded panel inset from the page edges, lifted by a soft shadow;
 * the right rail runs the full viewport height on the page surface behind it.
 * No 1px chrome borders. Step changes slide/fade via framer-motion.
 */
export function WizardShell({ step, title, subtitle, rail, onBack, children }: WizardShellProps) {
  const showBack = step > FIRST_STEP && typeof onBack === 'function';

  // Travel direction for the slide (1 = forward, -1 = back), computed against
  // the previously rendered step.
  const prevStepRef = useRef(step);
  const direction = step >= prevStepRef.current ? 1 : -1;
  prevStepRef.current = step;

  return (
    <div className="h-screen overflow-hidden bg-sidebar text-foreground flex">
      {/* Main panel: flush with the viewport on left/top/bottom; the rounded,
          shadow-lifted edge is the encounter with the rail */}
      <div className="flex-1 min-w-0 flex">
        <div className="flex-1 min-w-0 flex flex-col bg-background lg:rounded-r-2xl shadow-wizard-panel overflow-hidden">
          {/* Panel header — separated from the body by a soft cast shadow */}
          <header className="relative z-10 flex items-center justify-between px-8 sm:px-10 py-6 shadow-wizard-header">
            <div className="flex items-center min-w-0">
              {/* Back arrow takes no space on step 1; it grows in (width +
                  fade) when back-navigation becomes available. */}
              <AnimatePresence initial={false}>
                {showBack && (
                  <motion.button
                    key="back"
                    type="button"
                    onClick={onBack}
                    data-testid="wizard-back"
                    aria-label="Back"
                    initial={{ width: 0, marginRight: 0, opacity: 0, scale: 0.25 }}
                    animate={{
                      width: 36,
                      marginRight: 16,
                      opacity: 1,
                      scale: 1,
                      transition: { type: 'spring', duration: 0.35, bounce: 0 },
                    }}
                    exit={{
                      width: 0,
                      marginRight: 0,
                      opacity: 0,
                      scale: 0.25,
                      transition: { duration: 0.15, ease: 'easeIn' },
                    }}
                    className="flex h-9 shrink-0 items-center justify-center overflow-hidden rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                  >
                    <ChevronLeft size={18} />
                  </motion.button>
                )}
              </AnimatePresence>
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={title}
                  className="min-w-0"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0, transition: { type: 'spring', duration: 0.3, bounce: 0 } }}
                  exit={{ opacity: 0, x: -6, transition: { duration: 0.1, ease: 'easeIn' } }}
                >
                  <h1 className="text-[17px] font-bold leading-tight m-0 truncate">{title}</h1>
                  {subtitle && (
                    <p className="font-serif italic text-[13px] text-muted-foreground m-0 mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground shrink-0">
              Step {step} / {LAST_STEP}
            </span>
          </header>

          {/* Step body — sized to the viewport; steps pin their CTA with
              mt-auto. overflow-y-auto is a tiny-window failsafe only: step
              content is laid out to fit without scrolling. */}
          <main className="flex-1 min-w-0 px-8 sm:px-10 py-6 overflow-y-auto overflow-x-clip">
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex min-h-full flex-col"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Progress — thin segmented bar pinned to the panel foot */}
          <div className="px-8 sm:px-10 pb-5">
            <div className="flex gap-1.5" aria-hidden>
              {WIZARD_STEPS.map((s) => (
                <span
                  key={s.id}
                  className="h-1 flex-1 rounded-full transition-colors duration-300"
                  style={{ backgroundColor: s.id <= step ? 'var(--primary-hex)' : 'var(--border-hex)' }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right rail: full viewport height on the page surface, persona at top */}
      <aside
        className="hidden lg:flex w-[34%] max-w-[460px] shrink-0"
        data-testid="wizard-rail"
        aria-hidden={!rail}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={step}
            className="flex h-full w-full"
            variants={railVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {rail}
          </motion.div>
        </AnimatePresence>
      </aside>
    </div>
  );
}
