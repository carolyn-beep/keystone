/**
 * AI Writing Signal -- web response helper.
 *
 * Spec 02 (web-ui) attaches the full AiWritingSignalPayload to DOK2 / DOK3 /
 * DOK4 items returned by the brainlift detail, dok3-insights, dok4-spovs,
 * and dok4 evaluation GETs.
 *
 * The internal API (server/storage/internal.ts) returns only the categorical
 * label; the web wire needs the full payload (windows, fractions, headline,
 * prediction) so the chip + breakdown can render.
 *
 * Internal codename "Pangram" stays inside the storage layer -- never
 * surface it in user-facing copy.
 */

import { pangramAssessmentsStorage } from '../storage/pangramAssessments';
import type {
  AiWritingSignalPayload,
  PangramEntityType,
} from '@shared/schema';

/**
 * Attach `aiWritingSignal` to each item via a single batched lookup.
 *
 * Empty `items` array short-circuits without issuing a query. For every input
 * item, the returned item carries an `aiWritingSignal` field (payload object
 * or `null`). Other fields on the input are preserved verbatim.
 */
export async function attachAiWritingSignal<T extends { id: number }>(
  items: T[],
  entityType: PangramEntityType,
): Promise<(T & { aiWritingSignal: AiWritingSignalPayload | null })[]> {
  if (items.length === 0) {
    return [];
  }

  const ids = items.map((i) => i.id);
  const signalMap = await pangramAssessmentsStorage.getFullByEntities(entityType, ids);

  return items.map((item) => ({
    ...item,
    aiWritingSignal: signalMap.get(item.id) ?? null,
  }));
}
