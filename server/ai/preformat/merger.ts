/**
 * Result Merging
 *
 * Provides mergePreformatResults (FR2):
 * - Passes through parsedNodes for all markdown-based sections
 * - Categories pass through as-is (already markdown)
 * - Unknown dok_content sections get added as Uncategorized categories
 * - Unknown operational/scratchpad → scratchpadNodes
 * - Dedup and cross-ref logic preserved for category candidateInsights/candidateSpovs
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type {
  PreformatLLMResults,
  MergedPreformatResult,
  CategoryChunkResult,
} from './types';
import { jaccardSimilarity } from './validator';
import { parseMarkdownToHierarchy } from './markdown-parser';

const SIMILARITY_THRESHOLD_DUPLICATE = 0.9;

// ═══════════════════════════════════════════════════════════════════════════
// Deduplication Helpers (for category candidate insights/spovs)
// ═══════════════════════════════════════════════════════════════════════════

interface CollectedInsight {
  text: string;
  sourceRefs: string[];
  chunkOrigin: string;
  chunkLocalIndex: number;
}

interface CollectedSpov {
  text: string;
  sourceRefs: string[];
  context: string[];
  chunkOrigin: string;
}

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

  // ── Owner (JSON) ─────────────────────────────────────────────
  const owner = llmResults.owner ?? null;

  // ── Purpose (parsedNodes pass-through) ───────────────────────
  const purposeNodes: HierarchyNode[] = llmResults.purpose?.parsedNodes ?? [];

  // ── Experts (parsedNodes pass-through) ───────────────────────
  const expertNodes: HierarchyNode[] = llmResults.experts?.parsedNodes ?? [];

  // ── SPOVs (parsedNodes pass-through) ─────────────────────────
  const spovNodes: HierarchyNode[] = llmResults.spovs?.parsedNodes ?? [];

  // ── Insights (parsedNodes pass-through) ──────────────────────
  const insightNodes: HierarchyNode[] = llmResults.insights?.parsedNodes ?? [];

  // ── Categories (pass through, already have parsedNodes) ──────
  const processedCategories: CategoryChunkResult[] = [...llmResults.categories];

  // ── Collect candidate insights from categories for dedup ─────
  const allCandidateInsights: CollectedInsight[] = [];
  for (const cat of llmResults.categories) {
    if (cat.candidateInsights) {
      cat.candidateInsights.forEach((insight, idx) => {
        allCandidateInsights.push({
          text: insight.text,
          sourceRefs: [...insight.sourceRefs],
          chunkOrigin: `category:${cat.category}`,
          chunkLocalIndex: idx + 1,
        });
      });
    }
  }

  if (allCandidateInsights.length > 0) {
    const { removedCount } = deduplicateInsights(allCandidateInsights);
    mergeReport.insightsDeduped = removedCount;
  }

  // ── Collect candidate SPOVs from categories for dedup ────────
  const allCandidateSpovs: CollectedSpov[] = [];
  for (const cat of llmResults.categories) {
    if (cat.candidateSpovs) {
      cat.candidateSpovs.forEach(spov => {
        allCandidateSpovs.push({
          text: spov.text,
          sourceRefs: [...spov.sourceRefs],
          context: [...(spov.context ?? [])],
          chunkOrigin: `category:${cat.category}`,
        });
      });
    }
  }

  if (allCandidateSpovs.length > 0) {
    const { removedCount } = deduplicateSpovs(allCandidateSpovs);
    mergeReport.spovsDeduped = removedCount;
  }

  // ── Incorporate unknown sections ─────────────────────────────
  const scratchpadNodes: HierarchyNode[] = [];

  for (const unknown of llmResults.unknownSections) {
    if (unknown.classification === 'dok_content') {
      // dok_content unknown → add as Uncategorized category
      processedCategories.push({
        category: 'Uncategorized',
        sectionMarkdown: unknown.sectionMarkdown,
        parsedNodes: unknown.parsedNodes ?? parseMarkdownToHierarchy(unknown.sectionMarkdown || ''),
        candidateInsights: [],
        candidateSpovs: [],
        strippedTemplateInstructions: [],
      });
    } else {
      // operational or scratchpad → add parsedNodes to scratchpadNodes
      const nodes = unknown.parsedNodes ?? parseMarkdownToHierarchy(unknown.sectionMarkdown || '');
      scratchpadNodes.push(...nodes);
    }
  }

  // ── Add scratchpad items from LLM results ────────────────────
  for (const item of llmResults.scratchpad) {
    scratchpadNodes.push({
      id: `merged-scratchpad-${scratchpadNodes.length}`,
      name: item,
      note: null,
      depth: 0,
      children: [],
      isDOK1Marker: false,
      isDOK2Marker: false,
      isDOK3Marker: false,
      isDOK4Marker: false,
      isSourceMarker: false,
      isCategoryMarker: false,
      isPurposeMarker: false,
      extractedUrl: null,
    });
  }

  return {
    owner,
    purposeNodes,
    expertNodes,
    spovNodes,
    insightNodes,
    categories: processedCategories,
    scratchpadNodes,
    mergeReport,
  };
}
