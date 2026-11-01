/**
 * ScoreBadge — chromatic 0-5 score chip used in DOK1 rubric screens (2/3/4).
 *
 * Rounded-square (NOT pill/circle) so the number reads like a printed score
 * from a Victorian-era reference work, matching the neo-editorial language.
 * The number is the visual hero — large serif numeral with a thin chromatic
 * outline and a soft tinted fill.
 *
 *   5  great           success      (parchment-friendly olive)
 *   4  good            info         (slate blue)
 *   3  partial         secondary    (deep teal)
 *   2  weak            warning      (amber)
 *   1  failed          danger       (oxide red)
 *   0  not gradeable   news/muted   (warm grey)
 *
 * Colors come from CSS custom properties defined in client/src/index.css
 * (see --success-hex / --info-hex / etc.).
 */

import type { RubricScore } from '../types';

interface ScoreBadgeProps {
  score: RubricScore;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface BadgeColors {
  bg: string;
  fg: string;
  border: string;
  label: string;
}

function colorsFor(score: RubricScore): BadgeColors {
  switch (score) {
    case 5:
      return { bg: 'var(--success-soft-hex)', fg: 'var(--success-hex)', border: 'var(--success-hex)', label: 'Score 5' };
    case 4:
      return { bg: 'var(--info-soft-hex)', fg: 'var(--info-hex)', border: 'var(--info-hex)', label: 'Score 4' };
    case 3:
      return { bg: 'var(--secondary-soft-hex)', fg: 'var(--secondary-hex)', border: 'var(--secondary-hex)', label: 'Score 3' };
    case 2:
      return { bg: 'var(--warning-soft-hex)', fg: 'var(--warning-hex)', border: 'var(--warning-hex)', label: 'Score 2' };
    case 1:
      return { bg: 'var(--danger-soft-hex)', fg: 'var(--danger-hex)', border: 'var(--danger-hex)', label: 'Score 1' };
    case 0:
    default:
      return { bg: 'var(--news-soft-hex)', fg: 'var(--news-hex)', border: 'var(--news-hex)', label: 'Non-gradeable' };
  }
}

const SIZE_CLASS: Record<NonNullable<ScoreBadgeProps['size']>, string> = {
  sm: 'h-8 w-8 text-base rounded-md',
  md: 'h-12 w-12 text-2xl rounded-md',
  lg: 'h-16 w-16 text-3xl rounded-lg',
};

export function ScoreBadge({ score, size = 'md', className }: ScoreBadgeProps): JSX.Element {
  const colors = colorsFor(score);
  const sizeClass = SIZE_CLASS[size];
  // Non-gradeable renders as a dash inside the badge to signal "off-scale";
  // aria-label disambiguates for screen readers.
  const display = score === 0 ? '-' : String(score);

  return (
    <span
      className={[
        'inline-flex items-center justify-center border font-serif font-semibold tabular-nums leading-none',
        sizeClass,
        className ?? '',
      ].join(' ').trim()}
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        borderColor: colors.border,
      }}
      aria-label={colors.label}
      data-score={score}
    >
      {display}
    </span>
  );
}
