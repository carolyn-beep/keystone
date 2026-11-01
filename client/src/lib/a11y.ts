import type { KeyboardEvent } from 'react';

/**
 * Keyboard activation for an element that behaves like a button but cannot be
 * a <button> (a card that contains its own buttons, a row that opens a
 * detail view). Enter and Space trigger `onActivate`, matching native button
 * behaviour. Keys that originate from a nested control are ignored so
 * pressing Enter on an inner button does not also activate the container.
 *
 * Pair with `role="button"` and `tabIndex={0}` on the element.
 */
export function activateOnKey<T extends HTMLElement = HTMLElement>(onActivate: () => void) {
  return (event: KeyboardEvent<T>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };
}

/**
 * The full prop set for a button-like container: role, tab stop, click and
 * keyboard activation. Spread it onto the element and add an `aria-label`
 * when the visible content would not make a sensible accessible name.
 */
export function buttonLikeProps<T extends HTMLElement = HTMLElement>(onActivate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: activateOnKey<T>(onActivate),
  };
}
