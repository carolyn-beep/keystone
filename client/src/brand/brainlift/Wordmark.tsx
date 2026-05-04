/**
 * Brainlift Central wordmark.
 *
 * Single-piece serif treatment matching the BrainliftCentralLandingPage
 * hero/nav: `Brainlift Central` rendered in Libre Baskerville. Variants
 * change size only -- the type weight and tracking stay consistent so the
 * brand reads the same across the login hero, the mobile fallback, and the
 * sidebar nameplate.
 */

import type { WordmarkProps } from '../types';

function variantClass(variant: WordmarkProps['variant']): string {
  if (variant === 'hero') {
    return 'brainlift-wordmark brainlift-wordmark-hero';
  }
  if (variant === 'mobile') {
    return 'brainlift-wordmark brainlift-wordmark-mobile lg:hidden';
  }
  return 'brainlift-wordmark brainlift-wordmark-compact';
}

export function Wordmark({ variant }: WordmarkProps) {
  if (variant === 'compact') {
    return <span className={variantClass(variant)}>Brainlift Central</span>;
  }

  return <h1 className={variantClass(variant)}>Brainlift Central</h1>;
}
