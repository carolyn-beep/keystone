/**
 * Spec 02 (web-ui) FR2 — AiWritingSignalChip component.
 *
 * Source-assertion tests (Vitest `node` env -- no jsdom/RTL setup).
 * We assert the SHAPE of the rendered JSX: states handled, copy strings,
 * Tailwind classes, no leakage of internal codename "Pangram".
 *
 * The pure rounding helper is also unit-tested via dynamic import once the
 * file exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const file = path.resolve(
  __dirname,
  '..',
  'AiWritingSignalChip.tsx',
);
const source = fs.readFileSync(file, 'utf8');

describe('FR2 AiWritingSignalChip — props + visual contract', () => {
  it('takes a signal prop typed as AiWritingSignalPayload | null', () => {
    expect(source).toContain('AiWritingSignalPayload');
    expect(source).toMatch(/signal\s*:\s*AiWritingSignalPayload\s*\|\s*null/);
  });

  it('renders nothing when signal === null (pre-launch items)', () => {
    // either `if (signal === null) return null;` or `if (!signal) return null;`
    expect(source).toMatch(/if\s*\(\s*(signal\s*===\s*null|!signal)\s*\)\s*\{?\s*return\s+null/);
  });

  it('handles the three lifecycle states', () => {
    expect(source).toContain("'analyzing'");
    expect(source).toContain("'done'");
    expect(source).toContain("'error'");
  });

  it('exposes the external label string "AI Writing Signal" (not "Pangram")', () => {
    expect(source).toContain('AI Writing Signal');
  });

  it('never mentions the internal codename "Pangram"', () => {
    expect(source).not.toMatch(/Pangram/i);
  });

  it('uses neo-editorial tokens (not raw hex values) for state colors', () => {
    expect(source).toContain("from '@/lib/colors'");
    expect(source).toContain('tokens');
  });

  it('renders a stacked-fraction bar for the done state (three contiguous segments)', () => {
    // segments are width-driven by signal.fractions.*; assertion checks
    // that the three fraction keys appear in the render path.
    expect(source).toContain('fractions');
    expect(source).toMatch(/fractions\.human/);
    expect(source).toMatch(/fractions\.aiAssisted/);
    expect(source).toMatch(/fractions\.ai\b/);
    // dynamic width via inline style is the only allowed inline style.
    expect(source).toMatch(/style=\{\{\s*width:/);
  });

  it('uses pill shape and avoids the circular grade-chip palette (designer constraint)', () => {
    // The grade chip is `rounded-full w-14 h-14`. This must NOT match here.
    expect(source).not.toMatch(/rounded-full\s+w-14\s+h-14/);
    // Pill is rounded-full on a wider element or rounded-md/rounded-lg pill.
    expect(source).toMatch(/rounded-(md|lg|full|xl)/);
  });

  it('surfaces an Analyzing indicator for status="analyzing"', () => {
    expect(source).toMatch(/Analyzing|analyzing\s*\.\.\./i);
  });

  it('surfaces an Unavailable indicator for status="error" (neutral, non-accusatory copy)', () => {
    expect(source).toMatch(/Unavailable|unavailable/);
  });

  it('does not use EM dashes in user-facing strings or comments', () => {
    expect(source).not.toContain('—');
  });
});

describe('FR2 AiWritingSignalChip — pure helpers', () => {
  it('exports a pure fraction-bar width helper for unit testing', async () => {
    const mod = await import('../AiWritingSignalChip');
    expect(typeof (mod as any).computeFractionWidths).toBe('function');
  });

  it('computeFractionWidths floors to integers and assigns the remainder to the dominant segment', async () => {
    const mod = await import('../AiWritingSignalChip');
    const fn = (mod as any).computeFractionWidths as (
      human: number,
      aiAssisted: number,
      ai: number,
    ) => { human: number; aiAssisted: number; ai: number };

    // sums to 100 exactly
    const r1 = fn(0.5, 0.3, 0.2);
    expect(r1.human + r1.aiAssisted + r1.ai).toBe(100);

    // sums to ~0.998 (rounding) -- helper must distribute the missing 1pt
    const r2 = fn(0.333, 0.333, 0.332);
    expect(r2.human + r2.aiAssisted + r2.ai).toBe(100);

    // dominant segment receives the rounding remainder
    const r3 = fn(0.6666, 0.1666, 0.1666);
    expect(r3.human + r3.aiAssisted + r3.ai).toBe(100);
    expect(r3.human).toBeGreaterThanOrEqual(r3.aiAssisted);
    expect(r3.human).toBeGreaterThanOrEqual(r3.ai);
  });

  it('computeFractionWidths handles all-zero fractions defensively', async () => {
    const mod = await import('../AiWritingSignalChip');
    const fn = (mod as any).computeFractionWidths as (
      h: number,
      a: number,
      i: number,
    ) => { human: number; aiAssisted: number; ai: number };
    const r = fn(0, 0, 0);
    expect(r.human + r.aiAssisted + r.ai).toBe(100);
  });
});
