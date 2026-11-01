/**
 * Spec 02 (web-ui) FR7 — DOK4Tab AI Writing Signal wiring.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'DOK4Tab.tsx'),
  'utf8',
);

describe('FR7 DOK4Tab — AI Writing Signal integration', () => {
  it('imports AiWritingSignalChip from the shared component folder', () => {
    expect(source).toMatch(/from\s+['"]@\/components\/AiWritingSignal['"]/);
    expect(source).toContain('AiWritingSignalChip');
  });

  it('reads aiWritingSignal defensively off the spov prop', () => {
    expect(source).toMatch(/spov[^.]*\.aiWritingSignal|aiWritingSignal\??:\s*AiWritingSignalPayload/);
  });

  it('renders the chip in/near the meta row, not inside the score circle column', () => {
    const titleMetaBlock = source.indexOf('Title & Meta');
    const chipIdx = source.indexOf('<AiWritingSignalChip');
    expect(chipIdx).toBeGreaterThan(-1);
    if (titleMetaBlock !== -1) {
      expect(chipIdx).toBeGreaterThan(titleMetaBlock);
    }
  });

  it('never mentions internal codename "Pangram"', () => {
    expect(source).not.toMatch(/Pangram/i);
  });
});
