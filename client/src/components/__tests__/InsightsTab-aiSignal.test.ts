/**
 * Spec 02 (web-ui) FR6 — InsightsTab AI Writing Signal wiring.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'InsightsTab.tsx'),
  'utf8',
);

describe('FR6 InsightsTab — AI Writing Signal integration', () => {
  it('imports AiWritingSignalChip from the shared component folder', () => {
    expect(source).toMatch(/from\s+['"]@\/components\/AiWritingSignal['"]/);
    expect(source).toContain('AiWritingSignalChip');
  });

  it('reads aiWritingSignal defensively off the insight prop', () => {
    expect(source).toMatch(/insight[^.]*\.aiWritingSignal|aiWritingSignal\??:\s*AiWritingSignalPayload/);
  });

  it('renders the chip in or near the meta row, not inside the score circle column', () => {
    const scoreCircleBlock = source.indexOf('Score Circle');
    const titleMetaBlock = source.indexOf('Title & Meta');
    const chipIdx = source.indexOf('<AiWritingSignalChip');
    expect(chipIdx).toBeGreaterThan(-1);
    if (titleMetaBlock !== -1) {
      expect(chipIdx).toBeGreaterThan(titleMetaBlock);
    }
    // Should NOT be inside the small score-circle column wrapper.
    if (scoreCircleBlock !== -1 && titleMetaBlock !== -1) {
      expect(chipIdx).toBeGreaterThan(scoreCircleBlock);
    }
  });

  it('never mentions internal codename "Pangram"', () => {
    expect(source).not.toMatch(/Pangram/i);
  });
});
