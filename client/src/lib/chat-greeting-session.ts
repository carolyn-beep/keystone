/**
 * Cooldown gate for the chat-homepage opener.
 *
 * The chat homepage (`/`) auto-creates a fresh conversation and fires the
 * opener whenever it's the landing surface. That used to fire every time
 * the user landed, which produced an empty/throwaway "Personalized
 * Onboarding Chat" conversation each visit. We now gate the opener
 * behind a localStorage timestamp: the opener fires only when the user
 * hasn't seen it in the last 72 hours.
 *
 * Storage shape:
 *   - Key: `chat-opener-last-fired-ms`
 *   - Value: `Date.now()` at the moment the opener was fired (string).
 *
 * Lifecycle:
 *   - Persists across hard refresh, new tab, browser restart.
 *   - Cleared explicitly by `clearGreetedThisSession()` on sign-out so the
 *     next user on the same tab is greeted again.
 *   - If localStorage is unavailable (private mode, quota), the gate fails
 *     OPEN (treats user as not-recently-greeted) — losing the throttle is
 *     a small cost; double-greeting the user every page load is the bigger
 *     bug we're trying to prevent.
 */

const STORAGE_KEY = 'chat-opener-last-fired-ms';
const OPENER_COOLDOWN_MS = 72 * 60 * 60 * 1000; // 72 hours

// One-time migration: an earlier iteration of this gate briefly wrote the
// timestamp under `alphax-opener-last-fired-ms` before the brand-neutrality
// rules forced us to rename. Anyone who tested that build has the stale key
// sitting in their localStorage; without this fallback they'd be greeted
// again on first landing of the new build. Reads from the legacy key on
// miss and promotes the value into the new key so the migration is a
// one-shot per user.
const LEGACY_STORAGE_KEY = 'alphax-opener-last-fired-ms';

function readLastFiredMs(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }

    // Migrate legacy key (if any) into the current key on first read.
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return null;
    const legacyParsed = Number(legacyRaw);
    if (!Number.isFinite(legacyParsed)) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }
    window.localStorage.setItem(STORAGE_KEY, String(legacyParsed));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return legacyParsed;
  } catch {
    return null;
  }
}

/**
 * Returns true when the opener was fired within the cooldown window
 * (default 72h) and should therefore NOT fire again for this user.
 *
 * Kept under the legacy "hasBeenGreetedThisSession" name so existing
 * callers don't churn; the semantics are now cooldown-based, not
 * tab-session-based.
 */
export function hasBeenGreetedThisSession(): boolean {
  const lastFired = readLastFiredMs();
  if (lastFired == null) return false;
  return Date.now() - lastFired < OPENER_COOLDOWN_MS;
}

export function markGreetedThisSession(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable (private mode, quota): swallow — the user
    // will just see the opener again on their next bare-/ landing.
  }
}

export function clearGreetedThisSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    // Also clear the legacy key so a stale value can't haunt a future
    // session if `readLastFiredMs` ever fails before migration.
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // No-op — same rationale as markGreetedThisSession.
  }
}
