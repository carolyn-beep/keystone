import {
  db, desc,
  modelAccuracyStats, llmFeedback,
  type ModelAccuracyStats, type LlmFeedback
} from './base';
import { MODEL_REGISTRY } from '../ai/client/registry';

// Fact-verification models used for accuracy tracking
const FACT_VERIFICATION_MODELS = [
  'qwen/qwen-plus',
  'google/gemini-2.0-flash-001',
  'qwen/qwen3-32b',
] as const;

export async function getModelAccuracyStats(): Promise<ModelAccuracyStats[]> {
  const stats = await db.select().from(modelAccuracyStats);
  const existingModels = new Set(stats.map(s => s.model));

  const allModels: readonly string[] = FACT_VERIFICATION_MODELS;
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
