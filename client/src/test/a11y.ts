import axe, { type Result } from 'axe-core';

/**
 * Accessibility assertions for server-rendered component markup.
 *
 * Usage (the test file must opt into a DOM):
 *
 *   // @vitest-environment jsdom
 *   const violations = await axeViolations(renderToStaticMarkup(<Card />));
 *   expect(violations, formatViolations(violations)).toEqual([]);
 *
 * What this catches: WCAG A/AA structure rules that hold in static HTML -
 * controls without accessible names, invalid ARIA attributes and roles,
 * missing form labels, broken list semantics, images without alt text,
 * duplicate ids, interactive content hidden from assistive tech.
 *
 * What it cannot catch: anything that needs layout or computed style. Colour
 * contrast is disabled because jsdom does not paint; focus order and keyboard
 * traps need a real browser. A green result is a floor, not a WCAG audit.
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function axeViolations(markup: string): Promise<Result[]> {
  if (typeof document === 'undefined') {
    throw new Error('axeViolations needs a DOM; add `// @vitest-environment jsdom` to the test file.');
  }
  document.documentElement.lang = 'en';
  document.body.innerHTML = `<main>${markup}</main>`;
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: WCAG_TAGS },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations;
}

/** Human-readable failure message: rule, impact, and the offending nodes. */
export function formatViolations(violations: Result[]): string {
  if (violations.length === 0) return 'no accessibility violations';
  return violations
    .map((v) => {
      const nodes = v.nodes.map((n) => `    ${n.html}\n      -> ${n.failureSummary ?? ''}`).join('\n');
      return `[${v.impact ?? 'unknown'}] ${v.id}: ${v.help} (${v.helpUrl})\n${nodes}`;
    })
    .join('\n\n');
}
