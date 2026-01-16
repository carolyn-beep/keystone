import { Router } from 'express';
import { storage } from '../storage';
import { LLM_MODEL_NAMES } from '@shared/schema';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';

export const verificationsRouter = Router();

// Get all facts with their verification status for a brainlift
verificationsRouter.get(
  '/api/brainlifts/:slug/verifications',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const factsWithVerifications = await storage.getFactsWithVerifications(brainlift.id);
    res.json({
      brainliftId: brainlift.id,
      facts: factsWithVerifications,
      models: LLM_MODEL_NAMES,
    });
  })
);

// Start verification for a single fact (nested under brainlift for authorization)
verificationsRouter.post(
  '/api/brainlifts/:slug/facts/:factId/verify',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const factId = parseInt(req.params.factId);
    if (isNaN(factId)) {
      throw new BadRequestError('Invalid fact ID');
    }

    // Get the fact with brainlift ownership verification
    const targetFact = await storage.getFactByIdForBrainlift(factId, req.brainlift!.id);

    if (!targetFact) {
      throw new NotFoundError('Fact not found');
    }

    // Create or get existing verification record
    const verification = await storage.createFactVerification(factId);

    // Update status to in_progress
    await storage.updateFactVerification(verification.id, { status: 'in_progress' });

    // Step 1: Fetch evidence from the source
    console.log(`Fetching evidence for fact ${factId}...`);
    const evidence = await fetchEvidenceForFact(targetFact.fact, targetFact.source || '');

    await storage.updateFactVerification(verification.id, {
      evidenceUrl: evidence.url,
      evidenceContent: evidence.content,
      evidenceFetchedAt: evidence.fetchedAt,
      evidenceError: evidence.error,
    });

    // Step 2: Get model weights from accuracy stats (if any human feedback exists)
    const accuracyStats = await storage.getModelAccuracyStats();
    const modelWeights: Record<string, number> = {};
    for (const stat of accuracyStats) {
      modelWeights[stat.model] = parseFloat(stat.weight) || 1;
    }

    // Step 3: Run multi-LLM verification with weighted consensus
    console.log(`Running multi-LLM verification for fact ${factId}...`);
    const verificationResult = await verifyFactWithAllModels(
      targetFact.fact,
      targetFact.source || '',
      evidence.content || '',
      modelWeights as any
    );

    // Step 3: Save individual model scores
    for (const modelResult of verificationResult.modelResults) {
      await storage.saveModelScore(verification.id, {
        model: modelResult.model,
        score: modelResult.score,
        rationale: modelResult.rationale,
        status: modelResult.status,
        error: modelResult.error,
      });
    }

    // Step 4: Check if all models failed
    const allFailed = verificationResult.modelResults.every(r => r.status === 'failed');
    const finalStatus = allFailed ? 'failed' : 'completed';

    // Step 5: Save consensus
    await storage.updateFactVerification(verification.id, {
      status: finalStatus,
      consensusScore: verificationResult.consensus.consensusScore,
      confidenceLevel: verificationResult.consensus.confidenceLevel,
      needsReview: verificationResult.consensus.needsReview,
      verificationNotes: verificationResult.consensus.verificationNotes,
    });

    // Return updated verification
    const updatedVerification = await storage.getFactVerification(factId);
    res.json(updatedVerification);
  })
);

// Start verification for all facts in a brainlift
verificationsRouter.post(
  '/api/brainlifts/:slug/verify-all',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Return immediately, process in background
    res.json({
      message: 'Verification started',
      totalFacts: brainlift.facts.length,
      status: 'in_progress'
    });

    // Process facts one by one in background
    (async () => {
      for (const fact of brainlift.facts) {
        try {
          console.log(`Verifying fact ${fact.id}: ${fact.fact.slice(0, 50)}...`);

          const verification = await storage.createFactVerification(fact.id);
          await storage.updateFactVerification(verification.id, { status: 'in_progress' });

          const evidence = await fetchEvidenceForFact(fact.fact, fact.source || '');
          await storage.updateFactVerification(verification.id, {
            evidenceUrl: evidence.url,
            evidenceContent: evidence.content,
            evidenceFetchedAt: evidence.fetchedAt,
            evidenceError: evidence.error,
          });

          // Get model weights
          const accuracyStats = await storage.getModelAccuracyStats();
          const modelWeights: Record<string, number> = {};
          for (const stat of accuracyStats) {
            modelWeights[stat.model] = parseFloat(stat.weight) || 1;
          }

          const verificationResult = await verifyFactWithAllModels(
            fact.fact,
            fact.source || '',
            evidence.content || '',
            modelWeights as any
          );

          for (const modelResult of verificationResult.modelResults) {
            await storage.saveModelScore(verification.id, {
              model: modelResult.model,
              score: modelResult.score,
              rationale: modelResult.rationale,
              status: modelResult.status,
              error: modelResult.error,
            });
          }

          const allFailed = verificationResult.modelResults.every(r => r.status === 'failed');
          const finalStatus = allFailed ? 'failed' : 'completed';

          await storage.updateFactVerification(verification.id, {
            status: finalStatus,
            consensusScore: verificationResult.consensus.consensusScore,
            confidenceLevel: verificationResult.consensus.confidenceLevel,
            needsReview: verificationResult.consensus.needsReview,
            verificationNotes: verificationResult.consensus.verificationNotes,
          });

          console.log(`Fact ${fact.id} verified: ${verificationResult.consensus.consensusScore}/5 (${finalStatus})`);
        } catch (e: any) {
          console.error(`Failed to verify fact ${fact.id}:`, e);
        }
      }
      console.log(`Verification complete for brainlift: ${brainlift.slug}`);
    })();
  })
);

