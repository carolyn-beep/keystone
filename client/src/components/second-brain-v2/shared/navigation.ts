/**
 * Spec 03 FR7 — cross-tab navigation util for Second Brain v2.
 *
 * Lets a sub-tab body (e.g. ResearchMaterialsTab's drawer CTA) switch
 * to a sibling sub-tab and seed query params (`?sb=notes&filterSource=123`).
 * Uses pushState (not replaceState) so the browser Back button returns
 * the user to where they came from.
 *
 * The shell (`SecondBrainTab`) reads `?sb=` via wouter's `useSearch`,
 * which re-runs on `popstate` events — so after pushState we dispatch a
 * synthetic `popstate` to trigger the re-read. This matches the
 * pattern the shell itself uses for its own programmatic tab switching.
 */

export type SubTabId = 'research-materials' | 'notes' | 'categories';

export function navigateToSubTab(
  target: SubTabId,
  params?: Record<string, string>,
): void {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.set('sb', target);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, value);
    }
  }

  const next = searchParams.toString();
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;

  window.history.pushState(null, '', url);
  // Notify any URL-listening hooks (wouter's useSearch) to re-read.
  window.dispatchEvent(new PopStateEvent('popstate'));
}
