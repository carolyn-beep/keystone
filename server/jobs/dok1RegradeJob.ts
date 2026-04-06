import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { recomputeBrainliftScore } from '../services/brainlift';
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
    let evidenceContent = '';
    let linkFailed = false;
    if (fact.source) {
      try {
        const evidence = await fetchEvidenceForFact(fact.fact, fact.source);
        evidenceContent = evidence.content || '';
        linkFailed = !!evidence.error;
      } catch (err: any) {
        helpers.logger.error(`[DOK1 Regrade] Evidence fetch failed:`, { err });
        linkFailed = true;
      }
    }

    // Verify with previousEvaluation context
    const verification = await verifyFactWithAllModels(
      fact.fact,
      fact.source || '',
      evidenceContent,
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

    helpers.logger.info(`[DOK1 Regrade] Fact ${factId} regraded: score=${finalScore}`);
  } catch (err: any) {
    helpers.logger.error(`[DOK1 Regrade] Failed for fact ${factId}:`, { err });
    await db.update(facts).set({ gradingStatus: 'error' }).where(eq(facts.id, factId));
  }

  // Recompute brainlift score
  await recomputeBrainliftScore(brainliftId);
}
