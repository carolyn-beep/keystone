/**
 * Result Merging
 *
 * Provides mergePreformatResults (FR2):
 * - Collects insights/SPOVs from categories + top-level
 * - Deduplicates by Jaccard similarity
 * - Assigns global indices
 * - Remaps SPOV insight cross-references
 * - Deduplicates facts within categories
 * - Incorporates unknown sections
 */

import type {
  PreformatLLMResults,
  MergedPreformatResult,
  InsightResult,
  SpovResult,
  CategoryChunkResult,
  ExpertResult,
} from './types';
import { jaccardSimilarity } from './validator';

const SIMILARITY_THRESHOLD_DUPLICATE = 0.9;

// ═══════════════════════════════════════════════════════════════════════════
// Deduplication Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface CollectedInsight {
  text: string;
  sourceRefs: string[];
  /** Which chunk provided this insight (for cross-ref mapping) */
  chunkOrigin: string;
  /** Original 1-based index within its chunk */
  chunkLocalIndex: number;
}

interface CollectedSpov {
  text: string;
  explicitInsightRefs: number[];
  context: string[];
  /** Which chunk provided this SPOV */
  chunkOrigin: string;
  /** Original insight indices are relative to this chunk's insight list */
  sourceRefs?: string[];
}

/**
 * Deduplicate a list of items by Jaccard similarity.
 * When duplicates are found, sourceRefs are merged into the first occurrence.
 * Returns: deduplicated list and count of removed items.
 */
function deduplicateInsights(
  items: CollectedInsight[],
): { deduped: CollectedInsight[]; removedCount: number } {
  const result: CollectedInsight[] = [];
  let removedCount = 0;

  for (const item of items) {
    const duplicate = result.find(
      existing => jaccardSimilarity(existing.text, item.text) >= SIMILARITY_THRESHOLD_DUPLICATE,
    );
    if (duplicate) {
      // Merge sourceRefs
      for (const ref of item.sourceRefs) {
        if (!duplicate.sourceRefs.includes(ref)) {
          duplicate.sourceRefs.push(ref);
        }
      }
      removedCount++;
    } else {
      result.push({ ...item, sourceRefs: [...item.sourceRefs] });
    }
  }

  return { deduped: result, removedCount };
}

function deduplicateSpovs(
  items: CollectedSpov[],
): { deduped: CollectedSpov[]; removedCount: number } {
  const result: CollectedSpov[] = [];
  let removedCount = 0;

  for (const item of items) {
    const duplicate = result.find(
      existing => jaccardSimilarity(existing.text, item.text) >= SIMILARITY_THRESHOLD_DUPLICATE,
    );
    if (duplicate) {
      removedCount++;
    } else {
      result.push({ ...item });
    }
  }

  return { deduped: result, removedCount };
}

/**
 * Deduplicate facts within a single source by Jaccard similarity.
 */
function deduplicateFacts(facts: string[]): { deduped: string[]; removedCount: number } {
  const result: string[] = [];
  let removedCount = 0;

  for (const fact of facts) {
    const isDuplicate = result.some(
      existing => jaccardSimilarity(existing, fact) >= SIMILARITY_THRESHOLD_DUPLICATE,
    );
    if (isDuplicate) {
      removedCount++;
    } else {
      result.push(fact);
    }
  }

  return { deduped: result, removedCount };
}

// ═══════════════════════════════════════════════════════════════════════════
// Cross-Reference Mapping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a mapping from (chunkOrigin, chunkLocalIndex) -> globalIndex
 * for insight cross-reference resolution in SPOVs.
 */
