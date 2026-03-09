/**
 * Result Merging
 *
 * Provides mergePreformatResults (FR2):
 * - Collects insights/SPOVs from categories + top-level
 * - Deduplicates by Jaccard similarity
 * - Assigns global indices
 * - Remaps SPOV insight cross-references
 * - Deduplicates facts within categories
 */

import type { PreformatLLMResults, MergedPreformatResult } from './types';

export function mergePreformatResults(
  _llmResults: PreformatLLMResults,
): MergedPreformatResult {
  throw new Error('Not implemented');
}
