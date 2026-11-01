import type { PreviousEvaluation } from '@shared/types/regrading';
import type { DOK4EvaluationContext, DOK4GradeResult } from '@shared/dok4-types';
import {
  assessAntimemetic,
  checkDOK4SourceTraceability,
  checkLLMDivergence,
  evaluateDOK4Quality,
  validatePOV,
} from './dok4Grader';

export interface FrozenDOK4GradeOutcome {
  status: 'graded' | 'rejected' | 'error';
  score?: number;
  rejectionCategory?: string;
  error?: string;
  result?: DOK4GradeResult;
}

export async function gradeFrozenDOK4Spov(
  context: DOK4EvaluationContext,
  previousEvaluation?: PreviousEvaluation,
): Promise<FrozenDOK4GradeOutcome> {
  try {
    const povResult = await validatePOV(
      context.spovText,
      context.primaryDok3.text,
      context.brainliftPurpose,
    );

    if (!povResult.accept) {
      return {
        status: 'rejected',
        rejectionCategory: povResult.rejectionCategory ?? undefined,
      };
    }

    const traceabilitySources = context.linkedDok2s.map((dok2) => ({
      sourceName: dok2.sourceName,
      dok2Points: dok2.points,
      content: context.sourceEvidence.find((source) => source.sourceUrl === dok2.sourceUrl)?.content ?? '',
    }));

    const traceabilityResult = await checkDOK4SourceTraceability(
      context.spovText,
      traceabilitySources,
    );
    const divergenceResult = await checkLLMDivergence(context.spovText);
    const qualityResult = await evaluateDOK4Quality({
      ...context,
      traceabilityResult,
      divergenceResult,
      previousEvaluation,
    });

    const finalScore = Math.min(qualityResult.score, context.foundationCeiling);
    const antimemeticResult = finalScore >= 3
      ? await assessAntimemetic(
          context.spovText,
          context.brainliftPurpose,
          finalScore,
          qualityResult.positionSummary,
        )
      : null;

    const result: DOK4GradeResult = {
      foundationIntegrityIndex: context.foundationIndex,
      dok1FoundationScore: context.dok1FoundationScore,
      dok2FoundationScore: context.dok2FoundationScore,
      dok3FoundationScore: context.dok3FoundationScore,
      foundationCeiling: context.foundationCeiling,
      traceabilityFlagged: traceabilityResult.flagged,
      traceabilityFlaggedSource: traceabilityResult.flaggedSource,
      traceabilityOverlapSummary: traceabilityResult.overlapSummary,
      divergenceQuestion: divergenceResult.question,
      divergenceVanillaResponse: divergenceResult.vanillaResponse,
      qualityScoreRaw: qualityResult.score,
      score: finalScore,
      positionSummary: qualityResult.positionSummary,
      frameworkDependency: qualityResult.frameworkDependency,
      keyEvidence: qualityResult.keyEvidence,
      criteriaBreakdown: qualityResult.criteria,
      rationale: qualityResult.rationale,
      // Frozen preview is not persisted and is not readability-rewritten; raw
      // mirrors the rationale to satisfy the shared result type.
      rationaleRaw: qualityResult.rationale,
      feedback: qualityResult.feedback,
      antimemeticAssessment: antimemeticResult,
      evaluatorModel: 'dok4-frozen-pipeline',
    };

    return {
      status: 'graded',
      score: finalScore,
      result,
    };
  } catch (error: any) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
