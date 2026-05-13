import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact, type EvidenceResult } from '../ai/evidenceFetcher';
import { recomputeBrainliftScore } from '../services/brainlift';
import { persistFactVerification } from '../services/persist-fact-verification';
import type { PreviousEvaluation } from '@shared/types/regrading';
import { db } from '../db';
import { facts } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Background job: regrade a DOK1 fact after text edit.
 * Calls factVerifier with previousEvaluation context for hard floor rule.
 */
export async function dok1RegradeJob(
  payload: { factId: number; brainliftId: number; previousEvaluation: PreviousEvaluation },
  helpers: JobHelpers,
): Promise<void> {
  const { factId, brainliftId, previousEvaluation } = payload;
  helpers.logger.info(`[DOK1 Regrade] Starting for fact ${factId}, brainlift ${brainliftId}`);

  const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
  if (!fact) {
    helpers.logger.info(`[DOK1 Regrade] Fact ${factId} not found (may have been deleted), skipping`);
    return;
  }

  try {
    // Fetch evidence
    let evidence: EvidenceResult = {
      url: fact.source || null,
      content: null as string | null,
      error: null as string | null,
      fetchedAt: new Date(),
      mode: 'none',
      originalSourceUrl: fact.source || null,
    };
    let linkFailed = false;
    if (fact.source) {
      try {
        const evidenceResult = await fetchEvidenceForFact(fact.fact, fact.source);
        evidence = evidenceResult;
        linkFailed = !!evidence.error;
      } catch (err: any) {
        helpers.logger.error(`[DOK1 Regrade] Evidence fetch failed:`, { err });
        evidence = {
          url: fact.source || null,
          content: null,
          error: err instanceof Error ? err.message : String(err),
          fetchedAt: new Date(),
          mode: 'none',
          originalSourceUrl: fact.source || null,
        };
        linkFailed = true;
      }
    }

    // Verify with previousEvaluation context
    const verification = await verifyFactWithAllModels(
      fact.fact,
      fact.source || '',
      evidence,
      linkFailed,
      previousEvaluation,
    );

    const finalScore = verification.consensus.consensusScore;
    const isGradeable = !verification.consensus.isNonGradeable;
    const rationale = verification.consensus.verificationNotes;

    // Update fact grading and set status to graded
    await storage.updateFactGrading(factId, brainliftId, {
      score: isGradeable ? finalScore : 0,
      note: rationale,
      isGradeable,
      summary: fact.summary || '',
    });
    await db.update(facts).set({ gradingStatus: 'graded' }).where(eq(facts.id, factId));

    try {
      await persistFactVerification({
        factId,
        evidence,
        verification,
      });
    } catch (err) {
      helpers.logger.error(`[DOK1 Regrade] Verification persistence failed for fact ${factId}:`, { err });
    }

    helpers.logger.info(`[DOK1 Regrade] Fact ${factId} regraded: score=${finalScore}`);
  } catch (err: any) {
    helpers.logger.error(`[DOK1 Regrade] Failed for fact ${factId}:`, { err });
    await db.update(facts).set({ gradingStatus: 'error' }).where(eq(facts.id, factId));
  }

  // Recompute brainlift score
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'regrade',
    dokLevel: 1,
    itemId: factId,
  });
}
