/**
 * SectionLabel — small-caps tracked label matching the neo-editorial design.
 *
 * Used above headings in explainer screens (e.g. "RUBRIC", "TEMPLATE",
 * "EXAMPLES"). Mirrors the styling used on the AlertDialogTitle in
 * CelebrationModal.tsx.
 */

import type React from 'react';

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel({ children, className }: SectionLabelProps): JSX.Element {
  return (
    <span
      className={[
        'text-[10px] uppercase tracking-[0.35em] font-semibold text-muted-foreground',
        className ?? '',
      ].join(' ').trim()}
    >
      {children}
    </span>
  );
}
