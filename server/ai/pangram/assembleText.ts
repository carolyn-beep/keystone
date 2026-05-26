/**
 * Assemble the text to analyze for an entity, for the Pangram analyze job.
 *
 * - DOK2: concatenate all dok2_points.text by sort_order ASC, joined by `\n\n`.
 * - DOK3: dok3_insights.text verbatim.
 * - DOK4: dok4_spovs.text verbatim.
 *
 * Empty assembled text (e.g., DOK2 summary with zero points) is a valid
 * lifecycle state -- callers treat empty string as a no-op skip. We
 * deliberately do NOT throw NotFoundError for an empty DOK2 summary.
 *
 * Lives in its own module so the job (in server/jobs/pangramAnalyzeJob.ts)
 * can import a mockable helper.
 */

import { db, eq, and, asc } from '../../storage/base';
import { dok2Points, dok2Summaries, dok3Insights, dok4Spovs } from '@shared/schema';
import { NotFoundError } from '../../middleware/error-handler';
import type { PangramEntityType } from '@shared/schema';

export async function assembleTextForEntity(
  entityType: PangramEntityType,
  entityId: number,
  brainliftId: number,
): Promise<string> {
  if (entityType === 'dok2_summary') {
    const summaries = await db
      .select({ id: dok2Summaries.id })
      .from(dok2Summaries)
      .where(
        and(
          eq(dok2Summaries.id, entityId),
          eq(dok2Summaries.brainliftId, brainliftId),
        ),
      )
      .limit(1);
    if (summaries.length === 0) {
      throw new NotFoundError(
        `DOK2 summary ${entityId} not found for brainlift ${brainliftId}`,
      );
    }

    const points = await db
      .select({ text: dok2Points.text })
      .from(dok2Points)
      .where(eq(dok2Points.summaryId, entityId))
      .orderBy(asc(dok2Points.sortOrder));
    return points.map((p) => p.text).join('\n\n');
  }

  if (entityType === 'dok3_insight') {
    const rows = await db
      .select({ text: dok3Insights.text })
      .from(dok3Insights)
      .where(
        and(
          eq(dok3Insights.id, entityId),
          eq(dok3Insights.brainliftId, brainliftId),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundError(
        `DOK3 insight ${entityId} not found for brainlift ${brainliftId}`,
      );
    }
    return rows[0].text;
  }

  if (entityType === 'dok4_spov') {
    const rows = await db
      .select({ text: dok4Spovs.text })
      .from(dok4Spovs)
      .where(
        and(
          eq(dok4Spovs.id, entityId),
          eq(dok4Spovs.brainliftId, brainliftId),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundError(
        `DOK4 SPOV ${entityId} not found for brainlift ${brainliftId}`,
      );
    }
    return rows[0].text;
  }

  const _exhaustive: never = entityType;
  throw new Error(`Unknown pangram entityType: ${String(_exhaustive)}`);
}
