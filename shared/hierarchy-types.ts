/**
 * Type definitions for Workflowy hierarchy preservation
 *
 * Used to maintain tree structure from Workflowy API for better
 * DOK1 fact extraction with accurate source attribution.
 */

/** Raw Workflowy node structure from API response */
export interface WorkflowyNode {
  nm?: string;           // name (bullet text, may contain HTML)
  no?: string;           // notes (additional text under bullet)
  ch?: WorkflowyNode[];  // children (nested bullets)
  id?: string;           // node ID
}

/** Processed hierarchy node with marker detection */
export interface HierarchyNode {
  id: string;
  name: string;          // Cleaned text (HTML stripped)
  note: string | null;
  depth: number;
  children: HierarchyNode[];
  // Derived markers for extraction
  isDOK1Marker: boolean;
  isSourceMarker: boolean;
  isCategoryMarker: boolean;
  extractedUrl: string | null;
}

/** Result from Workflowy fetch with both formats */
export interface WorkflowyFetchResult {
  markdown: string;           // Existing output (backward compat)
  hierarchy: HierarchyNode[]; // New tree structure
}

/** Context found by walking up the hierarchy from a DOK1 node */
export interface AncestorContext {
  category: string | null;
  source: string | null;
  sourceUrl: string | null;
}

/** A fact extracted from the hierarchy with its context */
export interface HierarchyExtractedFact {
  id: string;
  fact: string;
  category: string;
  source: string | null;
  sourceUrl: string | null;
  depth: number;
}

/** Result from hierarchy-based extraction */
export interface HierarchyExtractionResult {
  facts: HierarchyExtractedFact[];
  metadata: {
    dok1NodesFound: number;
    totalFactsExtracted: number;
    sourcesAttributed: number;
    categoriesFound: string[];
  };
}
