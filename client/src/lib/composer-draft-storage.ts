/**
 * Pure localStorage helpers for the chat-composer draft persistence feature.
 *
 * - One key per conversation: `chat-composer-draft:<id>` (or `:new` for the
 *   not-yet-saved draft state).
 * - Empty / whitespace-only text means "no draft" — `write` delegates to
 *   `clear` so the key never holds an empty string.
 * - All side effects are wrapped in try/catch with a `typeof window` guard:
 *   localStorage being unavailable (private mode, quota, SSR) silently
 *   no-ops, never throws to the caller. The chat keeps working without
 *   draft persistence.
 *
 * Mirrors the convention established by `client/src/lib/chat-greeting-session.ts`.
 */

/** Conversation id `null` represents an unsaved/new conversation. */
export type ComposerDraftScope = number | null;

const KEY_PREFIX = 'chat-composer-draft:';
const NEW_KEY_SUFFIX = 'new';

/**
 * Build the localStorage key for a given scope.
 *
 * Must distinguish `0` (a valid numeric id) from `null` (new). Using a strict
 * `=== null` check rather than truthiness keeps id=0 in its own slot.
 */
export function keyFor(scope: ComposerDraftScope): string {
  return `${KEY_PREFIX}${scope === null ? NEW_KEY_SUFFIX : String(scope)}`;
}

/**
 * Read the stored draft. Returns null for missing key, empty string, SSR
 * (no window), or any thrown error.
 */
export function read(scope: ComposerDraftScope): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (raw === null || raw === '') return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Write the draft text. Empty / whitespace-only text triggers `clear`
 * instead, so the key never holds a useless value.
 *
 * Silently swallows errors (private mode, quota, SSR).
 */
export function write(scope: ComposerDraftScope, text: string): void {
  if (text.trim() === '') {
    clear(scope);
    return;
  }
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(keyFor(scope), text);
  } catch {
    // Quota / private mode / etc — drop the draft this write, keep chatting.
  }
}

/**
 * Remove the stored draft. Silently swallows errors and SSR.
 */
export function clear(scope: ComposerDraftScope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(keyFor(scope));
  } catch {
    // Same rationale as `write` — no user-visible failure on storage errors.
  }
}
