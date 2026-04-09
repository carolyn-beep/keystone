import type { JobHelpers } from 'graphile-worker';
import { db, eq, facts } from '../storage/base';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { storage } from '../storage';
import { resolveYouTubeTranscript } from '../utils/resolve-youtube-transcript';
import { persistFactVerification } from '../services/persist-fact-verification';

/**
 * Background job: verify a DOK1 fact saved during a discussion session.
 * Same logic as the brainlift import grading pipeline, but for a single fact.
 */
export async function discussionVerifyFactJob(
  payload: { factId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { factId, brainliftId } = payload;
  helpers.logger.info(`[Discussion Verify] Starting verification for fact ${factId}`);

  const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
  if (!fact) {
    helpers.logger.error(`[Discussion Verify] Fact ${factId} not found for brainlift ${brainliftId}`);
    return;
  }

  // Fetch evidence
  let evidence = {
    url: fact.source || null,
    content: null as string | null,
    error: null as string | null,
    fetchedAt: new Date(),
  };
  let linkFailed = false;
  if (fact.source) {
    try {
      const transcriptCache = new Map<string, string | null>();
      const cachedTranscript = await resolveYouTubeTranscript(fact.source, transcriptCache);
      const evidenceResult = await fetchEvidenceForFact(fact.fact, fact.source, undefined, cachedTranscript);
      evidence = {
        url: evidenceResult.url ?? fact.source,
        content: evidenceResult.content || null,
        error: evidenceResult.error || null,
        fetchedAt: evidenceResult.fetchedAt ? new Date(evidenceResult.fetchedAt) : new Date(),
      };
      linkFailed = !!evidence.error;
    } catch (err) {
      helpers.logger.error(`[Discussion Verify] Evidence fetch failed for fact ${factId}:`, { err });
      evidence = {
        url: fact.source || null,
        content: null,
        error: err instanceof Error ? err.message : String(err),
        fetchedAt: new Date(),
      };
      linkFailed = true;
    }
  }

  // Verify with LLMs
  try {
    const verification = await verifyFactWithAllModels(
      fact.fact,
      fact.source || '',
      evidence.content || '',
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

    // Update fact score and note
    await db
      .update(facts)
      .set({ score: finalScore, note: finalNote, isGradeable })
      .where(eq(facts.id, factId));

    try {
      await persistFactVerification({
        factId,
        evidence,
        verification,
      });
    } catch (err) {
      helpers.logger.error(`[Discussion Verify] Verification persistence failed for fact ${factId}:`, { err });
    }

    helpers.logger.info(
      `[Discussion Verify] Fact ${factId} verified: score=${finalScore}, gradeable=${isGradeable}`
    );
  } catch (err) {
    helpers.logger.error(`[Discussion Verify] Verification failed for fact ${factId}:`, { err });
    // Leave score at 0 — user can manually grade later
  }
}
