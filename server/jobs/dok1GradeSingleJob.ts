import type { JobHelpers } from 'graphile-worker';
import { db, eq, facts } from '../storage/base';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { storage } from '../storage';
import { resolveYouTubeTranscript } from '../utils/resolve-youtube-transcript';
import { recomputeBrainliftScore } from '../services/brainlift';

/**
 * Background job: grade a single newly created DOK1 fact.
 * Same pipeline as discussionVerifyFactJob but decoupled from discussion context.
 */
export async function dok1GradeSingleJob(
  payload: { factId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { factId, brainliftId } = payload;
  helpers.logger.info(`[DOK1 Grade Single] Starting verification for fact ${factId}`);

  const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
  if (!fact) {
    helpers.logger.error(`[DOK1 Grade Single] Fact ${factId} not found for brainlift ${brainliftId}`);
    return;
  }

  try {
    // Fetch evidence
    let evidenceContent = '';
    let linkFailed = false;
    if (fact.source) {
      try {
        const transcriptCache = new Map<string, string | null>();
        const cachedTranscript = await resolveYouTubeTranscript(fact.source, transcriptCache);
        const evidence = await fetchEvidenceForFact(fact.fact, fact.source, undefined, cachedTranscript);
        evidenceContent = evidence.content || '';
        linkFailed = !!evidence.error;
      } catch (err) {
        helpers.logger.error(`[DOK1 Grade Single] Evidence fetch failed for fact ${factId}:`, { err });
        linkFailed = true;
      }
    }

    // Verify with LLMs
    const verification = await verifyFactWithAllModels(
      fact.fact,
      fact.source || '',
      evidenceContent,
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

    // Update fact score, note, and set status to graded
    await db
      .update(facts)
      .set({ score: finalScore, note: finalNote, isGradeable, gradingStatus: 'graded' })
      .where(eq(facts.id, factId));

    // Create verification record
    await storage.createFactVerification(factId);

    helpers.logger.info(
      `[DOK1 Grade Single] Fact ${factId} verified: score=${finalScore}, gradeable=${isGradeable}`
    );
  } catch (err) {
    helpers.logger.error(`[DOK1 Grade Single] Verification failed for fact ${factId}:`, { err });
    await db.update(facts).set({ gradingStatus: 'error' }).where(eq(facts.id, factId));
  }

  // Recompute brainlift score regardless of grading success
  await recomputeBrainliftScore(brainliftId);
}
