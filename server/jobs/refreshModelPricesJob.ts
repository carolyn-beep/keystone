import type { JobHelpers } from 'graphile-worker';
import { refreshModelPrices } from '../ai/learning-stream-swarm-v2/cost';

export async function refreshModelPricesJob(
  _payload: Record<string, never>,
  helpers: JobHelpers,
): Promise<{ updated: number; skipped: number }> {
  const result = await refreshModelPrices();
  helpers.logger.info('Model price refresh completed', result);
  return result;
}
