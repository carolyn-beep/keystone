/**
 * DOK4 Grading Service
 *
 * Extracted from dok4GradeJob.ts to be callable without a background job context.
 * Used by:
 * - Auto-mode pipeline (grading-pipeline.ts) — inline grading
 * - dok4GradeJob.ts — background job wrapper with emitter integration
 *
 * 6-step pipeline:
 * 1. Load evaluation context
 * 2. POV Validation (gate)
 * 3. Foundation Integrity (from context)
 * 4. Source Traceability
 * 5. LLM Divergence + Quality Evaluation
 * 6. Antimemetic Assessment (gated: score >= 3)
 */

import { storage } from '../storage';
import type { PreviousEvaluation } from '@shared/types/regrading';
import {
  validatePOV,
  checkDOK4SourceTraceability,
  checkLLMDivergence,
  evaluateDOK4Quality,
  assessAntimemetic,
} from './dok4Grader';

export interface DOK4GradeServiceResult {
  status: 'graded' | 'rejected' | 'error';
  score?: number;
  rejectionCategory?: string;
  error?: string;
}

/**
 * Grade a single DOK4 SPOV through the full pipeline.
 *
 * Non-throwing: always returns a result object.
 * The caller (pipeline or job) handles status updates and SSE events.
 */
export async function gradeDOK4Spov(
  spovId: number,
  brainliftId: number,
  onProgress?: (message: string) => void,
  previousEvaluation?: PreviousEvaluation,
): Promise<DOK4GradeServiceResult> {
  // Load evaluation context (includes foundation computation)
  const context = await storage.getSpovEvaluationContext(spovId);

  if (!context) {
    console.error(`[DOK4 Grade Service] No evaluation context for SPOV ${spovId}`);
    await storage.updateDOK4SpovStatus(spovId, brainliftId, 'error');
    return { status: 'error', error: 'No evaluation context available' };
  }

  // Set status to grading
  await storage.updateDOK4SpovStatus(spovId, brainliftId, 'grading');

  try {
    // Step 1: POV Validation
    onProgress?.('Validating point of view...');

    const povResult = await validatePOV(
      context.spovText,
      context.primaryDok3.text,
      context.brainliftPurpose,
    );

    if (!povResult.accept) {
      console.log(`[DOK4 Grade Service] SPOV ${spovId} rejected: ${povResult.rejectionCategory}`);
      await storage.saveDOK4Rejection(spovId, {
        rejectionReason: povResult.rejectionReason!,
        rejectionCategory: povResult.rejectionCategory!,
      });
      return {
        status: 'rejected',
        rejectionCategory: povResult.rejectionCategory!,
      };
    }

    // Step 2: Foundation Integrity (already computed in context)
    onProgress?.(`Foundation integrity: ${context.foundationIndex.toFixed(2)} (ceiling: ${context.foundationCeiling})`);

    // Step 3: Source Traceability
    onProgress?.('Checking source traceability...');

    const traceabilitySources = context.linkedDok2s.map((d: any) => ({
      sourceName: d.sourceName,
      dok2Points: d.points,
      content: context.sourceEvidence.find((s: any) => s.sourceName === d.sourceName)?.content ?? '',
    }));

    const traceabilityResult = await checkDOK4SourceTraceability(
      context.spovText,
      traceabilitySources,
    );

    // Step 4: LLM Divergence
    onProgress?.('Checking LLM divergence...');
    const divergenceResult = await checkLLMDivergence(context.spovText);

    // Step 5: Quality Evaluation
    onProgress?.('Evaluating quality...');

    const fullContext = {
      ...context,
      traceabilityResult,
      divergenceResult,
      previousEvaluation,
    };

    const qualityResult = await evaluateDOK4Quality(fullContext);

    // Final score = min(raw, ceiling)
    const finalScore = Math.min(qualityResult.score, context.foundationCeiling);

    // Step 6: Antimemetic Assessment (gated: score >= 3)
    let antimemeticResult = null;
    if (finalScore >= 3) {
      onProgress?.('Assessing antimemetic barriers...');
      antimemeticResult = await assessAntimemetic(
        context.spovText,
        context.brainliftPurpose,
        finalScore,
        qualityResult.positionSummary,
      );
    }

    // Save full result
    await storage.saveDOK4GradeResult(spovId, {
      // Foundation
      foundationIntegrityIndex: context.foundationIndex,
      dok1FoundationScore: context.dok1FoundationScore,
      dok2FoundationScore: context.dok2FoundationScore,
      dok3FoundationScore: context.dok3FoundationScore,
      foundationCeiling: context.foundationCeiling,
      // Traceability
      traceabilityFlagged: traceabilityResult.flagged,
      traceabilityFlaggedSource: traceabilityResult.flaggedSource,
      traceabilityOverlapSummary: traceabilityResult.overlapSummary,
      // Divergence
      divergenceQuestion: divergenceResult.question,
      divergenceVanillaResponse: divergenceResult.vanillaResponse,
      // Quality
      qualityScoreRaw: qualityResult.score,
      score: finalScore,
      positionSummary: qualityResult.positionSummary,
      frameworkDependency: qualityResult.frameworkDependency,
      keyEvidence: qualityResult.keyEvidence,
      vulnerabilityPoints: qualityResult.vulnerabilityPoints,
      criteriaBreakdown: qualityResult.criteria,
      rationale: qualityResult.rationale,
      feedback: qualityResult.feedback,
      // Antimemetic
      antimemeticAssessment: antimemeticResult,
      // Metadata
      evaluatorModel: 'dok4-pipeline',
    });

    console.log(`[DOK4 Grade Service] SPOV ${spovId} graded: score=${finalScore} (raw=${qualityResult.score}, ceiling=${context.foundationCeiling})`);

    return { status: 'graded', score: finalScore };
  } catch (err: any) {
    console.error(`[DOK4 Grade Service] Grading failed for SPOV ${spovId}:`, err);
    await storage.updateDOK4SpovStatus(spovId, brainliftId, 'error');
    return { status: 'error', error: err.message };
  }
}
