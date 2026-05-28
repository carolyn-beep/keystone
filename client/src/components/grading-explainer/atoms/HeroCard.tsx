/**
 * HeroCard — contained parchment hero block used at the top of explainer
 * screens (Screen 1 illustration, Screen 2 rubric grid, etc.).
 *
 * Single-purpose wrapper: bg-card surface, subtle border + inset shadow,
 * generous padding. Per-screen styling tweaks come via `className`.
 */

import type React from 'react';

interface HeroCardProps {
  children: React.ReactNode;
  className?: string;
}

export function HeroCard({ children, className }: HeroCardProps): JSX.Element {
  return (
    <div
      className={[
        'rounded-lg border border-border bg-card p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
        className ?? '',
      ].join(' ').trim()}
    >
      {children}
    </div>
  );
}
