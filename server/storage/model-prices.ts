import { db, modelPrices, sql, type ModelPriceRow } from './base';

export interface ModelPriceInput {
  modelId: string;
  promptUsdPer1k: number;
  completionUsdPer1k: number;
}

/** Returns every persisted model price row. */
export async function getAllModelPrices(): Promise<ModelPriceRow[]> {
  return db.select().from(modelPrices);
}

/** Count of persisted price rows (used to decide whether to seed). */
export async function countModelPrices(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(modelPrices);
  return row?.count ?? 0;
}

/**
 * Batch upsert model prices. Existing rows are updated in place; new rows are
 * inserted. Returns the number of rows written.
 */
export async function upsertModelPrices(entries: ModelPriceInput[]): Promise<number> {
  if (entries.length === 0) return 0;

  await db
    .insert(modelPrices)
    .values(
      entries.map((e) => ({
        modelId: e.modelId,
        promptUsdPer1k: e.promptUsdPer1k,
        completionUsdPer1k: e.completionUsdPer1k,
      })),
    )
    .onConflictDoUpdate({
      target: modelPrices.modelId,
      set: {
        promptUsdPer1k: sql`excluded.prompt_usd_per_1k`,
        completionUsdPer1k: sql`excluded.completion_usd_per_1k`,
        updatedAt: sql`now()`,
      },
    });

  return entries.length;
}
