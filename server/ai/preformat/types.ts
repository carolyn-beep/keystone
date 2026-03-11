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
/**
 * Order matters: more specific patterns first.
 * knowledgeTree before insights so "DOK3: Knowledge Tree" matches KT, not insights.
 */
export const SECTION_PATTERNS: Record<string, RegExp> = {
  owner: /^owner/i,
  purpose: /^purpose/i,
  experts: /(^experts?$|experts?\s*$)/i,
  spovs: /^(DOK\s*4|SPOVs?|Spiky\s*POVs?)/i,
  scratchpad: /^scratchpad$/i,
  knowledgeTree: /(knowledge\s*tree|categories|DOK\s*2)/i,
  insights: /^(DOK\s*3|insights?)/i,
};

/**
 * Pattern for detecting category markers within Knowledge Tree.
 */
export const CATEGORY_PATTERN = /^(category\s*\d*|#\s*category\s*\d*)/i;

// ═══════════════════════════════════════════════════════════════════════════
// LLM Result Types (02-llm-calls)
// ═══════════════════════════════════════════════════════════════════════════

/** Base type for all markdown-based section results */
export interface MarkdownSectionResult {
  sectionMarkdown: string;
  /** Parsed HierarchyNode[] from sectionMarkdown (set post-LLM) */
  parsedNodes: HierarchyNode[];
}

/** Owner section result — stays as JSON */
export interface OwnerResult {
  name: string;
}

/** Purpose section result — markdown-based */
export interface PurposeResult extends MarkdownSectionResult {}

/** Experts section result — markdown-based */
export interface ExpertsChunkResult extends MarkdownSectionResult {
  strippedTemplateInstructions: string[];
}

/** SPOVs section result — markdown-based */
export interface SpovsChunkResult extends MarkdownSectionResult {}

/** Insights section result — markdown-based */
export interface InsightsChunkResult extends MarkdownSectionResult {}

/** Candidate insight extracted from within a category */
export interface CandidateInsight {
  text: string;
  sourceRefs: string[];
}

/** Candidate SPOV extracted from within a category */
export interface CandidateSpov {
  text: string;
  sourceRefs: string[];
  context: string[];
}

/** Category chunk result — free-form markdown with parsed nodes */
export interface CategoryChunkResult extends MarkdownSectionResult {
  category: string;
  candidateInsights: CandidateInsight[];
  candidateSpovs: CandidateSpov[];
  strippedTemplateInstructions: string[];
}

/** Unknown section result — markdown-based with classification */
export interface UnknownChunkResult extends MarkdownSectionResult {
  classification: 'dok_content' | 'operational' | 'scratchpad';
}

/** Unstructured (entire flat document) result — markdown-based */
export interface UnstructuredChunkResult extends MarkdownSectionResult {}

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
  purposeNodes: HierarchyNode[];
  expertNodes: HierarchyNode[];
  spovNodes: HierarchyNode[];
  insightNodes: HierarchyNode[];
  categories: CategoryChunkResult[];
  scratchpadNodes: HierarchyNode[];
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
