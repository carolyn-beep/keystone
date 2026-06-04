/**
 * Tests for 04-token-backend: DOK4 builder id-render + citation prompt edits.
 *
 * - FR3: buildQualityEvaluationUserPrompt renders [DOK3:id] (primary + additional),
 *        [DOK2:id], [DOK1:id] from ids already present in DOK4EvaluationContext.
 * - FR4: DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT carries the cite-by-token
 *        instruction (incl. DOK3) and the "by its token" schema rationale line;
 *        scoring anchors byte-identical.
 */

import { describe, it, expect } from 'vitest';
import type { DOK4EvaluationContext } from '@shared/dok4-types';
import {
  buildQualityEvaluationUserPrompt,
  DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT,
} from '../dok4-grading';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<DOK4EvaluationContext>): DOK4EvaluationContext {
  return {
    brainliftPurpose: 'Research into alternative educational assessment.',
    spovText: 'Standardized testing should be replaced by longitudinal skill assessment.',
    primaryDok3: {
      id: 890,
      text: 'Compound skills emerge invisibly to point-in-time tests.',
      score: 4,
      frameworkName: 'Compound Skills Gap',
      frameworkDescription: 'How discrete testing fails compound skill assessment.',
    },
    additionalDok3s: [
      { id: 891, text: 'Longitudinal tracking reveals emergence patterns.', score: 3 },
    ],
    linkedDok2s: [
      {
        id: 567,
        sourceName: 'Smith 2024',
        sourceUrl: 'https://example.com/smith2024',
        grade: 4,
        points: ['Tests measure discrete knowledge'],
        dok1Facts: [
          { id: 1234, fact: 'Tests measure discrete knowledge', score: 5, source: 'Smith 2024' },
        ],
      },
    ],
    sourceEvidence: [
      { sourceName: 'Smith 2024', sourceUrl: 'https://example.com/smith2024', content: 'Smith content...' },
    ],
    foundationIndex: 3.65,
    foundationCeiling: 4,
    dok1FoundationScore: 4.33,
    dok2FoundationScore: 3.5,
    dok3FoundationScore: 4,
    traceabilityResult: { flagged: false, flaggedSource: null, overlapSummary: null },
    divergenceResult: { question: 'q', vanillaResponse: 'v' },
    ...overrides,
  };
}

// ─── FR3: token rendering ────────────────────────────────────────────────────

describe('FR3: buildQualityEvaluationUserPrompt renders DOK1/2/3 tokens', () => {
  it('renders [DOK3:id] for the primary DOK3 insight', () => {
    const prompt = buildQualityEvaluationUserPrompt(makeContext());
    expect(prompt).toContain('[DOK3:890]');
  });

  it('renders [DOK3:id] for each additional DOK3 insight', () => {
    const prompt = buildQualityEvaluationUserPrompt(makeContext());
    expect(prompt).toContain('[DOK3:891]');
  });

  it('renders [DOK2:id] and [DOK1:id] for linked evidence', () => {
    const prompt = buildQualityEvaluationUserPrompt(makeContext());
    expect(prompt).toContain('[DOK2:567]');
    expect(prompt).toContain('[DOK1:1234]');
  });

  it('always emits the level prefix; never a bare [id]', () => {
    const prompt = buildQualityEvaluationUserPrompt(makeContext());
    expect(prompt).not.toMatch(/\[\s*890\s*\]/);
    expect(prompt).not.toMatch(/\[\s*567\s*\]/);
    expect(prompt).not.toMatch(/\[\s*1234\s*\]/);
  });

  it('renders only present tokens when there are no additional DOK3s / no linked DOK2s', () => {
    const prompt = buildQualityEvaluationUserPrompt(
      makeContext({ additionalDok3s: [], linkedDok2s: [] }),
    );
    expect(prompt).toContain('[DOK3:890]'); // primary still present
    expect(prompt).not.toContain('[DOK3:891]');
    expect(prompt).not.toContain('[DOK2:');
    expect(prompt).not.toContain('[DOK1:');
  });
});

// ─── FR4: citation prompt edits ──────────────────────────────────────────────

describe('FR4: DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT citation-marker edits', () => {
  it('contains the [DOKX:1234] citation-format instruction including DOK3 insights', () => {
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain(
      'DOK1 facts, DOK2 summaries, or DOK3 insights from the chain using the [DOKX:1234] citation format',
    );
    // Token renders as a trailing reference marker, NOT inline text.
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain('small superscript reference marker');
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain(
      'self-contained sentences that still read correctly if every [DOKX:id] were deleted',
    );
  });

  it('schema rationale line directs trailing [DOKX:id] markers', () => {
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain(
      'Cite the specific DOK1/DOK2/DOK3 evidence with trailing [DOKX:id] markers',
    );
  });

  it('keeps scoring anchors byte-identical (verbalization-only edit)', () => {
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain('Reason through all 6 criteria');
    expect(DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT).toContain('at best a 2');
  });
});