// Human override for a fact verification (nested under brainlift for authorization)
verificationsRouter.post(
  '/api/brainlifts/:slug/verifications/:verificationId/override',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const verificationId = parseInt(req.params.verificationId);
    if (isNaN(verificationId)) {
      throw new BadRequestError('Invalid verification ID');
    }
    const { score, notes } = req.body;

    if (!score || score < 1 || score > 5) {
      throw new BadRequestError('Score must be between 1 and 5');
    }

    // Verify ownership and set human override
    const updated = await storage.setHumanOverrideForBrainlift(
      verificationId, req.brainlift!.id, score, notes || ''
    );
    res.json(updated);
  })
);

// Human grade for a fact (creates verification if needed, sets human override)
verificationsRouter.post(
  '/api/brainlifts/:slug/facts/:factId/human-grade',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const factId = parseInt(req.params.factId);
    if (isNaN(factId)) {
      throw new BadRequestError('Invalid fact ID');
    }
    const { score, notes } = req.body;

    if (!score || score < 1 || score > 5) {
      throw new BadRequestError('Score must be between 1 and 5');
    }

    // Get or create verification for this fact (with brainlift ownership check)
    let verification = await storage.getFactVerificationForBrainlift(factId, req.brainlift!.id);
    if (!verification) {
      // Verify the fact belongs to this brainlift before creating verification
      const fact = await storage.getFactByIdForBrainlift(factId, req.brainlift!.id);
      if (!fact) {
        throw new NotFoundError('Fact not found');
      }
      verification = await storage.createFactVerification(factId) as any;
    }

    // Set human override
    const updated = await storage.setHumanOverride(verification.id, score, notes || '');
    res.json(updated);
  })
);

// Get human grades for all facts in a brainlift
verificationsRouter.get(
  '/api/brainlifts/:slug/human-grades',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const factsWithVerifications = await storage.getFactsWithVerifications(req.brainlift!.id);

    // Return map of factId -> human grade info
    const grades: Record<number, { score: number | null; notes: string | null }> = {};
    for (const f of factsWithVerifications) {
      if (f.verification?.humanOverrideScore) {
        grades[f.id] = {
          score: f.verification.humanOverrideScore,
          notes: f.verification.humanOverrideNotes,
        };
      }
    }

    res.json(grades);
  })
);

// Get verification status summary for a brainlift
verificationsRouter.get(
  '/api/brainlifts/:slug/verification-summary',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const factsWithVerifications = await storage.getFactsWithVerifications(req.brainlift!.id);

    const summary = {
      totalFacts: factsWithVerifications.length,
      verified: 0,
      pending: 0,
      inProgress: 0,
      needsReview: 0,
      byScore: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>,
      averageConsensus: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
    };

    let totalScores = 0;
    for (const fact of factsWithVerifications) {
      if (!fact.verification) {
        summary.pending++;
      } else if (fact.verification.status === 'in_progress') {
        summary.inProgress++;
      } else if (fact.verification.status === 'completed') {
        summary.verified++;

        const score = fact.verification.humanOverrideScore || fact.verification.consensusScore || 0;
        if (score >= 1 && score <= 5) {
          summary.byScore[score]++;
          totalScores += score;
        }

        if (fact.verification.needsReview) {
          summary.needsReview++;
        }

        if (fact.verification.confidenceLevel === 'high') summary.highConfidence++;
        else if (fact.verification.confidenceLevel === 'medium') summary.mediumConfidence++;
        else summary.lowConfidence++;
      }
    }

    summary.averageConsensus = summary.verified > 0 ? Math.round((totalScores / summary.verified) * 10) / 10 : 0;

    res.json(summary);
  })
);
