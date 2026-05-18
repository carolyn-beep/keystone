/**
 * Shared URL formatting helpers.
 *
 * Lives in `client/src/lib/` so both Second Brain v1 (`SourceCard`) and
 * v2 (`SourceGridCard`, `SourceDetailPanel`) consume the same source of
 * truth. Pure function, no side effects.
 */

/**
 * Returns the URL's hostname with a leading `www.` stripped.
 * Falls back to the raw input when parsing fails (so callers always
 * get a non-empty display string).
 *
 * @example
 *   formatUrl('https://www.example.com/path') // 'example.com'
 *   formatUrl('not-a-url')                    // 'not-a-url'
 */
export function formatUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
