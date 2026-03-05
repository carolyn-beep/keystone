/**
 * Shared DOK3/DOK4 auto-mode pipeline.
 *
 * Called by saveBrainliftFromAI when autoLink=true.
 * Sequential phases with parallel internals, SSE progress reporting.
 *
 * Phase 1: Auto-link DOK3 insights to DOK2 summaries
 * Phase 2: Grade all linked DOK3 insights (pLimit 5)
 * Phase 3: Auto-link DOK4 SPOVs to DOK3 insights
 * Phase 4: Grade all linked DOK4 SPOVs (pLimit 5)
 * Phase 5: Recompute brainlift score
 */

import pLimit from 'p-limit';
import type { ImportProgress } from '@shared/import-progress';
import { STAGE_LABELS } from '@shared/import-progress';
import { storage } from '../storage';
import { autoLinkDOK3Insights } from '../ai/dok3AutoLinker';
import { gradeDOK3Insight } from '../ai/dok3Grader';
import { autoLinkDOK4Spovs } from '../ai/dok4AutoLinker';
import { gradeDOK4Spov } from '../ai/dok4GraderService';
import { recomputeBrainliftScore } from './brainlift';

type ProgressCallback = (event: ImportProgress) => void;

/**
 * Run the full DOK3+DOK4 auto-link and grading pipeline.
 *
 * Expects:
 * - DOK3 insights already saved (pending_linking) in DB
 * - DOK2 summaries already graded and saved in DB
 * - DOK4 SPOVs already saved (pending_linking) in DB
 *
 * Individual grading errors are logged but do not block subsequent phases.
 */
export async function runDOK3DOK4Pipeline(
  brainliftId: number,
  slug: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const dok3GradeLimit = pLimit(20);
  const dok4GradeLimit = pLimit(10);

  // ── Phase 1: Auto-link DOK3 insights to DOK2 summaries ──

  const insights = await storage.getDOK3Insights(brainliftId, []);
  const dok2Summaries = await storage.getDOK2Summaries(brainliftId);

  if (insights.length > 0 && dok2Summaries.length > 0) {
    const insightInputs = insights.map(i => ({ id: i.id, text: i.text }));
    const dok2Inputs = dok2Summaries.map(d => ({
      id: d.id,
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      displayTitle: d.displayTitle,
      points: d.points || [],
    }));

    onProgress?.({
      stage: 'dok3_linking',
      message: 'Auto-linking DOK3 insights...',
      completed: 0,
      total: insights.length,
    });

    const linkResults = await autoLinkDOK3Insights(brainliftId, insightInputs, dok2Inputs as any);

    onProgress?.({
      stage: 'dok3_linking',
      message: `Auto-linking DOK3 insights...`,
      completed: linkResults.length,
      total: insights.length,
    });
  }

  // ── Phase 2: Grade all linked DOK3 insights ──

  // Re-fetch to get updated statuses after linking
  const linkedInsights = (await storage.getDOK3Insights(brainliftId, []))
    .filter(i => i.status === 'linked');

  if (linkedInsights.length > 0) {
    let dok3Completed = 0;
    const dok3Total = linkedInsights.length;

    onProgress?.({
      stage: 'grading_dok3',
      message: STAGE_LABELS.grading_dok3,
      completed: 0,
      total: dok3Total,
    });

    await Promise.all(linkedInsights.map(insight => dok3GradeLimit(async () => {
      const start = Date.now();
      try {
        await gradeDOK3Insight(insight.id, brainliftId);
      } catch (err) {
        console.error(`[Pipeline] DOK3 grading failed for insight ${insight.id}:`, err);
      }
      dok3Completed++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[Pipeline] DOK3 graded insight ${insight.id} in ${elapsed}s (${dok3Completed}/${dok3Total})`);
      onProgress?.({
        stage: 'grading_dok3',
        message: STAGE_LABELS.grading_dok3,
        completed: dok3Completed,
        total: dok3Total,
      });
    })));
  }

  // ── Phase 3: Auto-link DOK4 SPOVs to DOK3 insights ──

  const spovs = await storage.getDOK4SpovsByStatus
    ? (storage as any).getDOK4SpovsByStatus(brainliftId, 'pending_linking')
    : (await storage.getDOK4Spovs(brainliftId)).filter((s: any) => s.status === 'pending_linking');

  if (spovs.length > 0) {
    // Re-fetch DOK3 insights for linking (may have new graded ones)
    const gradedInsights = (await storage.getDOK3Insights(brainliftId, []))
      .filter((i: any) => i.status === 'graded' || i.status === 'linked');

    if (gradedInsights.length > 0) {
      const dok3Inputs = gradedInsights.map((i: any) => ({ id: i.id, text: i.text }));
      const spovIds = spovs.map((s: any) => s.id);
      const spovTexts = spovs.map((s: any) => s.text);
      // No explicit refs in auto-mode (those come from extraction data)
      const explicitRefs = spovs.map(() => null);

      await autoLinkDOK4Spovs(brainliftId, spovIds, spovTexts, dok3Inputs, explicitRefs);
    }

    onProgress?.({
      stage: 'dok4_linking',
      message: 'Auto-linking DOK4 SPOVs...',
      completed: spovs.length,
      total: spovs.length,
    });
  }

  // ── Phase 4: Grade all linked DOK4 SPOVs ──

  // Re-fetch to get updated statuses after linking
  const linkedSpovs = (await storage.getDOK4Spovs(brainliftId))
    .filter((s: any) => s.status === 'linked');

  if (linkedSpovs.length > 0) {
    let dok4Completed = 0;
    const dok4Total = linkedSpovs.length;

    onProgress?.({
      stage: 'grading_dok4',
      message: STAGE_LABELS.grading_dok4,
      completed: 0,
      total: dok4Total,
    });

    const failedSpovIds: number[] = [];

    await Promise.all(linkedSpovs.map(spov => dok4GradeLimit(async () => {
      const start = Date.now();
      try {
        const result = await gradeDOK4Spov(spov.id, brainliftId);
        if (result.status === 'error') failedSpovIds.push(spov.id);
      } catch (err) {
        console.error(`[Pipeline] DOK4 grading failed for SPOV ${spov.id}:`, err);
        failedSpovIds.push(spov.id);
      }
      dok4Completed++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[Pipeline] DOK4 graded SPOV ${spov.id} in ${elapsed}s (${dok4Completed}/${dok4Total})`);
      onProgress?.({
        stage: 'grading_dok4',
        message: STAGE_LABELS.grading_dok4,
        completed: dok4Completed,
        total: dok4Total,
      });
    })));

    // Retry failed SPOVs once (reset status to 'linked' so grading can re-run)
    if (failedSpovIds.length > 0) {
      console.log(`[Pipeline] Retrying ${failedSpovIds.length} failed DOK4 SPOVs: ${failedSpovIds.join(', ')}`);
      for (const spovId of failedSpovIds) {
        await storage.updateDOK4SpovStatus(spovId, brainliftId, 'linked');
      }
      await Promise.all(failedSpovIds.map(spovId => dok4GradeLimit(async () => {
        const start = Date.now();
        try {
          await gradeDOK4Spov(spovId, brainliftId);
        } catch (err) {
          console.error(`[Pipeline] DOK4 retry grading failed for SPOV ${spovId}:`, err);
        }
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[Pipeline] DOK4 retry graded SPOV ${spovId} in ${elapsed}s`);
      })));
    }
  }

  // ── Phase 5: Recompute brainlift score ──

  await recomputeBrainliftScore(brainliftId);
}
