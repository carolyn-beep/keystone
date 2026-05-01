/**
 * Brainlift Central wordmark.
 *
 * Spec 01 skeleton: a single span containing "Brainlift Central" with a
 * variant-suffixed class in the parallel `brainlift-` namespace. Final
 * typography is a Spec 02 design pass (parallel to the AlphaX
 * `alphax-nameplate-*` treatment but with its own tokens).
 */

import type { WordmarkProps } from '../types';

function variantClass(variant: WordmarkProps['variant']): string {
  if (variant === 'hero') return 'brainlift-wordmark brainlift-wordmark-hero';
  if (variant === 'mobile') return 'brainlift-wordmark brainlift-wordmark-mobile lg:hidden';
  // 'compact' -- sidebar nameplate, base class only
  return 'brainlift-wordmark';
}

export function Wordmark({ variant }: WordmarkProps) {
  if (variant === 'compact') {
    return <span className={variantClass(variant)}>Brainlift Central</span>;
  }
  return <h1 className={variantClass(variant)}>Brainlift Central</h1>;
}
