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
// Candidate → HierarchyNode Promotion
// ═══════════════════════════════════════════════════════════════════════════

let promotionIdCounter = 0;

/** Flatten all text from nodes (for dedup comparison against candidates) */
function flattenNodeTexts(nodes: HierarchyNode[]): string[] {
  const texts: string[] = [];
  const walk = (list: HierarchyNode[]) => {
    for (const n of list) {
      if (n.name && n.name.trim().length > 0) texts.push(n.name.trim());
      walk(n.children);
    }
  };
  walk(nodes);
  return texts;
}

function makePromotedNode(name: string, children: HierarchyNode[] = []): HierarchyNode {
  return {
    id: `promoted-${++promotionIdCounter}`,
    name,
    note: null,
    depth: 0,
    children,
    isDOK1Marker: false,
    isDOK2Marker: false,
    isDOK3Marker: false,
    isDOK4Marker: false,
    isSourceMarker: false,
    isCategoryMarker: false,
    isPurposeMarker: false,
    extractedUrl: null,
  };
}

/** Convert a candidate insight to HierarchyNode[] matching the canonical insight format */
function buildInsightNodes(candidate: CollectedInsight, index: number): HierarchyNode[] {
  const children: HierarchyNode[] = [];
  if (candidate.sourceRefs.length > 0) {
    const linkChildren = candidate.sourceRefs.map(ref => makePromotedNode(ref));
    children.push(makePromotedNode('Links', linkChildren));
  }
  return [makePromotedNode(`Insight ${index} - ${candidate.text}`, children)];
}

/** Convert a candidate SPOV to HierarchyNode[] matching the canonical SPOV format */
function buildSpovNodes(candidate: CollectedSpov, index: number): HierarchyNode[] {
  const children = candidate.context.map(ctx => makePromotedNode(ctx));
  return [makePromotedNode(`spov ${index} - ${candidate.text}`, children)];
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Merge Function
// ═══════════════════════════════════════════════════════════════════════════

export function mergePreformatResults(
  llmResults: PreformatLLMResults,
): MergedPreformatResult {
  promotionIdCounter = 0;
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
    const { deduped: dedupedInsights, removedCount } = deduplicateInsights(allCandidateInsights);
    mergeReport.insightsDeduped = removedCount;

    // Promote candidate insights to insightNodes (dedup against existing top-level)
    const existingInsightTexts = flattenNodeTexts(insightNodes);
    let nextInsightIndex = insightNodes.length + 1;
    for (const candidate of dedupedInsights) {
      // Skip if already present in top-level insights
      const isDup = existingInsightTexts.some(
        existing => jaccardSimilarity(existing, candidate.text) >= SIMILARITY_THRESHOLD_DUPLICATE,
      );
      if (isDup) {
        mergeReport.insightsDeduped++;
        continue;
      }
      insightNodes.push(...buildInsightNodes(candidate, nextInsightIndex));
      nextInsightIndex++;
    }
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
    const { deduped: dedupedSpovs, removedCount } = deduplicateSpovs(allCandidateSpovs);
    mergeReport.spovsDeduped = removedCount;

    // Promote candidate SPOVs to spovNodes (dedup against existing top-level)
    const existingSpovTexts = flattenNodeTexts(spovNodes);
    let nextSpovIndex = spovNodes.length + 1;
    for (const candidate of dedupedSpovs) {
      const isDup = existingSpovTexts.some(
        existing => jaccardSimilarity(existing, candidate.text) >= SIMILARITY_THRESHOLD_DUPLICATE,
      );
      if (isDup) {
        mergeReport.spovsDeduped++;
        continue;
      }
      spovNodes.push(...buildSpovNodes(candidate, nextSpovIndex));
      nextSpovIndex++;
    }
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
