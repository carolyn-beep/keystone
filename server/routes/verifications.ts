import { Router } from 'express';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';

export const verificationsRouter = Router();

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
      verification = await storage.createFactVerification(factId) as NonNullable<typeof verification>;
    }

    // Set human override
    const updated = await storage.setHumanOverride(verification!.id, score, notes || '');
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
