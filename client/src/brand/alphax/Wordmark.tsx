/**
 * AlphaX wordmark component.
 *
 * Three-span "Alpha" / "x" / "Buddy" structure extracted byte-for-byte from
 * the current `Login.tsx` (hero & mobile variants) and `AppSidebar.tsx`
 * (compact variant). Outer-class behaviour by variant:
 *
 *   - hero    -> `alphax-nameplate-wordmark alphax-wordmark-hero`
 *   - mobile  -> `alphax-nameplate-wordmark alphax-wordmark-mobile lg:hidden`
 *   - compact -> `alphax-nameplate-wordmark` (no suffix; sidebar nameplate)
 *
 * Inner spans (`alphax-nameplate-word`, `alphax-nameplate-x`) and the visible
 * text ("Alpha", "x", "Buddy") match the existing JSX exactly. The CSS
 * classes live in `client/src/index.css` and are untouched in spec 01.
 */

import type { WordmarkProps } from '../types';

function variantClass(variant: WordmarkProps['variant']): string {
  if (variant === 'hero') {
    return 'alphax-nameplate-wordmark alphax-wordmark-hero';
  }
  if (variant === 'mobile') {
    return 'alphax-nameplate-wordmark alphax-wordmark-mobile lg:hidden';
  }
  // 'compact' -- sidebar nameplate uses the base class only
  return 'alphax-nameplate-wordmark';
}

export function Wordmark({ variant }: WordmarkProps) {
  // Hero & mobile variants are h1 elements (matches Login.tsx); the compact
  // variant is rendered inside an existing wrapper in AppSidebar so it stays
  // a span to avoid double-h1 in the sidebar.
  if (variant === 'compact') {
    return (
      <span className={variantClass(variant)}>
        <span className="alphax-nameplate-word">Alpha</span>
        <span className="alphax-nameplate-x" aria-hidden="true">x</span>
        <span className="alphax-nameplate-word">Buddy</span>
      </span>
    );
  }

  return (
    <h1 className={variantClass(variant)}>
      <span className="alphax-nameplate-word">Alpha</span>
      <span className="alphax-nameplate-x">x</span>
      <span className="alphax-nameplate-word">Buddy</span>
    </h1>
  );
}
