import seedPrices from './cost-prices.json';
import { MODEL_REGISTRY } from '../client/registry';
import {
  getAllModelPrices,
  upsertModelPrices,
  type ModelPriceInput,
} from '../../storage/model-prices';

export interface ModelPrice {
  promptUsdPer1k: number;
  completionUsdPer1k: number;
}

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * In-memory price cache used by the synchronous cost estimator. Initialized
 * from the JSON seed so estimates have sane values before `loadModelPrices()`
 * runs, then overlaid with the DB (source of truth) at boot and after each
 * monthly refresh.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  ...(seedPrices as Record<string, ModelPrice>),
};

function seedEntries(): ModelPriceInput[] {
  return Object.entries(seedPrices as Record<string, ModelPrice>).map(
    ([modelId, price]) => ({
      modelId,
      promptUsdPer1k: price.promptUsdPer1k,
      completionUsdPer1k: price.completionUsdPer1k,
    }),
  );
}

/**
 * Loads model prices from the DB into the in-memory cache. If the DB has no
 * prices yet, performs a one-time seed from cost-prices.json. Call once at boot.
 */
export async function loadModelPrices(): Promise<void> {
  try {
    const rows = await getAllModelPrices();

    if (rows.length === 0) {
      const entries = seedEntries();
      await upsertModelPrices(entries);
      // in-memory cache already holds the seed values
      console.log(`[Model prices] Seeded ${entries.length} prices into empty DB`);
      return;
    }

    for (const row of rows) {
      MODEL_PRICES[row.modelId] = {
        promptUsdPer1k: row.promptUsdPer1k,
        completionUsdPer1k: row.completionUsdPer1k,
      };
    }
    console.log(`[Model prices] Loaded ${rows.length} prices from DB`);
  } catch (error) {
    console.error('[Model prices] Failed to load from DB, using JSON seed values', error);
  }
}

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

/**
 * Refreshes prices from the OpenRouter pricing API and persists them to the DB
 * (source of truth), updating the in-memory cache in lockstep. Run monthly via
 * the `models:refresh-prices` cron. Only models present in MODEL_REGISTRY are
 * updated; everything else from OpenRouter is skipped.
 */
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

    const entries: ModelPriceInput[] = [];
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

      entries.push({ modelId: model.id, promptUsdPer1k, completionUsdPer1k });
      MODEL_PRICES[model.id] = { promptUsdPer1k, completionUsdPer1k };
    }

    await upsertModelPrices(entries);
    return { updated: entries.length, skipped };
  } catch (error) {
    console.error('[Research Stream v2] OpenRouter model price refresh failed', error);
    return { updated: 0, skipped: 0 };
  }
}
