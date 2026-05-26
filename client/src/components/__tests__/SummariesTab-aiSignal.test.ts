/**
 * Spec 02 (web-ui) FR5 — SummariesTab AI Writing Signal wiring.
 *
 * Source-assertion tests on the modified SummariesTab.tsx file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'SummariesTab.tsx'),
  'utf8',
);

describe('FR5 SummariesTab — AI Writing Signal integration', () => {
  it('imports AiWritingSignalChip from the shared component folder', () => {
    expect(source).toMatch(/from\s+['"]@\/components\/AiWritingSignal['"]/);
    expect(source).toContain('AiWritingSignalChip');
  });

  it('reads aiWritingSignal defensively off the summary prop (widened until server route extension lands)', () => {
    // pattern: `(summary as ...).aiWritingSignal` or `summary.aiWritingSignal`
    expect(source).toMatch(/summary[^.]*\.aiWritingSignal|aiWritingSignal\??:\s*AiWritingSignalPayload/);
  });

  it('renders the chip in the meta row (NOT inside the score circle column)', () => {
    // Sanity: chip is placed alongside category/source link content, not
    // inside the `Grade Circle` wrapping div.
    expect(source).toContain('<AiWritingSignalChip');
    // The chip must not appear inside the `Grade Circle` shrink-0 column.
    const gradeBlock = source.indexOf('Grade Circle');
    const titleMetaBlock = source.indexOf('Title & Meta');
    const chipIdx = source.indexOf('<AiWritingSignalChip');
    expect(chipIdx).toBeGreaterThan(-1);
    if (gradeBlock !== -1 && titleMetaBlock !== -1) {
      expect(chipIdx).toBeGreaterThan(titleMetaBlock);
    }
  });

  it('never mentions internal codename "Pangram"', () => {
    expect(source).not.toMatch(/Pangram/i);
  });
});
