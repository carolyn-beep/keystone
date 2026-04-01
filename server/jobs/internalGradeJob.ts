/**
 * Background job: internal:grade
 *
 * Runs the full grading pipeline for a brainlift submitted via the internal API.
 * Calls saveBrainliftFromAI with the extracted data, then marks import complete.
 *
 * Errors are logged but not rethrown — the job should not retry on pipeline failures.
 */

import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';

export async function internalGradeJob(
  payload: {
    brainliftId: number;
    slug: string;
    userId: string;
    extractedData: {
      title: string;
      description: string;
      owner: string | null;
      classification: string;
      summary: { totalFacts: number; meanScore: string; score5Count: number; contradictionCount: number };
      facts: Array<{
        id: string;
        category: string;
        source: string | null;
        fact: string;
        score: number;
        aiNotes: string;
        contradicts: string | null;
        flags?: string[];
      }>;
      contradictionClusters: Array<{
        name: string;
        factIds: string[];
        claims: string[];
        tension: string;
        status: string;
      }>;
      dok2Summaries?: any[];
      dok3Insights?: any[];
      dok4Spovs?: any[];
    };
    originalContent: string;
  },
  helpers: JobHelpers,
) {
  const { brainliftId, slug, userId, extractedData, originalContent } = payload;

  helpers.logger.info('Starting internal grade job', { brainliftId, slug });

  try {
    // Dynamically import to avoid circular dependencies
    const { saveBrainliftFromAI } = await import('../services/brainlift');

    // Run the full grading pipeline (DOK1 verification + DOK2 grading + DOK3/DOK4 auto-link + grade)
    // autoLink=true for fire-and-forget mode
    await saveBrainliftFromAI(
      extractedData as any, // Serialized BrainliftOutput from job payload — structural match but not identical type
      originalContent,
      'markdown',
      userId,
      0,          // retryCount
      undefined,  // no progress callback (background job)
      true,       // autoLink
    );

    // Mark import as complete
    await storage.updateImportStatus(brainliftId, 'complete');

    helpers.logger.info('Internal grade job completed', { brainliftId, slug });
  } catch (error: any) {
    helpers.logger.error('Internal grade job failed', {
      brainliftId,
      slug,
      error: error.message,
    });
    // Do NOT rethrow — we don't want Graphile Worker to retry pipeline failures
  }
}
