import type { HierarchyNode } from '@shared/hierarchy-types';

/**
 * Canonical section types for preformat chunking.
 */
export type ChunkType =
  | 'owner'
  | 'purpose'
  | 'experts'
  | 'spovs'
  | 'insights'
  | 'category'        // single Knowledge Tree category
  | 'knowledge_tree'  // entire KT when no categories detected
  | 'unknown'         // unrecognized section
  | 'unstructured';   // entire flat document

/**
 * A chunk of a BrainLift document ready for LLM classification.
 */
export interface PreformatChunk {
  type: ChunkType;
  label: string;                    // human-readable: "Category 1: Branding"
  markdown: string;                 // serialized text for LLM
  sourceNodeIds: string[];          // original HierarchyNode IDs in this chunk
  originalNodes: HierarchyNode[];   // preserved for validation
}

/**
 * Regex patterns for identifying top-level sections.
 * Broader than extractor patterns to catch informal labels.
 */
export const SECTION_PATTERNS: Record<string, RegExp> = {
  owner: /^owner$/i,
  purpose: /^purpose/i,
  experts: /^experts?$/i,
  spovs: /^(DOK\s*4|SPOVs?|Spiky\s*POVs?)/i,
  insights: /^(DOK\s*3|insights?)/i,
  knowledgeTree: /^(DOK\s*2|knowledge\s*tree)/i,
};

/**
 * Pattern for detecting category markers within Knowledge Tree.
 */
export const CATEGORY_PATTERN = /^(category\s*\d*|#\s*category\s*\d*)/i;
