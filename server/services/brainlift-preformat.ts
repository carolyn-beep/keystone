/**
 * Preformat Orchestrator Service
 *
 * Main entry point for the BrainLift pre-formatting pipeline.
 * Composes: chunking -> LLM calls -> merging -> validation -> tree building.
 *
 * Always returns full results so callers can inspect what happened.
 * Callers check report.passed to decide whether to use the clean tree.
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type { ValidationReport, MergedPreformatResult, PreformatLLMResults } from '../ai/preformat/types';
import { identifyAndSerializeChunks } from '../ai/preformat/chunker';
import { runPreformatLLMCalls } from '../ai/preformat/llm-caller';
import { mergePreformatResults } from '../ai/preformat/merger';
import { validateIntegrity } from '../ai/preformat/validator';
import { buildCleanHierarchy } from '../ai/preformat/tree-builder';

const verbose = () => process.env.VERBOSE_PRE_FORMATTER_LOG === 'true';

export interface PreformatOptions {
  /** Called as each chunk completes LLM processing */
  onProgress?: (completed: number, total: number) => void;
  /** Skip the validation step (e.g., for large content where Jaccard is too expensive) */
  skipValidation?: boolean;
}

export interface PreformatResult {
  /** The clean hierarchy tree (always built, even if validation fails) */
  cleanHierarchy: HierarchyNode[];
  /** Validation report with pass/fail and details */
  report: ValidationReport;
  /** Whether validation was skipped (e.g., large content threshold) */
  validationSkipped: boolean;
  /** Pipeline timing breakdown */
  timing: {
    total: number;
    chunking: number;
    llmCalls: number;
    merging: number;
    validation: number;
    treeBuilding: number;
  };
  /** Pipeline stats */
  stats: {
    chunkCount: number;
    llmSuccessCount: number;
    llmFailCount: number;
    categoryCount: number;
    purposeNodeCount: number;
    expertNodeCount: number;
    insightNodeCount: number;
    spovNodeCount: number;
    scratchpadNodeCount: number;
    mergeReport: MergedPreformatResult['mergeReport'];
  };
}

/**
 * Preformat a hierarchy and return full results.
 *
 * ALWAYS returns a result with the clean hierarchy and validation report.
 * Returns null only on catastrophic failure (no API key, empty input, crash).
 * Callers check result.report.passed to decide whether to use the tree.
 */