function buildInsightRefMap(
  allInsights: CollectedInsight[],
  globalInsights: Array<InsightResult & { globalIndex: number }>,
): Map<string, number> {
  // Map: "chunkOrigin:chunkLocalIndex" -> globalIndex
  const refMap = new Map<string, number>();

  for (const collected of allInsights) {
    // Find the corresponding global insight by text match
    const globalMatch = globalInsights.find(
      g => jaccardSimilarity(g.text, collected.text) >= SIMILARITY_THRESHOLD_DUPLICATE,
    );
    if (globalMatch) {
      const key = `${collected.chunkOrigin}:${collected.chunkLocalIndex}`;
      refMap.set(key, globalMatch.globalIndex);
    }
  }

  return refMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Merge Function
// ═══════════════════════════════════════════════════════════════════════════

export function mergePreformatResults(
  llmResults: PreformatLLMResults,
): MergedPreformatResult {
  const mergeReport = {
    duplicateFactsRemoved: 0,
    duplicateSourcesConsolidated: 0,
    insightsDeduped: 0,
    spovsDeduped: 0,
    crossRefsUpdated: 0,
  };

  // ── Pass through simple fields ─────────────────────────────────
  const owner = llmResults.owner ?? null;
  const purpose = llmResults.purpose ?? null;
  const experts: ExpertResult[] = llmResults.experts?.experts ?? [];

  // ── Collect all insights ───────────────────────────────────────
  const allInsights: CollectedInsight[] = [];

  // From top-level insights section
  if (llmResults.insights?.insights) {
    llmResults.insights.insights.forEach((insight, idx) => {
      allInsights.push({
        text: insight.text,
        sourceRefs: [...insight.sourceRefs],
        chunkOrigin: 'top-level',
        chunkLocalIndex: idx + 1, // 1-based
      });
    });
  }

  // From category candidate insights
  for (const cat of llmResults.categories) {
    if (cat.candidateInsights) {
      cat.candidateInsights.forEach((insight, idx) => {
        allInsights.push({
          text: insight.text,
          sourceRefs: [...insight.sourceRefs],
          chunkOrigin: `category:${cat.category}`,
          chunkLocalIndex: idx + 1, // 1-based
        });
      });
    }
  }

  // From unknown sections classified as dok_content
  for (const unknown of llmResults.unknownSections) {
    if (unknown.classification === 'dok_content' && unknown.insights) {
      unknown.insights.forEach((insight, idx) => {
        allInsights.push({
          text: insight.text,
          sourceRefs: [...insight.sourceRefs],
          chunkOrigin: 'unknown',
          chunkLocalIndex: idx + 1,
        });
      });
    }
  }

  // Deduplicate insights
  const { deduped: dedupedInsights, removedCount: insightsRemoved } =
    deduplicateInsights(allInsights);
  mergeReport.insightsDeduped = insightsRemoved;

  // Assign global indices
  const globalInsights: Array<InsightResult & { globalIndex: number }> =
    dedupedInsights.map((item, idx) => ({
      text: item.text,
      sourceRefs: item.sourceRefs,
      globalIndex: idx + 1,
    }));

  // Build cross-reference map
  const insightRefMap = buildInsightRefMap(allInsights, globalInsights);

  // ── Collect all SPOVs ──────────────────────────────────────────
  const allSpovs: CollectedSpov[] = [];

  // From top-level SPOVs section
  if (llmResults.spovs?.spovs) {
    llmResults.spovs.spovs.forEach((spov, _idx) => {
      allSpovs.push({
        text: spov.text,
        explicitInsightRefs: [...spov.explicitInsightRefs],
        context: [...(spov.context ?? [])],
        chunkOrigin: 'top-level',
      });
    });
  }

  // From category candidate SPOVs
  for (const cat of llmResults.categories) {
    if (cat.candidateSpovs) {
      cat.candidateSpovs.forEach(spov => {
        allSpovs.push({
          text: spov.text,
          explicitInsightRefs: [], // candidate spovs don't have explicit refs
          context: [...(spov.context ?? [])],
          chunkOrigin: `category:${cat.category}`,
          sourceRefs: [...spov.sourceRefs],
        });
      });
    }
  }

  // From unknown sections classified as dok_content
  for (const unknown of llmResults.unknownSections) {
    if (unknown.classification === 'dok_content' && unknown.spovs) {
      unknown.spovs.forEach(spov => {
        allSpovs.push({
          text: spov.text,
          explicitInsightRefs: [],
          context: [...(spov.context ?? [])],
          chunkOrigin: 'unknown',
          sourceRefs: [...spov.sourceRefs],
        });
      });
    }
  }

  // Deduplicate SPOVs
  const { deduped: dedupedSpovs, removedCount: spovsRemoved } =
    deduplicateSpovs(allSpovs);
  mergeReport.spovsDeduped = spovsRemoved;

  // Assign global indices and remap insight refs
  const globalSpovs: Array<SpovResult & { globalIndex: number }> =
    dedupedSpovs.map((item, idx) => {
      // Remap insight refs using the cross-reference map
      const remappedRefs: number[] = [];
      for (const ref of item.explicitInsightRefs) {
        const key = `${item.chunkOrigin}:${ref}`;
        const globalRef = insightRefMap.get(key);
        if (globalRef !== undefined) {
          remappedRefs.push(globalRef);
          mergeReport.crossRefsUpdated++;
        }
        // If no mapping found (non-existent insight), ref is dropped
      }

      return {
        text: item.text,
        explicitInsightRefs: remappedRefs,
        context: item.context,
        globalIndex: idx + 1,
      };
    });

  // ── Deduplicate facts within categories ────────────────────────
  const processedCategories: CategoryChunkResult[] = llmResults.categories.map(cat => {
    const processedSources = cat.sources.map(src => {
      const { deduped, removedCount } = deduplicateFacts(src.facts);
      mergeReport.duplicateFactsRemoved += removedCount;
      return { ...src, facts: deduped };
    });
    return { ...cat, sources: processedSources };
  });

  // ── Incorporate unknown sections classified as dok_content ─────
  for (const unknown of llmResults.unknownSections) {
    if (unknown.classification === 'dok_content' && unknown.sources && unknown.sources.length > 0) {
      processedCategories.push({
        category: 'Uncategorized',
        sources: unknown.sources,
        candidateInsights: [],
        candidateSpovs: [],
        scratchpad: [],
        strippedTemplateInstructions: [],
      });
    }
  }

  // ── Collect all scratchpad content ─────────────────────────────
  const scratchpad: string[] = [...llmResults.scratchpad];

  // From categories
  for (const cat of llmResults.categories) {
    if (cat.scratchpad) {
      scratchpad.push(...cat.scratchpad);
    }
  }

  // From unknown sections classified as operational/scratchpad
  for (const unknown of llmResults.unknownSections) {
    if (
      (unknown.classification === 'operational' || unknown.classification === 'scratchpad') &&
      unknown.content
    ) {
      scratchpad.push(...unknown.content);
    }
  }

  return {
    owner,
    purpose,
    experts,
    spovs: globalSpovs,
    insights: globalInsights,
    categories: processedCategories,
    scratchpad,
    mergeReport,
  };
}
