/**
 * Per-runtime "has the user been greeted by AlphaX yet" flag.
 *
 * The chat homepage (`/`) auto-creates a fresh conversation and fires the
 * AlphaX opener every time it's the landing surface. That's the right
 * behavior for "I just logged in" or "I just opened the tab" but not for
 * "I clicked Chat in the sidebar." This module gates the greeting to once
 * per JS runtime (i.e. once per page load / tab) so sidebar navigation
 * lands on the most recent existing conversation instead.
 *
 * Lifecycle:
 *   - Cleared automatically on hard refresh, new tab, browser restart.
 *   - Cleared explicitly by `clearGreetedThisSession()` on sign-out
 *     (UserMenu.handleSignOut), so the next user on the same tab is greeted.
 *   - NOT cleared on SPA route changes -- that's the whole point.
 */

let greeted = false;

export function hasBeenGreetedThisSession(): boolean {
  return greeted;
}

export function markGreetedThisSession(): void {
  greeted = true;
}

export function clearGreetedThisSession(): void {
  greeted = false;
}