export async function preformatHierarchy(
  hierarchy: HierarchyNode[],
  options?: PreformatOptions,
): Promise<PreformatResult | null> {
  if (!hierarchy || hierarchy.length === 0) {
    console.log('[Preformat] Empty hierarchy, skipping');
    return null;
  }

  const totalStart = Date.now();
  const timing = { total: 0, chunking: 0, llmCalls: 0, merging: 0, validation: 0, treeBuilding: 0 };

  try {
    // ── Step 1: Identify sections and serialize chunks ──────────────
    const chunkStart = Date.now();
    const { chunks, bypassedScratchpad } = identifyAndSerializeChunks(hierarchy);
    timing.chunking = Date.now() - chunkStart;

    console.log(`[Preformat] Step 1/5 Chunking: ${chunks.length} chunks, ${bypassedScratchpad.length} scratchpad nodes bypassed (${timing.chunking}ms)`);
    if (verbose()) {
      for (const chunk of chunks) {
        console.log(`  [Chunk] type=${chunk.type} label="${chunk.label}" nodeIds=${chunk.sourceNodeIds.length} contentLen=${chunk.markdown.length}`);
      }
    }

    // ── Step 2: Run parallel LLM classification calls ──────────────
    const llmStart = Date.now();
    const llmResults = await runPreformatLLMCalls(chunks, options?.onProgress);
    timing.llmCalls = Date.now() - llmStart;

    const llmSuccessCount = countLLMSuccesses(llmResults);
    const llmFailCount = chunks.length - llmSuccessCount;
    console.log(`[Preformat] Step 2/5 LLM calls: ${llmSuccessCount}/${chunks.length} succeeded in ${timing.llmCalls}ms`);
    if (verbose()) {
      logLLMResultsSummary(llmResults);
    }

    // ── Step 3: Merge results (dedup, numbering, cross-refs) ───────
    const mergeStart = Date.now();
    const merged = mergePreformatResults(llmResults);
    timing.merging = Date.now() - mergeStart;

    console.log(`[Preformat] Step 3/5 Merging: categories=${merged.categories.length} purposeNodes=${merged.purposeNodes.length} expertNodes=${merged.expertNodes.length} insightNodes=${merged.insightNodes.length} spovNodes=${merged.spovNodes.length} (${timing.merging}ms)`);
    if (verbose()) {
      const totalCatNodes = merged.categories.reduce((n, c) => n + (c.parsedNodes?.length ?? 0), 0);
      console.log(`  [Merge] categoryParsedNodes=${totalCatNodes} scratchpadNodes=${merged.scratchpadNodes.length}`);
      console.log(`  [Merge] dedup: facts=${merged.mergeReport.duplicateFactsRemoved} insights=${merged.mergeReport.insightsDeduped} spovs=${merged.mergeReport.spovsDeduped} crossRefs=${merged.mergeReport.crossRefsUpdated}`);
    }

    // ── Step 4: Validate integrity (or skip for large content) ─────
    const skipValidation = options?.skipValidation ?? false;
    let report: ValidationReport;
    let validationSkipped = false;

    if (skipValidation) {
      validationSkipped = true;
      report = {
        passed: true,
        contentLossPercent: 0,
        hallucinationCount: 0,
        duplicateCount: 0,
        warnings: [],
        details: { missingFromOutput: [], possibleHallucinations: [], duplicatePairs: [] },
      };
      console.log(`[Preformat] Step 4/5 Validation: SKIPPED (skipValidation=true)`);
    } else {
      const validateStart = Date.now();
      report = validateIntegrity(hierarchy, merged, bypassedScratchpad);
      timing.validation = Date.now() - validateStart;

      console.log(`[Preformat] Step 4/5 Validation: ${report.passed ? 'PASSED' : 'FAILED'} — loss=${report.contentLossPercent.toFixed(1)}% hallucinations=${report.hallucinationCount} duplicates=${report.duplicateCount} (${timing.validation}ms)`);
      if (verbose() && report.warnings.length > 0) {
        for (const w of report.warnings) {
          console.log(`  [Validation] ⚠ ${w}`);
        }
      }
    }

    // ── Step 5: Build canonical tree (always, even if validation fails) ──
    const buildStart = Date.now();
    const cleanHierarchy = buildCleanHierarchy(merged, bypassedScratchpad);

    // Append unplaced content to scratchpad so nothing is silently lost
    if (report.details.missingFromOutput.length > 0) {
      appendUnplacedContent(cleanHierarchy, report.details.missingFromOutput);
    }

    timing.treeBuilding = Date.now() - buildStart;

    timing.total = Date.now() - totalStart;
    console.log(`[Preformat] Step 5/5 Tree: ${cleanHierarchy.length} root sections (${timing.treeBuilding}ms)`);
    console.log(`[Preformat] Complete: ${timing.total}ms total, passed=${report.passed}`);

    return {
      cleanHierarchy,
      report,
      validationSkipped,
      timing,
      stats: {
        chunkCount: chunks.length,
        llmSuccessCount,
        llmFailCount,
        categoryCount: merged.categories.length,
        purposeNodeCount: merged.purposeNodes.length,
        expertNodeCount: merged.expertNodes.length,
        insightNodeCount: merged.insightNodes.length,
        spovNodeCount: merged.spovNodes.length,
        scratchpadNodeCount: merged.scratchpadNodes.length,
        mergeReport: merged.mergeReport,
      },
    };
  } catch (err) {
    timing.total = Date.now() - totalStart;
    console.error(`[Preformat] Pipeline crashed after ${timing.total}ms:`, err);
    return null;
  }
}

/**
 * Append unplaced content (items the validator flagged as missing from output)
 * to the Scratchpad section so nothing is silently lost.
 */
