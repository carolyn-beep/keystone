import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import seedPrices from './cost-prices.json';
import { MODEL_REGISTRY } from '../client/registry';

export interface ModelPrice {
  promptUsdPer1k: number;
  completionUsdPer1k: number;
}

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = { ...(seedPrices as Record<string, ModelPrice>) };

export function estimateRunCostUsd(usages: UsageEntry[]): number {
  return usages.reduce((sum, usage) => {
    const price = MODEL_PRICES[usage.model];
    if (!price) {
      console.warn(`[Research Stream v2] Missing model price for ${usage.model}`);
      return sum;
    }

    return sum
      + (usage.inputTokens / 1000) * price.promptUsdPer1k
      + (usage.outputTokens / 1000) * price.completionUsdPer1k;
  }, 0);
}

function priceFilePath(): string {
  return fileURLToPath(new URL('./cost-prices.json', import.meta.url));
}

export async function refreshModelPrices(): Promise<{ updated: number; skipped: number }> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: process.env.OPENROUTER_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
        : undefined,
    });

    if (!response.ok) {
      console.error('[Research Stream v2] OpenRouter model price refresh failed', { status: response.status });
      return { updated: 0, skipped: 0 };
    }

    const body = await response.json();
    if (!body || !Array.isArray(body.data)) {
      console.error('[Research Stream v2] OpenRouter model price refresh malformed response');
      return { updated: 0, skipped: 0 };
    }

    let updated = 0;
    let skipped = 0;

    for (const model of body.data as Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }>) {
      if (!model.id || !MODEL_REGISTRY[model.id]) {
        skipped += 1;
        continue;
      }

      const promptUsdPer1k = parseFloat(model.pricing?.prompt ?? '') * 1000;
      const completionUsdPer1k = parseFloat(model.pricing?.completion ?? '') * 1000;

      if (Number.isNaN(promptUsdPer1k) || Number.isNaN(completionUsdPer1k)) {
        skipped += 1;
        continue;
      }

      MODEL_PRICES[model.id] = { promptUsdPer1k, completionUsdPer1k };
      updated += 1;
    }

    await writeFile(priceFilePath(), `${JSON.stringify(MODEL_PRICES, null, 2)}\n`);
    return { updated, skipped };
  } catch (error) {
    console.error('[Research Stream v2] OpenRouter model price refresh failed', error);
    return { updated: 0, skipped: 0 };
  }
}
