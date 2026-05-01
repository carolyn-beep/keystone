/**
 * Brainlift Central wordmark.
 *
 * Neo-editorial treatment (per the `neo-editorial-design` skill): a serif
 * primary mark for "Brainlift" plus an uppercase, letter-spaced "Central"
 * micro-label. Hero variant is the largest (login page); mobile variant is
 * the centered fallback shown on narrow viewports; compact variant is the
 * sidebar nameplate where the wordmark sits next to a small avatar.
 *
 * The two-part structure is shape-only -- both pieces are inside a single
 * outer span/h1 so the `brainlift-wordmark` base class can flex them on a
 * baseline without extra wrappers in the consumer. Final colour and size
 * decisions live in CSS (`client/src/index.css`).
 */

import type { WordmarkProps } from '../types';

function variantClass(variant: WordmarkProps['variant']): string {
  if (variant === 'hero') {
    return 'brainlift-wordmark brainlift-wordmark-hero';
  }
  if (variant === 'mobile') {
    return 'brainlift-wordmark brainlift-wordmark-mobile lg:hidden';
  }
  // 'compact' -- sidebar nameplate, base class only
  return 'brainlift-wordmark';
}

export function Wordmark({ variant }: WordmarkProps) {
  if (variant === 'compact') {
    return (
      <span className={variantClass(variant)}>
        <span className="brainlift-wordmark-primary">Brainlift</span>
        <span className="brainlift-wordmark-secondary">Central</span>
      </span>
    );
  }

  return (
    <h1 className={variantClass(variant)}>
      <span className="brainlift-wordmark-primary">Brainlift</span>
      <span className="brainlift-wordmark-secondary">Central</span>
    </h1>
  );
}
