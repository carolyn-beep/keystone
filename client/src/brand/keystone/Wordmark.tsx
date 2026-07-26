/**
 * Keystone wordmark component.
 *
 * Three-span "Alpha" / "x" / "Buddy" structure extracted byte-for-byte from
 * the current `Login.tsx` (hero & mobile variants) and `AppSidebar.tsx`
 * (compact variant). Outer-class behaviour by variant:
 *
 *   - hero    -> `keystone-nameplate-wordmark keystone-wordmark-hero`
 *   - mobile  -> `keystone-nameplate-wordmark keystone-wordmark-mobile lg:hidden`
 *   - compact -> `keystone-nameplate-wordmark` (no suffix; sidebar nameplate)
 *
 * Inner spans (`keystone-nameplate-word`, `keystone-nameplate-x`) and the visible
 * text ("Alpha", "x", "Buddy") match the existing JSX exactly. The CSS
 * classes live in `client/src/index.css` and are untouched in spec 01.
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
