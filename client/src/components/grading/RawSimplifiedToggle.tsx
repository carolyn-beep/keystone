import { useState } from 'react';
import briefIcon from '@/assets/icons/toggle-brief.png';
import deepIcon from '@/assets/icons/toggle-deep.png';

/**
 * Per-item raw/simplified toggle.
 *
 * Each graded item persists two texts: a rewritten/user-facing field and its
 * grader-original `*_raw` field (spec 03). The simplified (rewritten) text is
 * shown by default; the toggle reveals the advanced/original view.
 * State is per-item and session-only.
 *
 * Rendered as a two-segment control reading "Brief" (the simplified rewrite)
 * and "Deep" (the full grader original). Icons are hand-generated engravings:
 * a paper boat skimming the surface for Brief, a deep-sea diving helmet for
 * Deep.
 *
 * The pure helpers below are exported for unit testing without React/DOM.
 */

export type ViewMode = 'simplified' | 'raw';

/** The view shown before any user interaction: simplified. */
export const DEFAULT_VIEW: ViewMode = 'simplified';

/**
 * Whether the toggle should be offered at all. There is nothing to toggle to
 * when there is no distinct raw text (older rows where `*_raw` is null, or a
 * raw value identical to the rewritten value).
 */
export function hasDistinctRaw(simplified: string | null, raw: string | null): boolean {
  if (!raw) return false;
  if (!simplified) return false;
  return raw.trim() !== simplified.trim();
}

/**
 * Resolve which text to display given the active view, falling back to whatever
 * text exists. Never returns null when at least one text is present.
 */
export function selectText(
  view: ViewMode,
  simplified: string | null,
  raw: string | null,
): string {
  if (view === 'raw') return raw ?? simplified ?? '';
  return simplified ?? raw ?? '';
}

export interface RawSimplifiedToggleProps {
  simplified: string | null;
  raw: string | null;
  view: ViewMode;
  onToggle: () => void;
  className?: string;
}

/** The two segments, in display order. */
const SEGMENTS: { mode: ViewMode; label: string; icon: string; title: string }[] = [
  {
    mode: 'simplified',
    label: 'Brief',
    icon: briefIcon,
    title: 'Brief: the plain-language version',
  },
  {
    mode: 'raw',
    label: 'Deep',
    icon: deepIcon,
    title: 'Deep: the full grader analysis',
  },
];

/**
 * Two-segment control rendered in an item's top corner. Reads "Brief / Deep"
 * with a recessed track and a raised, elevated active segment so it reads as a
 * toggle rather than a text link. Renders nothing when there is no distinct raw
 * text to switch to.
 */
export function RawSimplifiedToggle({
  simplified,
  raw,
  view,
  onToggle,
  className,
}: RawSimplifiedToggleProps) {
  if (!hasDistinctRaw(simplified, raw)) return null;

  return (
    <div
      role="group"
      aria-label="Reading depth"
      className={`inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.07)] ${className ?? ''}`}
    >
      {SEGMENTS.map((seg) => {
        const active = view === seg.mode;
        return (
          <button
            key={seg.mode}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!active) onToggle();
            }}
            aria-pressed={active}
            title={seg.title}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 ${
              active
                ? 'bg-card-elevated text-foreground shadow-sm cursor-default'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <img
              src={seg.icon}
              alt=""
              aria-hidden
              className={`w-[18px] h-[18px] object-contain transition-opacity duration-200 ${
                active ? 'opacity-100' : 'opacity-35'
              }`}
            />
            <span>{seg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Hook owning the per-item view state + the resolved display text. Defaults to
 * the simplified view and exposes a flat API for render sites.
 */
export function useRawSimplified(
  simplified: string | null,
  raw: string | null,
) {
  const [view, setView] = useState<ViewMode>(DEFAULT_VIEW);
  const canToggle = hasDistinctRaw(simplified, raw);
  const text = selectText(view, simplified, raw);
  const toggle = () => setView(v => (v === 'raw' ? 'simplified' : 'raw'));
  return { view, text, canToggle, toggle };
}
