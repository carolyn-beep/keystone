/**
 * Static-string regression tests for the v2 DOK4 philosophy rollout.
 *
 * Spec: features/dok4/grading/specs/06-template-and-prompts-v2/spec.md
 *
 * Locks v1 vocabulary out of the agent-education surfaces (template + POV
 * validator + traceability prompts) and locks v2 vocabulary in. Pure string
 * assertions, no network, no LLM mocks.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  DOK4_POV_VALIDATION_SYSTEM_PROMPT,
  DOK4_TRACEABILITY_SYSTEM_PROMPT,
} from '../../prompts/dok4-grading';

// Load template once. Path is resolved from this test file's directory.
// __dirname points at server/ai/__tests__, so go up three levels to repo root.
const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'docs', 'brainlift-mcp-template.md');
const TEMPLATE_TEXT = readFileSync(TEMPLATE_PATH, 'utf-8');

// Helper: locate the worked-example DOK4 SPOV bullet lines.
// In the template the worked example contains a `- DOK4` heading followed by
// two SPOV bullets at two-space indent. We collect lines that start with
// exactly "  - " and stop as soon as we hit a deeper indent or a blank/other
// line.
function workedExampleDOK4SpovBullets(text: string): string[] {
  const lines = text.split('\n');
  // Find the worked-example DOK4 heading. The worked example uses `- DOK4`
  // at zero indent. There is exactly one such line in the template.
  const headerIdx = lines.findIndex((l) => l === '- DOK4');
  if (headerIdx === -1) return [];

  const bullets: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('  - ')) {
      bullets.push(line);
    } else if (line.startsWith('    ')) {
      // Sub-bullet of the current SPOV (Links / Insight N) — skip.
      continue;
    } else {
      // End of the DOK4 block (blank line, new section, etc.).
      break;
    }
  }
  return bullets;
}

function tokenCount(bulletLine: string): number {
  // Strip the leading "  - " marker, trim, split on whitespace.
  const stripped = bulletLine.replace(/^\s*-\s+/, '').trim();
  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).length;
}

describe('docs/brainlift-mcp-template.md — v2 vocabulary', () => {
  it('does not contain "defensible" (case-insensitive)', () => {
    expect(TEMPLATE_TEXT).not.toMatch(/defensible/i);
  });

  it('does not contain "Cross-Domain" (case-insensitive)', () => {
    expect(TEMPLATE_TEXT).not.toMatch(/cross-domain/i);
  });

  it('does not contain "Causal Reasoning" (case-insensitive)', () => {
    expect(TEMPLATE_TEXT).not.toMatch(/causal reasoning/i);
  });

  it('mentions Punchiness and P1', () => {
    expect(TEMPLATE_TEXT).toMatch(/Punchiness/);
    expect(TEMPLATE_TEXT).toMatch(/\bP1\b/);
  });

  it('worked-example DOK4 SPOV bullets are each <= 25 tokens', () => {
    const bullets = workedExampleDOK4SpovBullets(TEMPLATE_TEXT);
    expect(bullets.length).toBe(2);
    for (const bullet of bullets) {
      const tokens = tokenCount(bullet);
      expect(
        tokens,
        `Worked-example DOK4 SPOV bullet exceeds 25-token punchiness budget: "${bullet}"`,
      ).toBeLessThanOrEqual(25);
    }
  });
});

describe('DOK4_POV_VALIDATION_SYSTEM_PROMPT — v2 vocabulary', () => {
  it('does not contain "defensible" (case-insensitive)', () => {
    expect(DOK4_POV_VALIDATION_SYSTEM_PROMPT).not.toMatch(/defensible/i);
  });

  it('contains "take a side against"', () => {
    expect(DOK4_POV_VALIDATION_SYSTEM_PROMPT).toContain('take a side against');
  });
});

describe('DOK4_TRACEABILITY_SYSTEM_PROMPT — v2 vocabulary', () => {
  it('does not contain "defensible" (case-insensitive)', () => {
    expect(DOK4_TRACEABILITY_SYSTEM_PROMPT).not.toMatch(/defensible/i);
  });

  it('does not contain "MULTIPLE sources"', () => {
    expect(DOK4_TRACEABILITY_SYSTEM_PROMPT).not.toContain('MULTIPLE sources');
  });

  it('does not contain "vulnerability" (case-insensitive)', () => {
    expect(DOK4_TRACEABILITY_SYSTEM_PROMPT).not.toMatch(/vulnerability/i);
  });

  it('contains "DOK1-2-3 chain"', () => {
    expect(DOK4_TRACEABILITY_SYSTEM_PROMPT).toContain('DOK1-2-3 chain');
  });
});
