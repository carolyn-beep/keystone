import type { JobHelpers } from 'graphile-worker';
import { db, eq, inArray, dok2Summaries, dok2Points, dok2FactRelations, facts } from '../storage/base';
import { gradeDOK2Summary } from '../ai/dok2Grader';
import { storage } from '../storage';

/**
 * Background job: grade a DOK2 summary saved during a discussion session.
 */
export async function discussionGradeDok2Job(
  payload: { summaryId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { summaryId, brainliftId } = payload;
  helpers.logger.info(`[Discussion Grade] Starting DOK2 grading for summary ${summaryId}`);

  // Fetch the summary
  const [summary] = await db
    .select()
    .from(dok2Summaries)
    .where(eq(dok2Summaries.id, summaryId));

  if (!summary || summary.brainliftId !== brainliftId) {
    helpers.logger.error(`[Discussion Grade] Summary ${summaryId} not found for brainlift ${brainliftId}`);
    return;
  }

  // Fetch summary points
  const points = await db
    .select()
    .from(dok2Points)
    .where(eq(dok2Points.summaryId, summaryId));

  const summaryPointTexts = points
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((p) => p.text);

  // Fetch related fact IDs and their data
  const relations = await db
    .select()
    .from(dok2FactRelations)
    .where(eq(dok2FactRelations.summaryId, summaryId));

  const relatedFactIds = relations.map((r) => r.factId);
  let relatedDOK1s: Array<{ fact: string; source?: string | null }> = [];

  if (relatedFactIds.length > 0) {
    const relatedFacts = await db
      .select({ fact: facts.fact, source: facts.source })
      .from(facts)
      .where(inArray(facts.id, relatedFactIds));
    relatedDOK1s = relatedFacts;
  }

  // Get brainlift purpose
  const brainlift = await storage.getBrainliftById(brainliftId);
  const purpose = brainlift?.displayPurpose || brainlift?.description || '';

  // Grade
  try {
    const result = await gradeDOK2Summary(
      summaryPointTexts,
      relatedDOK1s,
      purpose,
      summary.sourceUrl
    );

    // Update summary with grading results
    await db
      .update(dok2Summaries)
      .set({
        displayTitle: result.displayTitle,
        grade: result.score,
        diagnosis: result.diagnosis,
        feedback: result.feedback,
        failReason: result.failReason,
        sourceVerified: result.sourceVerified,
        gradedAt: new Date(),
      })
      .where(eq(dok2Summaries.id, summaryId));

    helpers.logger.info(
      `[Discussion Grade] Summary ${summaryId} graded: score=${result.score}`
    );
  } catch (err) {
    helpers.logger.error(`[Discussion Grade] Grading failed for summary ${summaryId}:`, { err });
  }
}
