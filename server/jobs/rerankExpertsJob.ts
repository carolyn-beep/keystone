import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { rerankExistingExperts } from '../ai/experts';

export async function rerankExpertsJob(
  payload: { brainliftId: number },
  helpers: JobHelpers,
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting experts rerank job', { brainliftId });

  const [brainlift, facts, existingExperts] = await Promise.all([
    storage.getBrainliftById(brainliftId),
    storage.getFactsForBrainlift(brainliftId),
    storage.getExpertsByBrainliftId(brainliftId),
  ]);

  if (!brainlift) {
    helpers.logger.warn('Skipping experts rerank: brainlift not found', { brainliftId });
    return { success: false, reason: 'brainlift_not_found' as const };
  }

  if (existingExperts.length === 0) {
    helpers.logger.info('Skipping experts rerank: no experts to rank', { brainliftId });
    return { success: true, updated: 0 };
  }

  try {
    const rankings = await rerankExistingExperts({
      title: brainlift.title,
      description: brainlift.description,
      author: brainlift.author,
      facts,
      originalContent: brainlift.originalContent || undefined,
      experts: existingExperts,
    });

    await storage.updateExpertRankings(brainliftId, rankings);

    helpers.logger.info('Experts rerank job completed', {
      brainliftId,
      updated: rankings.length,
    });

    return { success: true, updated: rankings.length };
  } catch (error: any) {
    helpers.logger.error('Experts rerank job failed', {
      brainliftId,
      error: error?.message ?? String(error),
    });
    throw error;
  }
}
