import type { JobHelpers } from 'graphile-worker';
import { db, eq, facts } from '../storage/base';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact, type EvidenceResult } from '../ai/evidenceFetcher';
import { storage } from '../storage';
import { resolveYouTubeTranscript } from '../utils/resolve-youtube-transcript';
import { recomputeBrainliftScore } from '../services/brainlift';
import { persistFactVerification } from '../services/persist-fact-verification';
import { rewriteForPersist } from '../ai/readability/integrate';

/**
 * Background job: grade a single newly created DOK1 fact.
 * Same pipeline as discussionVerifyFactJob but decoupled from discussion context.
 */
export async function dok1GradeSingleJob(
  payload: { factId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { factId, brainliftId } = payload;
  const isFinalAttempt = helpers.job.attempts >= helpers.job.max_attempts;
  helpers.logger.info(`[DOK1 Grade Single] Starting verification for fact ${factId}`);

  const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
  if (!fact) {
    helpers.logger.error(`[DOK1 Grade Single] Fact ${factId} not found for brainlift ${brainliftId}`);
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
        const transcriptCache = new Map<string, string | null>();
        const cachedTranscript = await resolveYouTubeTranscript(fact.source, transcriptCache);
        const evidenceResult = await fetchEvidenceForFact(fact.fact, fact.source, undefined, cachedTranscript);
        evidence = evidenceResult;
        linkFailed = !!evidence.error;
      } catch (err) {
        helpers.logger.error(`[DOK1 Grade Single] Evidence fetch failed for fact ${factId}:`, { err });
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

    // Verify with LLMs
    const verification = await verifyFactWithAllModels(
      fact.fact,
      fact.source || '',
      evidence,
      linkFailed
    );

    let finalScore = verification.consensus.consensusScore;
    let isGradeable = true;
    let rationale = verification.consensus.verificationNotes;

    if (verification.consensus.isNonGradeable) {
      rationale = `As the source link is not accessible, this DOK1 could not be graded - ${rationale}`;
      isGradeable = false;
      finalScore = 0;
    }

    // Build source hyperlink for note
    let sourceHyperlink = '';
    if (fact.source && fact.source.startsWith('http')) {
      sourceHyperlink = `Source: [${fact.source}](${fact.source})`;
    } else {
      sourceHyperlink = 'No sources have been linked to this fact';
    }

    const finalNote = `${rationale}\n\n${sourceHyperlink}`;

    // Readability rewrite: simplify/shorten the rationale prose for a high-school
    // audience, then re-append the source link. Never touches the score. On any
    // failure the original rationale is used (note === note_raw === finalNote).
    const { userFacing: rewrittenRationale } = await rewriteForPersist(rationale, {
      level: 'DOK1',
      itemId: factId,
      brainliftId,
    });
    const userFacingNote = `${rewrittenRationale}\n\n${sourceHyperlink}`;

    // Update fact score, note (rewritten/user-facing), note_raw (grader original),
    // and set status to graded. Score is unchanged by the rewrite step.
    await db
      .update(facts)
      .set({
        score: finalScore,
        note: userFacingNote,
        noteRaw: finalNote,
        isGradeable,
        gradingStatus: 'graded',
      })
      .where(eq(facts.id, factId));

    try {
      await persistFactVerification({
        factId,
        evidence,
        verification,
      });
    } catch (err) {
      helpers.logger.error(`[DOK1 Grade Single] Verification persistence failed for fact ${factId}:`, { err });
    }

    helpers.logger.info(
      `[DOK1 Grade Single] Fact ${factId} verified: score=${finalScore}, gradeable=${isGradeable}`
    );
  } catch (err) {
    helpers.logger.error(
      `[DOK1 Grade Single] Verification failed for fact ${factId} (attempt ${helpers.job.attempts}/${helpers.job.max_attempts}):`,
      { err },
    );
    if (!isFinalAttempt) {
      throw err;
    }
    await db.update(facts).set({ gradingStatus: 'error' }).where(eq(facts.id, factId));
  }

  // Recompute brainlift score regardless of grading success
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'grade',
    dokLevel: 1,
    itemId: factId,
  });
}