function appendUnplacedContent(hierarchy: HierarchyNode[], missingItems: string[]): void {
  if (missingItems.length === 0) return;

  // Find or create the Scratchpad node
  let scratchpad = hierarchy.find(n => /^scratchpad$/i.test(n.name));
  if (!scratchpad) {
    scratchpad = {
      id: 'preformat-scratchpad-unplaced',
      name: 'Scratchpad',
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
    };
    hierarchy.push(scratchpad);
  }

  // Add a container for unplaced items
  const container: HierarchyNode = {
    id: 'preformat-unplaced-container',
    name: 'Unplaced content (preserved from original)',
    note: null,
    depth: 1,
    children: missingItems.map((text, i) => ({
      id: `preformat-unplaced-${i}`,
      name: text,
      note: null,
      depth: 2,
      children: [],
      isDOK1Marker: false,
      isDOK2Marker: false,
      isDOK3Marker: false,
      isDOK4Marker: false,
      isSourceMarker: false,
      isCategoryMarker: false,
      isPurposeMarker: false,
      extractedUrl: null,
    })),
    isDOK1Marker: false,
    isDOK2Marker: false,
    isDOK3Marker: false,
    isDOK4Marker: false,
    isSourceMarker: false,
    isCategoryMarker: false,
    isPurposeMarker: false,
    extractedUrl: null,
  };

  scratchpad.children.push(container);
}

/** Count how many LLM result slots got filled */
function countLLMSuccesses(results: PreformatLLMResults): number {
  let count = 0;
  if (results.owner) count++;
  if (results.purpose) count++;
  if (results.experts) count++;
  if (results.spovs) count++;
  if (results.insights) count++;
  count += results.categories.length;
  count += results.unknownSections.length;
  return count;
}

/** Log a summary of what the LLM calls produced */
function logLLMResultsSummary(results: PreformatLLMResults): void {
  if (results.owner) console.log(`  [LLM] owner: "${results.owner.name}"`);
  if (results.purpose) {
    const mdLen = results.purpose.sectionMarkdown?.length ?? 0;
    const nodeCount = results.purpose.parsedNodes?.length ?? 0;
    console.log(`  [LLM] purpose: markdown=${mdLen} chars, parsedNodes=${nodeCount}`);
  }
  if (results.experts) {
    const mdLen = results.experts.sectionMarkdown?.length ?? 0;
    const nodeCount = results.experts.parsedNodes?.length ?? 0;
    console.log(`  [LLM] experts: markdown=${mdLen} chars, parsedNodes=${nodeCount}`);
  }
  if (results.spovs) {
    const mdLen = results.spovs.sectionMarkdown?.length ?? 0;
    const nodeCount = results.spovs.parsedNodes?.length ?? 0;
    console.log(`  [LLM] spovs: markdown=${mdLen} chars, parsedNodes=${nodeCount}`);
  }
  if (results.insights) {
    const mdLen = results.insights.sectionMarkdown?.length ?? 0;
    const nodeCount = results.insights.parsedNodes?.length ?? 0;
    console.log(`  [LLM] insights: markdown=${mdLen} chars, parsedNodes=${nodeCount}`);
  }
  for (const cat of results.categories) {
    const mdLen = cat.sectionMarkdown?.length ?? 0;
    const nodeCount = cat.parsedNodes?.length ?? 0;
    console.log(`  [LLM] category "${cat.category}": markdown=${mdLen} chars, parsedNodes=${nodeCount}, insights=${cat.candidateInsights?.length ?? 0}, spovs=${cat.candidateSpovs?.length ?? 0}`);
  }
  for (const unk of results.unknownSections) {
    const mdLen = unk.sectionMarkdown?.length ?? 0;
    const nodeCount = unk.parsedNodes?.length ?? 0;
    console.log(`  [LLM] unknown section: classified as ${unk.classification}, markdown=${mdLen} chars, parsedNodes=${nodeCount}`);
  }
  if (results.scratchpad.length > 0) {
    console.log(`  [LLM] scratchpad: ${results.scratchpad.length} items`);
  }
}
