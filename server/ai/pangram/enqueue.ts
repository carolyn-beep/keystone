import type { PangramEntityType } from '@shared/schema';
import { and, db, dok2Summaries, dok3Insights, dok4Spovs, eq } from '../../storage/base';
import { withJob } from '../../utils/withJob';

export type EnqueuePangramAnalysisInput = {
  entityType: PangramEntityType;
  entityId: number;
  brainliftId: number;
};

export async function pangramEntityExistsForBrainlift(
  input: EnqueuePangramAnalysisInput,
): Promise<boolean> {
  const { entityType, entityId, brainliftId } = input;

  if (entityType === 'dok2_summary') {
    const rows = await db
      .select({ id: dok2Summaries.id })
      .from(dok2Summaries)
      .where(and(eq(dok2Summaries.id, entityId), eq(dok2Summaries.brainliftId, brainliftId)))
      .limit(1);
    return rows.length > 0;
  }

  if (entityType === 'dok3_insight') {
    const rows = await db
      .select({ id: dok3Insights.id })
      .from(dok3Insights)
      .where(and(eq(dok3Insights.id, entityId), eq(dok3Insights.brainliftId, brainliftId)))
      .limit(1);
    return rows.length > 0;
  }

  if (entityType === 'dok4_spov') {
    const rows = await db
      .select({ id: dok4Spovs.id })
      .from(dok4Spovs)
      .where(and(eq(dok4Spovs.id, entityId), eq(dok4Spovs.brainliftId, brainliftId)))
      .limit(1);
    return rows.length > 0;
  }

  const _exhaustive: never = entityType;
  throw new Error(`Unknown pangram entityType: ${String(_exhaustive)}`);
}

export async function enqueuePangramAnalysis(
  input: EnqueuePangramAnalysisInput,
): Promise<boolean> {
  if (!(await pangramEntityExistsForBrainlift(input))) {
    console.warn(
      `[Pangram] Skipping pangram:analyze enqueue; ${input.entityType} ${input.entityId} not found for brainlift ${input.brainliftId}`,
    );
    return false;
  }

  await withJob('pangram:analyze')
    .forPayload(input)
    .withOptions({ maxAttempts: 3 })
    .queue();

  return true;
}
