import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { WIZARD_STEPS, FIRST_STEP, LAST_STEP } from './wizard-machine';

interface WizardShellProps {
  /** Active step id (1..7). */
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

/**
 * Full-screen onboarding chrome (features/ux-redesign/onboarding-wizard).
 * Renders the editorial header, an optional right rail, and a thin progress
 * footer. No AppShell / sidebar — the wizard lives outside the app shell.
 */
export function WizardShell({ step, title, subtitle, rail, onBack, children }: WizardShellProps) {
  const showBack = step > FIRST_STEP && typeof onBack === 'function';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-8 sm:px-12 py-6 border-b border-border">
        <div className="flex items-center gap-4 min-w-0">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              data-testid="wizard-back"
              aria-label="Back"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <span className="h-9 w-9 shrink-0" aria-hidden />
          )}
          <div className="min-w-0">
            <h1 className="text-[17px] font-bold leading-tight m-0 truncate">{title}</h1>
            {subtitle && (
              <p className="font-serif italic text-[13px] text-muted-foreground m-0 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground shrink-0">
          Step {step} / {LAST_STEP}
        </span>
      </header>

      {/* Body: main column + right rail (rail empty in this spec) */}
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 px-8 sm:px-12 py-12">{children}</main>
        <aside
          className="hidden lg:flex w-[34%] max-w-[460px] shrink-0 border-l border-border bg-sidebar"
          data-testid="wizard-rail"
          aria-hidden={!rail}
        >
          {rail}
        </aside>
      </div>

      {/* Progress footer — segmented bar across the 7 steps */}
      <footer className="px-8 sm:px-12 py-4 border-t border-border">
        <div className="flex gap-1.5" aria-hidden>
          {WIZARD_STEPS.map((s) => (
            <span
              key={s.id}
              className="h-1 flex-1 rounded-full transition-colors duration-300"
              style={{ backgroundColor: s.id <= step ? 'var(--primary-hex)' : 'var(--border-hex)' }}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
