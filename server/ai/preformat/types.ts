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

// ═══════════════════════════════════════════════════════════════════════════
// LLM Result Types (02-llm-calls)
// ═══════════════════════════════════════════════════════════════════════════

/** Owner section result */
export interface OwnerResult {
  name: string;
}

/** Purpose section result */
export interface PurposeResult {
  purpose: string;
  outOfScope: string[];
}

/** Single expert entry */
export interface ExpertResult {
  name: string;
  who: string;
  focus: string;
  whyFollow: string;
  where: string;
}

/** Experts section result */
export interface ExpertsChunkResult {
  experts: ExpertResult[];
}

/** Single SPOV entry */
export interface SpovResult {
  text: string;
  explicitInsightRefs: number[];
}

/** SPOVs section result */
export interface SpovsChunkResult {
  spovs: SpovResult[];
}

/** Single insight entry */
export interface InsightResult {
  text: string;
  sourceRefs: string[];
}

/** Insights section result */
export interface InsightsChunkResult {
  insights: InsightResult[];
}

/** Single source within a category */
export interface CategorySourceResult {
  name: string;
  url: string | null;
  facts: string[];
  summary: string[];
}

/** Candidate insight extracted from within a category */
export interface CandidateInsight {
  text: string;
  sourceRefs: string[];
}

/** Candidate SPOV extracted from within a category */
export interface CandidateSpov {
  text: string;
  sourceRefs: string[];
}

/** Category chunk result -- the critical one */
export interface CategoryChunkResult {
  category: string;
  sources: CategorySourceResult[];
  candidateInsights: CandidateInsight[];
  candidateSpovs: CandidateSpov[];
  scratchpad: string[];
  strippedTemplateInstructions: string[];
}

/** Unknown section result */
export interface UnknownChunkResult {
  classification: 'dok_content' | 'operational' | 'scratchpad';
  sources?: CategorySourceResult[];
  insights?: CandidateInsight[];
  spovs?: CandidateSpov[];
  content?: string[];
}

/** Unstructured (entire flat document) result */
export interface UnstructuredChunkResult {
  owner: OwnerResult | null;
  purpose: PurposeResult | null;
  experts: ExpertResult[];
  spovs: SpovResult[];
  insights: InsightResult[];
  categories: CategoryChunkResult[];
  scratchpad: string[];
}

/** Knowledge tree result (KT without category markers) */
export interface KnowledgeTreeChunkResult {
  categories: CategoryChunkResult[];
}

/** Aggregated results from all LLM calls */
export interface PreformatLLMResults {
  owner: OwnerResult | null;
  purpose: PurposeResult | null;
  experts: ExpertsChunkResult | null;
  spovs: SpovsChunkResult | null;
  insights: InsightsChunkResult | null;
  categories: CategoryChunkResult[];
  unknownSections: UnknownChunkResult[];
  scratchpad: string[];
}

/** Prompt configuration returned by each section-specific prompt builder */
export interface PromptConfig {
  system: string;
  user: string;
  jsonSchema: object;
}

// ═══════════════════════════════════════════════════════════════════════════
// Merge + Validation Types (03-merge-validate)
// ═══════════════════════════════════════════════════════════════════════════

/** Merged result from all LLM calls after dedup and global numbering */
export interface MergedPreformatResult {
  owner: { name: string } | null;
  purpose: { purpose: string; outOfScope: string[] } | null;
  experts: ExpertResult[];
  spovs: Array<SpovResult & { globalIndex: number }>;
  insights: Array<InsightResult & { globalIndex: number; sourceRefs: string[] }>;
  categories: CategoryChunkResult[];
  scratchpad: string[];
  mergeReport: {
    duplicateFactsRemoved: number;
    duplicateSourcesConsolidated: number;
    insightsDeduped: number;
    spovsDeduped: number;
    crossRefsUpdated: number;
  };
}

/** Integrity validation report */
export interface ValidationReport {
  passed: boolean;
  contentLossPercent: number;
  hallucinationCount: number;
  duplicateCount: number;
  warnings: string[];
  details: {
    missingFromOutput: string[];
    possibleHallucinations: string[];
    duplicatePairs: Array<[string, string]>;
  };
}
