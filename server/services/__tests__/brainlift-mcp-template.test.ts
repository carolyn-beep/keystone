/**
 * Tests for FR7: docs/brainlift-mcp-template.md "AI Writing Signal" section.
 *
 * Verifies the new informational section ships AND that the internal codename
 * "Pangram" never leaks into the template the agent sees.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEMPLATE_PATH = join(process.cwd(), 'docs', 'brainlift-mcp-template.md');
const TEMPLATE = readFileSync(TEMPLATE_PATH, 'utf8');

describe('docs/brainlift-mcp-template.md -- AI Writing Signal section', () => {
  it('contains a top-level "AI Writing Signal" section heading', () => {
    expect(TEMPLATE).toMatch(/^## AI Writing Signal\b/m);
  });

  it('does NOT contain the word "Pangram" anywhere', () => {
    expect(TEMPLATE.toLowerCase()).not.toContain('pangram');
  });

  it('explicitly states the signal does not affect platform scores', () => {
    const section = extractSection(TEMPLATE, 'AI Writing Signal');
    expect(section).toMatch(/not.{0,40}(used by the platform grader|affect.{0,20}score)/i);
  });

  it('is NOT a sub-row of the "What the Grader Penalizes" table', () => {
    // The section must be a top-level "## " heading, not nested under penalty
    // content. Verify the AI Writing Signal heading is the same heading depth
    // (`## `) as "What the Grader Penalizes" is `### ` -- and that the signal
    // section is positioned AFTER the penalty content, not embedded within it.
    const penaltyHeadingIdx = TEMPLATE.indexOf('### What the Grader Penalizes');
    const signalHeadingIdx = TEMPLATE.indexOf('## AI Writing Signal');
    expect(penaltyHeadingIdx).toBeGreaterThan(-1);
    expect(signalHeadingIdx).toBeGreaterThan(penaltyHeadingIdx);

    // Also check: no table row before the signal heading mentions "AI Writing".
    const penaltyBlock = TEMPLATE.slice(penaltyHeadingIdx, signalHeadingIdx);
    expect(penaltyBlock).not.toMatch(/AI Writing/i);
  });
});

function extractSection(text: string, heading: string): string {
  const start = text.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  // next top-level heading
  const next = rest.search(/\n## /);
  return next === -1 ? rest : rest.slice(0, next);
}
