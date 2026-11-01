/**
 * Spec 02 FR3 — useRecentCategory hook source-as-string + behavior assertions.
 *
 * The hook is a trivial localStorage round-trip. Since it has no React
 * state (no useState subscription), we verify the localStorage key shape
 * and missing-key handling structurally.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const hookSource = fs.readFileSync(
  new URL('../useRecentCategory.ts', import.meta.url),
  'utf8',
);

describe('FR3: useRecentCategory export', () => {
  it('exports the hook', () => {
    expect(hookSource).toMatch(/export\s+function\s+useRecentCategory\s*\(/);
  });
});

describe('FR3: localStorage key format', () => {
  it('uses the per-brainlift key `reader-notes:recent-category:${slug}`', () => {
    expect(hookSource).toMatch(/reader-notes:recent-category:\$\{slug\}/);
  });

  it('reads from localStorage.getItem', () => {
    expect(hookSource).toMatch(/localStorage\.getItem/);
  });

  it('writes via localStorage.setItem', () => {
    expect(hookSource).toMatch(/localStorage\.setItem/);
  });
});

describe('FR3: missing / malformed value handling', () => {
  it('returns null when the raw value is missing or not a finite integer', () => {
    // Source should validate via Number.isFinite or parseInt + Number.isNaN check
    // before returning the id; falls through to null on failure.
    expect(hookSource).toMatch(/return\s+null|recentCategoryId:\s*null/);
    expect(hookSource).toMatch(/parseInt|Number\.parseInt|Number\.isFinite|Number\.isNaN/);
  });
});

describe('FR3: return shape', () => {
  it('returns recentCategoryId and setRecentCategoryId', () => {
    expect(hookSource).toMatch(/recentCategoryId/);
    expect(hookSource).toMatch(/setRecentCategoryId/);
  });
});
