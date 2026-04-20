import type { JobHelpers } from 'graphile-worker';
import { db, eq, dok2Summaries } from '../storage/base';
import { gradeDOK2Summary } from '../ai/dok2Grader';
import { storage } from '../storage';
import { recomputeBrainliftScore } from '../services/brainlift';

/**
 * Background job: grade a single newly created DOK2 summary.
 * Same pipeline as discussionGradeDok2Job but decoupled from discussion context.
 */
export async function dok2GradeSingleJob(
  payload: { summaryId: number; brainliftId: number },
  helpers: JobHelpers
) {
  const { summaryId, brainliftId } = payload;
  const isFinalAttempt = helpers.job.attempts >= helpers.job.max_attempts;
  helpers.logger.info(`[DOK2 Grade Single] Starting grading for summary ${summaryId}`);

  const summary = await storage.getDok2SummaryByIdForBrainlift(summaryId, brainliftId);
  if (!summary) {
    helpers.logger.error(`[DOK2 Grade Single] Summary ${summaryId} not found for brainlift ${brainliftId}`);
    return;
  }

  try {
    // Fetch summary points
    const points = await storage.getDok2PointsForSummary(summaryId);
    const summaryPointTexts = points
      .sort((a: { sortOrder: number | null }, b: { sortOrder: number | null }) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      )
      .map((p: { text: string }) => p.text);

    // Fetch related DOK1 facts
    const relatedDOK1s = await storage.getRelatedDOK1sForSummary(summaryId);

    // Get brainlift purpose
    const brainlift = await storage.getBrainliftById(brainliftId);
    const purpose = brainlift?.displayPurpose || brainlift?.description || '';

    // Grade
    const result = await gradeDOK2Summary(
      summaryPointTexts,
      relatedDOK1s,
      purpose,
      summary.sourceUrl,
    );

    // Update summary with grading results and set status to graded
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
        gradingStatus: 'graded',
      })
      .where(eq(dok2Summaries.id, summaryId));

    helpers.logger.info(
      `[DOK2 Grade Single] Summary ${summaryId} graded: score=${result.score}`
    );
  } catch (err) {
    helpers.logger.error(
      `[DOK2 Grade Single] Grading failed for summary ${summaryId} (attempt ${helpers.job.attempts}/${helpers.job.max_attempts}):`,
      { err },
    );
    if (!isFinalAttempt) {
      throw err;
    }
    await db.update(dok2Summaries).set({ gradingStatus: 'error' }).where(eq(dok2Summaries.id, summaryId));
  }

  // Recompute brainlift score regardless of grading success
  await recomputeBrainliftScore(brainliftId, {
    trigger: 'grade',
    dokLevel: 2,
    itemId: summaryId,
  });
}
