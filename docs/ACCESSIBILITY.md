# Accessibility

Target: **WCAG 2.2 AA** for everything a student or admin can reach. This page says what is enforced automatically, what is checked by hand, and what is still open. It is written so the next person can tell the difference between "the CI says it is fine" and "someone actually tried it with a keyboard".

## What CI enforces

Three gates run on every push (`.github/workflows/ci.yml`):

| Gate | Command | What it catches |
|---|---|---|
| JSX accessibility lint | `npm run lint:a11y` | Click handlers on non-interactive elements, missing keyboard handlers, labels not tied to controls, invalid ARIA attributes and roles, list and menu semantics. Rule set: `eslint-plugin-jsx-a11y` recommended, configured in `eslint.a11y.config.mjs`. |
| axe-core on rendered cards | part of `npm test` (`client/src/components/chat/__tests__/a11y.test.ts`) | WCAG A/AA structure rules on the server-rendered markup of the chat cards: accessible names, ARIA validity, form labels, hidden interactive content. Helper in `client/src/test/a11y.ts`. |
| Design token contrast | part of `npm test` (`client/src/__tests__/design-token-contrast.test.ts`) | Every text colour at 4.5:1 or better on every surface, and every `*-foreground` on its fill, in both themes and in both token systems (HSL for Tailwind, hex for inline styles). |

What these gates cannot see: focus order, focus visibility, keyboard traps, live-region timing, zoom and reflow, and anything that needs a real browser. Those are on the manual list below.

### The one rule turned off on purpose

`jsx-a11y/no-autofocus` is off. Every `autoFocus` in the app is on a field the user just opened: a dialog, an inline rename, the composer. Moving focus into a dialog the user opened is the WAI-ARIA dialog pattern. The rule targets autofocus on page load, which disorients screen-reader users, and the app does not do that. If someone adds a page-load autofocus, this is the place to notice.

## Conventions

- **A container that acts like a button but holds other buttons** (a card that opens a detail view and has its own action bar) uses `buttonLikeProps()` from `client/src/lib/a11y.ts`: `role="button"`, `tabIndex={0}`, click, and Enter/Space activation that ignores keys from nested controls. Give it an `aria-label` when the visible content would not make a sensible name.
- **A plain action** is a `<button type="button">`. Do not reach for a div.
- **Hand-rolled overlays** (anything that is not a Radix dialog) get `useEscapeKey()` from `client/src/hooks/use-escape-key.ts` so Escape closes them, `role="presentation"` on the backdrop, and `role="dialog"` with `aria-modal="true"` and an accessible name on the panel. The backdrop closes only when the click lands on the backdrop itself, so the panel never needs a `stopPropagation` wrapper.
- **Click-to-dismiss and click-to-edit shortcuts for the mouse** are fine when the keyboard has an equivalent control. Mark the element `role="presentation"` (or, on a heading or paragraph that cannot take that role, an inline eslint-disable naming the equivalent control).
- **Group labels for button groups** (star ratings, yes/no) are a `<span id>` plus `role="group" aria-labelledby` on the container, not a `<label>`, because a label must point at a single control.
- **Status colours as text** (`text-warning`, `text-success`, `tokens.warning`) are tuned to clear 4.5:1 on every surface. If a new surface token is added, add it to the contrast test's surface lists.
- **Motion**: `prefers-reduced-motion: reduce` collapses every animation and transition to near-zero globally (`client/src/index.css`). The Research Stream additionally removes items immediately instead of animating them out.

## Manual checklist (before a release)

Run with the keyboard only, then with VoiceOver (macOS) or NVDA (Windows), in both themes:

1. Tab through the home page, a document's grading view, the research stream, the Second Brain tabs, and the chat. Focus is always visible and never trapped.
2. Open and close every modal and drawer with the keyboard. Focus lands inside on open and returns to the trigger on close.
3. In chat, a streaming reply and a tool card announce without stealing focus.
4. Zoom to 200 percent and 400 percent. No content is cut off, no horizontal scroll inside the page body except tables and code.
5. Every image that carries meaning has alt text; decorative icons are `aria-hidden`.
6. Every form error is announced (`role="alert"`) and is tied to its field.

## Known gaps

- **Custom radio groups** (`SkillDraftCard` visibility, `FilterBar`, `RedundancyModal`) use `role="radio"` buttons. Tab and Space work; arrow-key navigation between options is not implemented yet.
- **Manual pass not yet done** on the current build. The checklist above is the definition of done.
- **axe coverage** is on the chat cards only. Pages that render client-side state (grading view, research stream) are not covered by the jsdom floor and depend on the manual pass.
- **Focus return** after hand-rolled overlays close is not guaranteed; Radix dialogs handle it, the custom ones do not yet.

## History

- 2026-11-01: lint gate added and 65 findings fixed across 24 components (keyboard access for clickable cards, Escape on hand-rolled modals, labels tied to inputs, combobox and listbox wiring); axe floor on the chat cards; global reduced motion; contrast test added and 20 token values retuned (details in the commit messages).
