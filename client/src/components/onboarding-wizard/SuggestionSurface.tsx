import { Sparkles } from 'lucide-react';
import type { WizardPersona } from '@/brand/types';

interface SuggestionSurfaceProps {
  /** Brand persona (read from the brand config slot — no brand conditionals here). */
  persona: WizardPersona;
  /** Rail heading above the chips, e.g. "Suggestions for Out of Scope". */
  title: string;
  /** Optional italic helper under the title, e.g. "Select from below or type your own". */
  helper?: string;
  suggestions: string[];
  loading: boolean;
  /** Tap-to-accept a chip; the accepted phrase leaves the list upstream. */
  onAccept: (phrase: string) => void;
  /** Single refresh affordance ("Refine"). Disables after one use per step. */
  onRefresh: () => void;
  refreshUsed: boolean;
  /** Label for the refresh affordance, e.g. "Refine Out of Scope". */
  refreshLabel: string;
  /** Optional slot rendered above the chips (e.g. the step-1 pro-tip card). */
  children?: React.ReactNode;
}

/**
 * Wizard suggestion rail (04-suggestion-steps FR3). Persona header + a chip
 * list (tap to accept) + a single refresh affordance. Per the screen2/screen3
 * restyle mocks. Empty + not-loading renders no chip section (silent empty
 * state — no empty shell, no error wall); the persona header always remains.
 */
export function SuggestionSurface({
  persona,
  title,
  helper,
  suggestions,
  loading,
  onAccept,
  onRefresh,
  refreshUsed,
  refreshLabel,
  children,
}: SuggestionSurfaceProps) {
  const { Mascot } = persona;
  const hasChips = suggestions.length > 0;

  return (
    <div className="flex h-full w-full flex-col px-8 py-6" data-testid="suggestion-surface">
      {/* Persona header — mascot (when present) + name label (always). */}
      <div className="flex items-center gap-3">
        {Mascot ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card shadow-card">
            <Mascot className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground shadow-card">
            {persona.name.slice(0, 2)}
          </span>
        )}
        <span className="text-[15px] font-bold text-foreground" data-testid="persona-name">
          {persona.name}
        </span>
      </div>

      {/* Optional pro-tip / context slot. */}
      {children}

      {/* Chip section — only when loading or when there are chips. */}
      {(loading || hasChips) && (
        <div className="mt-auto pt-10">
          <h3 className="m-0 text-[18px] font-bold leading-tight text-foreground">{title}</h3>
          {helper && (
            <p className="m-0 mt-1 font-serif text-[14px] italic text-muted-foreground">{helper}</p>
          )}

          {loading && !hasChips ? (
            <p
              className="m-0 mt-5 font-serif text-[14px] italic text-muted-light"
              data-testid="suggestions-loading"
            >
              Thinking of a few ideas…
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2.5" data-testid="suggestion-chips">
              {suggestions.map((phrase) => (
                <button
                  key={phrase}
                  type="button"
                  data-testid="suggestion-chip"
                  onClick={() => onAccept(phrase)}
                  className="rounded-full bg-card px-4 py-2 text-[14px] text-foreground shadow-card transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}

          {/* Single refresh affordance, disabled after one use. */}
          <button
            type="button"
            data-testid="suggestion-refresh"
            onClick={onRefresh}
            disabled={refreshUsed || loading}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-[13px] text-foreground shadow-card transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <span>{refreshLabel}</span>
            <Sparkles size={14} className="text-primary" />
          </button>
        </div>
      )}
    </div>
  );
}
