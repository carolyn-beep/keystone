/**
 * Spec 02 (web-ui) FR1 — shared AiWritingSignalPayload type.
 *
 * Source-assertion tests (Vitest `node` env -- no TS reflection, no jsdom).
 * We assert structural properties of the type definitions file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const file = path.resolve(
  __dirname,
  '..',
  'ai-writing-signal.ts',
);
const source = fs.readFileSync(file, 'utf8');

describe('FR1 ai-writing-signal types module', () => {
  it('declares AiWritingSignalStatus union of analyzing | done | error', () => {
    expect(source).toMatch(/AiWritingSignalStatus[^;]*=\s*['"]analyzing['"]/);
    expect(source).toMatch(/['"]done['"]/);
    expect(source).toMatch(/['"]error['"]/);
  });

  it('re-exports AiWritingSignalLabel from @shared/schema (single source of truth for label values)', () => {
    expect(source).toContain('AiWritingSignalLabel');
    expect(source).toContain('@shared/schema');
  });

  it('declares AiWritingSignalWindow with all required fields', () => {
    expect(source).toContain('AiWritingSignalWindow');
    expect(source).toMatch(/\btext\s*:/);
    expect(source).toMatch(/\blabel\s*:/);
    expect(source).toMatch(/aiAssistanceScore\s*:/);
    expect(source).toMatch(/confidence\s*:/);
    expect(source).toMatch(/startIndex\s*:/);
    expect(source).toMatch(/endIndex\s*:/);
    expect(source).toMatch(/wordCount\s*:/);
    expect(source).toMatch(/tokenLength\s*:/);
  });

  it('declares AiWritingSignalPayload with status, label, version, fractions, segmentCounts, headline, prediction, dashboardLink, windows, errorMessage, analyzedAt', () => {
    expect(source).toContain('AiWritingSignalPayload');
    expect(source).toMatch(/status\s*:/);
    expect(source).toMatch(/label\s*:/);
    expect(source).toMatch(/version\s*:/);
    expect(source).toMatch(/fractions\s*:/);
    expect(source).toMatch(/segmentCounts\s*:/);
    expect(source).toMatch(/headline\s*:/);
    expect(source).toMatch(/prediction\s*:/);
    expect(source).toMatch(/dashboardLink\s*:/);
    expect(source).toMatch(/windows\s*:/);
    expect(source).toMatch(/errorMessage\s*:/);
    expect(source).toMatch(/analyzedAt\s*:/);
  });

  it('makes label, version, fractions, segmentCounts, headline, prediction, dashboardLink, windows, errorMessage, analyzedAt nullable', () => {
    // each of these fields must permit null per spec-research §Interface Contracts
    expect(source).toMatch(/label\s*:\s*AiWritingSignalLabel\s*\|\s*null/);
    expect(source).toMatch(/version\s*:\s*string\s*\|\s*null/);
    expect(source).toMatch(/fractions\s*:\s*\{[\s\S]*?\}\s*\|\s*null/);
    expect(source).toMatch(/segmentCounts\s*:\s*\{[\s\S]*?\}\s*\|\s*null/);
    expect(source).toMatch(/headline\s*:\s*string\s*\|\s*null/);
    expect(source).toMatch(/prediction\s*:\s*string\s*\|\s*null/);
    expect(source).toMatch(/dashboardLink\s*:\s*string\s*\|\s*null/);
    expect(source).toMatch(/windows\s*:\s*AiWritingSignalWindow\[\]\s*\|\s*null/);
    expect(source).toMatch(/errorMessage\s*:\s*string\s*\|\s*null/);
    expect(source).toMatch(/analyzedAt\s*:\s*string\s*\|\s*null/);
  });

  it('NEVER mentions the internal codename "Pangram"', () => {
    expect(source).not.toMatch(/Pangram/i);
  });

  it('does not use EM dashes', () => {
    expect(source).not.toContain('—');
  });
});
