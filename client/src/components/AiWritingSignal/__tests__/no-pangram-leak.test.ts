/**
 * Spec 02 (web-ui) FR4 + FR8 — barrel export + cross-cutting negative copy guard.
 *
 * The internal codename "Pangram" must NEVER appear in any client-facing file
 * (types, components, tabs). External label everywhere is "AI Writing Signal".
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const clientSrc = path.join(repoRoot, 'client', 'src');

const filesToScan = [
  'types/ai-writing-signal.ts',
  'components/AiWritingSignal/AiWritingSignalChip.tsx',
  'components/AiWritingSignal/index.ts',
  'components/SummariesTab.tsx',
  'components/InsightsTab.tsx',
  'components/DOK4Tab.tsx',
];

describe('FR4 AiWritingSignal barrel', () => {
  const barrelPath = path.join(clientSrc, 'components', 'AiWritingSignal', 'index.ts');
  const source = fs.readFileSync(barrelPath, 'utf8');

  it('re-exports AiWritingSignalChip', () => {
    expect(source).toContain('AiWritingSignalChip');
    expect(source).toMatch(/export\s+/);
  });

  it('does not introduce the internal codename', () => {
    expect(source).not.toMatch(/Pangram/i);
  });
});

describe('FR8 negative copy guard — no "Pangram" anywhere in client/src AI Writing Signal surface', () => {
  for (const rel of filesToScan) {
    it(`${rel} contains no "Pangram" substring (case-insensitive)`, () => {
      const full = path.join(clientSrc, rel);
      const source = fs.readFileSync(full, 'utf8');
      expect(source).not.toMatch(/Pangram/i);
    });
  }
});
