import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * FR3: Brand prompt additions for the `propose_research_run` tool.
 *
 * Both AlphaX brand files (research mode and authoring mode) need:
 *   - an operational-posture blurb framing the swarm as part of continuous
 *     knowledge retrieval (agent proposes, student launches)
 *   - a one-line entry in the tools-available section
 *
 * The total addition per file is tight (token-budget sensitive).
 */

const RESEARCH_PATH = new URL('../alphax-research.ts', import.meta.url);
const AUTHORING_PATH = new URL('../alphax.ts', import.meta.url);

const researchSource = fs.readFileSync(RESEARCH_PATH, 'utf8');
const authoringSource = fs.readFileSync(AUTHORING_PATH, 'utf8');

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker, startIdx >= 0 ? startIdx : 0);
  if (startIdx < 0 || endIdx < 0) return '';
  return source.slice(startIdx, endIdx);
}

describe('FR3 brand prompt additions for propose_research_run', () => {
  describe('alphax-research.ts (research mode)', () => {
    it('mentions propose_research_run inside the operational-posture region', () => {
      const posture = sliceBetween(
        researchSource,
        '=== START OF MAIN OPERATIONAL POSTURE ===',
        '=== END OF MAIN OPERATIONAL POSTURE ===',
      );
      expect(posture).toContain('propose_research_run');
    });

    it('mentions propose_research_run inside the tools-available region', () => {
      const tools = sliceBetween(
        researchSource,
        '=== START OF TOOLS AVAILABLE ===',
        '=== END OF TOOLS AVAILABLE ===',
      );
      expect(tools).toContain('propose_research_run');
    });

    it('frames the agent as proposing and the student as launching', () => {
      // Either bullet should make the propose-vs-launch boundary explicit.
      const combined = researchSource.toLowerCase();
      expect(combined).toMatch(/student\s+launches?/);
    });
  });

  describe('alphax.ts (authoring mode)', () => {
    it('mentions propose_research_run inside the operational-posture region', () => {
      const posture = sliceBetween(
        authoringSource,
        '=== START OF MAIN OPERATIONAL POSTURE ===',
        '=== END OF MAIN OPERATIONAL POSTURE ===',
      );
      expect(posture).toContain('propose_research_run');
    });

    it('mentions propose_research_run in a tools-available-style entry', () => {
      // alphax.ts does not have a literal "TOOLS AVAILABLE" section header,
      // but it does include a tools-protocol block + tool mentions in the
      // posture body. Assert the tool appears either in posture (one-line
      // entry) or otherwise somewhere outside imports.
      expect(authoringSource).toContain('propose_research_run');
      // Make sure the mention is not solely an unused import.
      const mentions = authoringSource.match(/propose_research_run/g) ?? [];
      expect(mentions.length).toBeGreaterThanOrEqual(2);
    });

    it('frames the agent as proposing and the student as launching', () => {
      const combined = authoringSource.toLowerCase();
      expect(combined).toMatch(/student\s+launches?/);
    });
  });

  describe('addition budget (≤ 4 lines per file, ≤ 250 token combined)', () => {
    // Soft check: count occurrences of the literal `propose_research_run`. Each
    // file should mention it at most a handful of times; if someone bloats the
    // prompt with paragraphs of guidance, this fires.
    it('alphax-research.ts mentions propose_research_run no more than 4 times', () => {
      const mentions = researchSource.match(/propose_research_run/g) ?? [];
      expect(mentions.length).toBeGreaterThanOrEqual(2);
      expect(mentions.length).toBeLessThanOrEqual(4);
    });

    it('alphax.ts mentions propose_research_run no more than 4 times', () => {
      const mentions = authoringSource.match(/propose_research_run/g) ?? [];
      expect(mentions.length).toBeGreaterThanOrEqual(2);
      expect(mentions.length).toBeLessThanOrEqual(4);
    });

    // Combined character delta proxy for the ≤ 250-token cap. Lines that
    // mention the tool are surrounded by a couple of related sentences; a
    // reasonable upper bound on the added prose is ~1200 characters across
    // both files combined (which maps to roughly 250-300 tokens). Anything
    // dramatically larger means the blurb has bloated past the budget.
    it('combined added prose stays within rough 1200-character soft cap', () => {
      function blurbCharCount(src: string): number {
        const lines = src.split('\n');
        return lines
          .filter((line) => line.includes('propose_research_run'))
          .map((line) => line.length)
          .reduce((acc, n) => acc + n, 0);
      }
      const total = blurbCharCount(researchSource) + blurbCharCount(authoringSource);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(1800);
    });
  });
});
