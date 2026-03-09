/**
 * Preformat Orchestrator Service
 *
 * Main entry point for the BrainLift pre-formatting pipeline.
 * Composes: chunking -> LLM calls -> merging -> validation -> tree building.
 *
 * Returns null on any failure (caller should fall back to original hierarchy).
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type { ValidationReport } from '../ai/preformat/types';
import { identifyAndSerializeChunks } from '../ai/preformat/chunker';
import { runPreformatLLMCalls } from '../ai/preformat/llm-caller';
import { mergePreformatResults } from '../ai/preformat/merger';
import { validateIntegrity } from '../ai/preformat/validator';
import { buildCleanHierarchy } from '../ai/preformat/tree-builder';

/**
 * Preformat a hierarchy and return clean tree.
 * Returns null on failure (caller should fall back to original).
 */
export async function preformatHierarchy(
  hierarchy: HierarchyNode[]
): Promise<{ cleanHierarchy: HierarchyNode[]; report: ValidationReport } | null> {
  if (!hierarchy || hierarchy.length === 0) {
    console.log('[Preformat] Empty hierarchy, skipping');
    return null;
  }

  const startTime = Date.now();

  try {
    // Step 1: Identify sections and serialize chunks
    const chunks = identifyAndSerializeChunks(hierarchy);
    console.log(`[Preformat] Identified ${chunks.length} chunks`);

    // Step 2: Run parallel LLM classification calls
    const llmResults = await runPreformatLLMCalls(chunks);

    // Step 3: Merge results (dedup, global numbering, cross-refs)
    const merged = mergePreformatResults(llmResults);

    // Step 4: Validate integrity (no hallucination, no loss, no dupes)
    const report = validateIntegrity(hierarchy, merged);

    const duration = Date.now() - startTime;
    console.log(`[Preformat] Completed in ${duration}ms, ${chunks.length} chunks, passed=${report.passed}, loss=${report.contentLossPercent}%`);

    if (!report.passed) {
      console.log(`[Preformat] Validation failed: ${report.warnings.join('; ')}`);
      return null;
    }

    // Step 5: Build canonical HierarchyNode[] tree
    const cleanHierarchy = buildCleanHierarchy(merged);

    return { cleanHierarchy, report };
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Preformat] Pipeline error after ${duration}ms:`, err);
    return null;
  }
}
