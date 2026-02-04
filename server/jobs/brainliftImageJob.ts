import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { generateBrainliftImage } from '../ai/imageGenerator';

/**
 * Background job to generate a cover image for a brainlift.
 *
 * Queued from: runPostProcessingPipeline() after expert extraction
 */
export async function brainliftImageJob(
  payload: {
    brainliftId: number;
  },
  helpers: JobHelpers
) {
  const { brainliftId } = payload;

  helpers.logger.info('Starting brainlift image generation', { brainliftId });

  try {
    // Check if image already exists (skip if coverImageUrl is set)
    const brainlift = await storage.getBrainliftById(brainliftId);
    if (!brainlift) {
      throw new Error(`Brainlift not found: ${brainliftId}`);
    }

    if (brainlift.coverImageUrl) {
      helpers.logger.info('Skipping - cover image already exists', {
        brainliftId,
        existingUrl: brainlift.coverImageUrl,
      });
      return {
        success: true,
        skipped: true,
        reason: 'cover_image_exists',
        existingUrl: brainlift.coverImageUrl,
      };
    }

    // Generate the image
    const coverImageUrl = await generateBrainliftImage(brainliftId);

    if (!coverImageUrl) {
      helpers.logger.warn('Image generation skipped (not configured)', { brainliftId });
      return {
        success: true,
        skipped: true,
        reason: 'not_configured',
      };
    }

    // Update brainlift with the new cover image URL
    await storage.updateBrainliftCoverImage(brainliftId, coverImageUrl);

    helpers.logger.info('Brainlift image generation completed', {
      brainliftId,
      coverImageUrl,
    });

    return {
      success: true,
      coverImageUrl,
      completedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    console.error('[Brainlift Image] Job failed:', error.message, error.stack);
    helpers.logger.error('Brainlift image generation failed', {
      brainliftId,
      error: error.message,
      stack: error.stack,
    });

    // Don't throw - allow job to complete with error logged
    return {
      success: false,
      error: error.message,
      completedAt: new Date().toISOString(),
    };
  }
}
