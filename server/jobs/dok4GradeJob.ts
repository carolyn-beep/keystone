import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { dok4GradingEmitter } from '../events/dok4GradingEmitter';
import {
  validatePOV,
  checkDOK4SourceTraceability,
  checkLLMDivergence,
  evaluateDOK4Quality,
  assessAntimemetic,
} from '../ai/dok4Grader';
import { recomputeBrainliftScore } from '../services/brainlift';

/**
 * Background job: grade a single DOK4 SPOV.
 *
 * No gate-polling -- prerequisites are guaranteed by the reactive trigger
 * (triggerDependentDOK4Grading) which only queues this job when all linked
 * DOK3 insights are graded.
 *
 * Pipeline:
 * 1. Sanity check (verify context available)
 * 2. POV Validation -- gate (rejects ungradable submissions)
 * 3. Foundation Integrity (computed in evaluation context)
 * 4. Source Traceability
 * 5. LLM Divergence
 * 6. Quality Evaluation -- final score = min(raw, ceiling)
 * 7. Antimemetic Assessment (gated: score >= 3)
 * 8. Save result + recompute brainlift score
 */
export async function dok4GradeJob(
  payload: { spovId: number; brainliftId: number },
  helpers: JobHelpers,
): Promise<void> {
  const { spovId, brainliftId } = payload;
  helpers.logger.info(`[DOK4 Grade] Starting job for SPOV ${spovId}, brainlift ${brainliftId}`);

  // Ensure grading session is tracked
  if (!dok4GradingEmitter.isGradingActive(brainliftId)) {
    dok4GradingEmitter.startGrading(brainliftId);
  }

  dok4GradingEmitter.emitEvent(brainliftId, {
    type: 'dok4:start',
    spovId,
    brainliftId,
    message: `Starting grading for SPOV ${spovId}`,
  });

  // Load evaluation context (includes foundation computation)
  const context = await storage.getSpovEvaluationContext(spovId);

  if (!context) {
    helpers.logger.error(`[DOK4 Grade] No evaluation context for SPOV ${spovId} (not found or no links)`);
    await storage.updateDOK4SpovStatus(spovId, brainliftId, 'error');
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:error',
      spovId,
      brainliftId,
      message: 'No evaluation context available (SPOV not found or missing DOK3 links)',
      error: 'No evaluation context',
    });
    return;
  }

  // Set status to grading
  await storage.updateDOK4SpovStatus(spovId, brainliftId, 'grading');

  try {
    // Step 1: POV Validation
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:validation',
      spovId,
      brainliftId,
      message: 'Validating point of view...',
    });

    const povResult = await validatePOV(
      context.spovText,
      context.primaryDok3.text,
      context.brainliftPurpose,
    );

    if (!povResult.accept) {
      helpers.logger.info(`[DOK4 Grade] SPOV ${spovId} rejected: ${povResult.rejectionCategory}`);
      await storage.saveDOK4Rejection(spovId, {
        rejectionReason: povResult.rejectionReason!,
        rejectionCategory: povResult.rejectionCategory!,
      });

      dok4GradingEmitter.emitEvent(brainliftId, {
        type: 'dok4:rejected',
        spovId,
        brainliftId,
        message: `SPOV rejected: ${povResult.rejectionCategory}`,
      });
      return;
    }

    // Step 2: Foundation Integrity (already computed in context)
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:foundation',
      spovId,
      brainliftId,
      message: `Foundation integrity: ${context.foundationIndex.toFixed(2)} (ceiling: ${context.foundationCeiling})`,
    });

    // Step 3: Source Traceability
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:traceability',
      spovId,
      brainliftId,
      message: 'Checking source traceability...',
    });

    const traceabilitySources = context.linkedDok2s.map(d => ({
      sourceName: d.sourceName,
      dok2Points: d.points,
      content: context.sourceEvidence.find(s => s.sourceName === d.sourceName)?.content ?? '',
    }));

    const traceabilityResult = await checkDOK4SourceTraceability(
      context.spovText,
      traceabilitySources,
    );

    // Step 4: LLM Divergence
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:divergence',
      spovId,
      brainliftId,
      message: 'Checking LLM divergence...',
    });

    const divergenceResult = await checkLLMDivergence(context.spovText);

    // Step 5: Quality Evaluation
    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:evaluation',
      spovId,
      brainliftId,
      message: 'Evaluating quality...',
    });

    // Build full context with traceability and divergence results
    const fullContext = {
      ...context,
      traceabilityResult,
      divergenceResult,
    };

    const qualityResult = await evaluateDOK4Quality(fullContext);

    // Final score = min(raw, ceiling)
    const finalScore = Math.min(qualityResult.score, context.foundationCeiling);

    // Step 6: Antimemetic Assessment (gated: score >= 3)
    let antimemeticResult = null;
    if (finalScore >= 3) {
      dok4GradingEmitter.emitEvent(brainliftId, {
        type: 'dok4:antimemetic',
        spovId,
        brainliftId,
        message: 'Assessing antimemetic barriers...',
      });

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

    dok4GradingEmitter.emitEvent(brainliftId, {
      type: 'dok4:complete',
      spovId,
      brainliftId,
      message: `Grading complete: score ${finalScore}`,
      score: finalScore,
    });

    helpers.logger.info(`[DOK4 Grade] SPOV ${spovId} graded: score=${finalScore} (raw=${qualityResult.score}, ceiling=${context.foundationCeiling})`);
  } catch (err: any) {
    const attempts = helpers.job.attempts;
    const maxAttempts = helpers.job.max_attempts;
    const isLastAttempt = attempts >= maxAttempts;

    helpers.logger.error(`[DOK4 Grade] Grading failed for SPOV ${spovId} (attempt ${attempts}/${maxAttempts}):`, { err });

    if (isLastAttempt) {
      await storage.updateDOK4SpovStatus(spovId, brainliftId, 'error');
      dok4GradingEmitter.emitEvent(brainliftId, {
        type: 'dok4:error',
        spovId,
        brainliftId,
        message: `Grading failed after ${maxAttempts} attempts: ${err.message}`,
        error: err.message,
      });
    } else {
      throw err;
    }
  }

  // Recompute brainlift score after each SPOV is graded
  try {
    await recomputeBrainliftScore(brainliftId);
  } catch (err: any) {
    helpers.logger.error(`[DOK4 Grade] Score recomputation failed:`, { err });
  }
}
