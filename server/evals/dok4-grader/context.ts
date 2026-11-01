/**
 * Builds a DOK4EvaluationContext from a golden case.
 *
 * Mirrors what storage.getSpovEvaluationContext assembles from the database,
 * including the foundation-integrity index and ceiling, so the eval exercises
 * the grader exactly as production does, minus the database.
 */

import type { DOK4EvaluationContext } from '@shared/dok4-types';
import { computeDOK4FoundationIntegrity } from '@shared/dok4-foundation';
import type { GoldenCase } from './golden-schema';

export function buildEvaluationContext(goldenCase: GoldenCase): DOK4EvaluationContext {
  let nextDok2Id = 101;
  let nextDok1Id = 1001;

  const linkedDok2s = goldenCase.linkedDok2s.map((dok2) => ({
    id: nextDok2Id++,
    sourceName: dok2.sourceName,
    sourceUrl: dok2.sourceUrl,
    grade: dok2.grade,
    points: dok2.points,
    dok1Facts: dok2.dok1Facts.map((fact) => ({
      id: nextDok1Id++,
      fact: fact.fact,
      score: fact.score,
      source: dok2.sourceName,
    })),
  }));

  const sourceEvidence = goldenCase.linkedDok2s.map((dok2) => ({
    sourceName: dok2.sourceName,
    sourceUrl: dok2.sourceUrl,
    content: dok2.content,
  }));

  const dok1Scores = linkedDok2s
    .flatMap((d) => d.dok1Facts.map((f) => f.score))
    .filter((s): s is number => typeof s === 'number');
  const dok2Grades = linkedDok2s
    .map((d) => d.grade)
    .filter((g): g is number => typeof g === 'number');

  const foundation = computeDOK4FoundationIntegrity(
    dok1Scores,
    dok2Grades,
    goldenCase.primaryDok3.score,
  );

  return {
    brainliftPurpose: goldenCase.brainliftPurpose,
    spovText: goldenCase.spovText,
    primaryDok3: { id: 1, ...goldenCase.primaryDok3 },
    additionalDok3s: goldenCase.additionalDok3s.map((d, i) => ({ id: 2 + i, ...d })),
    linkedDok2s,
    sourceEvidence,
    foundationIndex: foundation.index,
    foundationCeiling: foundation.ceiling,
    dok1FoundationScore: foundation.dok1Score,
    dok2FoundationScore: foundation.dok2Score,
    dok3FoundationScore: foundation.dok3Score,
    traceabilityResult: null,
    divergenceResult: null,
  };
}

/** Sources in the shape checkDOK4SourceTraceability expects. */
export function traceabilitySources(context: DOK4EvaluationContext) {
  return context.linkedDok2s.map((d) => ({
    sourceName: d.sourceName,
    dok2Points: d.points,
    content: context.sourceEvidence.find((s) => s.sourceName === d.sourceName)?.content ?? '',
  }));
}
