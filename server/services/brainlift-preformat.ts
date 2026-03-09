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

/**
 * Preformat a hierarchy and return clean tree.
 * Returns null on failure (caller should fall back to original).
 */
export async function preformatHierarchy(
  _hierarchy: HierarchyNode[]
): Promise<{ cleanHierarchy: HierarchyNode[]; report: ValidationReport } | null> {
  // TODO: implement
  throw new Error('Not implemented');
}
