/**
 * Keystone wordmark component.
 *
 * Nameplate wordmark extracted from `Login.tsx` (hero & mobile variants) and
 * `AppSidebar.tsx` (compact variant). Outer-class behaviour by variant:
 *
 *   - hero    -> `keystone-nameplate-wordmark keystone-wordmark-hero`
 *   - mobile  -> `keystone-nameplate-wordmark keystone-wordmark-mobile lg:hidden`
 *   - compact -> `keystone-nameplate-wordmark` (no suffix; sidebar nameplate)
 *
 * The inner span (`keystone-nameplate-word`) carries the visible product name.
 * The CSS classes live in `client/src/index.css`.
 */

import type { WordmarkProps } from '../types';

function variantClass(variant: WordmarkProps['variant']): string {
  if (variant === 'hero') {
    return 'keystone-nameplate-wordmark keystone-wordmark-hero';
  }
  if (variant === 'mobile') {
    return 'keystone-nameplate-wordmark keystone-wordmark-mobile lg:hidden';
  }
  // 'compact' -- sidebar nameplate uses the base class only
  return 'keystone-nameplate-wordmark';
}

export function Wordmark({ variant }: WordmarkProps) {
  // Hero & mobile variants are h1 elements (matches Login.tsx); the compact
  // variant is rendered inside an existing wrapper in AppSidebar so it stays
  // a span to avoid double-h1 in the sidebar.
  if (variant === 'compact') {
    return (
      <span className={variantClass(variant)}>
        <span className="keystone-nameplate-word">Keystone</span>
      </span>
    );
  }

  return (
    <h1 className={variantClass(variant)}>
      <span className="keystone-nameplate-word">Keystone</span>
    </h1>
  );
}
