/**
 * Tests for 04-token-backend: DOK3 builder id-exposure + citation prompt edits.
 *
 * - FR1: buildDOK3UserPrompt renders level-prefixed [DOK2:id] / [DOK1:id] tokens
 * - FR4: DOK3_GRADING_SYSTEM_PROMPT carries the cite-by-token instruction and
 *        the "by its token" schema rationale line; scoring anchors byte-identical.
 */

import { describe, it, expect } from 'vitest';
import { buildDOK3UserPrompt, DOK3_GRADING_SYSTEM_PROMPT } from '../dok3-grading';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeEvidence(overrides?: Partial<Parameters<typeof buildDOK3UserPrompt>[2]>) {
  return {
    linkedDok2s: [
      {
        id: 567,
        sourceName: 'Smith 2024',
        grade: 4,
        points: ['Standardized tests miss compound skills'],
        dok1Facts: [
          { id: 1234, fact: 'Tests measure discrete knowledge', score: 5 },
          { id: 1235, fact: 'Compound skills take months to emerge', score: 4 },
        ],
      },
    ],
    sourceEvidence: new Map<string, { sourceName: string; content: string }>(),
    foundationMetrics: { dok1Score: 4.5, dok2Score: 4, index: 4.2 },
    traceabilityStatus: 'clear',
    previousEvaluation: null,
    ...overrides,
  };
}

// ─── FR1: token rendering ────────────────────────────────────────────────────

describe('FR1: buildDOK3UserPrompt renders evidence tokens', () => {
  it('renders [DOK2:id] next to the DOK2 summary and [DOK1:id] next to each fact', () => {
    const prompt = buildDOK3UserPrompt('purpose', 'insight text', makeEvidence());
    expect(prompt).toContain('[DOK2:567]');
    expect(prompt).toContain('[DOK1:1234]');
    expect(prompt).toContain('[DOK1:1235]');
  });

  it('always emits the level prefix; never a bare [id]', () => {
    const prompt = buildDOK3UserPrompt('purpose', 'insight text', makeEvidence());
    // No bare numeric-only bracket tokens like "[567]" or "[1234]"
    expect(prompt).not.toMatch(/\[\s*567\s*\]/);
    expect(prompt).not.toMatch(/\[\s*1234\s*\]/);
  });

  it('renders the DOK2 token but no DOK1 tokens when a DOK2 has no facts', () => {
    const evidence = makeEvidence({
      linkedDok2s: [
        { id: 800, sourceName: 'Empty', grade: 3, points: ['p'], dok1Facts: [] },
      ],
    });
    const prompt = buildDOK3UserPrompt('purpose', 'insight text', evidence);
    expect(prompt).toContain('[DOK2:800]');
    expect(prompt).not.toContain('[DOK1:');
  });

  it('emits the token regardless of grade/score (ungraded still tokenized)', () => {
    const evidence = makeEvidence({
      linkedDok2s: [
        {
          id: 900,
          sourceName: 'Ungraded',
          grade: null,
          points: ['p'],
          dok1Facts: [{ id: 9001, fact: 'f', score: 0 }],
        },
      ],
    });
    const prompt = buildDOK3UserPrompt('purpose', 'insight text', evidence);
    expect(prompt).toContain('[DOK2:900]');
    expect(prompt).toContain('[DOK1:9001]');
  });
});

// ─── FR4: citation prompt edits ──────────────────────────────────────────────

describe('FR4: DOK3_GRADING_SYSTEM_PROMPT citation-marker edits', () => {
  it('contains the [DOKX:1234] citation-format instruction', () => {
    expect(DOK3_GRADING_SYSTEM_PROMPT).toContain('[DOKX:1234] citation format');
    // Candidate text wraps across lines; normalize whitespace to assert on the
    // instruction substance rather than exact line breaks.
    const normalized = DOK3_GRADING_SYSTEM_PROMPT.replace(/\s+/g, ' ');
    // Token renders as a trailing reference marker, NOT inline text.
    expect(normalized).toContain('small superscript reference marker');
    expect(normalized).toContain(
      'self-contained sentences that still read correctly if every [DOKX:id]',
    );
  });

  it('schema rationale line directs trailing [DOKX:id] markers', () => {
    expect(DOK3_GRADING_SYSTEM_PROMPT).toContain(
      'Cite the specific DOK1/DOK2 evidence with trailing [DOKX:id] markers',
    );
  });

  it('keeps scoring anchors byte-identical (verbalization-only edit)', () => {
    expect(DOK3_GRADING_SYSTEM_PROMPT).toContain('Reason through all 7 criteria');
    expect(DOK3_GRADING_SYSTEM_PROMPT).toContain('at best a 2');
  });
});
