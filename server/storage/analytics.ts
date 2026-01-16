import {
  db, desc,
  modelAccuracyStats, llmFeedback, LLM_MODELS,
  type ModelAccuracyStats, type LlmFeedback
} from './base';

export async function getModelAccuracyStats(): Promise<ModelAccuracyStats[]> {
  const stats = await db.select().from(modelAccuracyStats);
  const existingModels = new Set(stats.map(s => s.model));

  const allModels = Object.values(LLM_MODELS);
  const result: ModelAccuracyStats[] = [...stats];

  for (const model of allModels) {
    if (!existingModels.has(model)) {
      result.push({
        id: 0,
        model,
        totalSamples: 0,
        totalAbsoluteError: 0,
        meanAbsoluteError: '0',
        weight: '1',
        lastUpdated: new Date(),
      });
    }
  }

  return result;
}

export async function getLlmFeedbackHistory(limit: number = 100): Promise<LlmFeedback[]> {
  return await db.select().from(llmFeedback)
    .orderBy(desc(llmFeedback.createdAt))
    .limit(limit);
}
