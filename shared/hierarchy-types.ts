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
  isDOK2Marker: boolean;  // NEW: DOK2 summary marker detection
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

/**
 * DOK2 summary point (individual item within a DOK2 group)
 */
export interface DOK2SummaryPoint {
  id: string;
  text: string;
  // Future: stance detection (supports/contradicts SPOV)
}

/**
 * DOK2 summary group (one per source)
 *
 * CRITICAL: DOK2 groups MUST reference their SOURCE - this is the primary relationship.
 * relatedDOK1Ids is secondary (for grading: "do these summaries capture these facts?")
 */
export interface DOK2SummaryGroup {
  id: string;
  // PRIMARY: Source reference (what this DOK2 summarizes)
  sourceName: string;              // e.g., "Academic Article on NIL"
  sourceUrl: string | null;        // URL to the source material
  sourceWorkflowyNodeId: string;   // Workflowy node ID of the source
  // Context
  category: string;                // Category this source belongs to
  // Content
  points: DOK2SummaryPoint[];      // The summary points (grouped together)
  // SECONDARY: Related DOK1s (for future grading)
  relatedDOK1Ids: string[];        // DOK1 fact IDs from same source
  // Metadata
  workflowyNodeId: string;         // Original DOK2 marker node ID
}

/** Result from hierarchy-based extraction (DOK1 only) */
export interface HierarchyExtractionResult {
  facts: HierarchyExtractedFact[];
  metadata: {
    dok1NodesFound: number;
    totalFactsExtracted: number;
    sourcesAttributed: number;
    categoriesFound: string[];
  };
}

/** Result from combined DOK1 + DOK2 extraction */
export interface FullHierarchyExtractionResult {
  facts: HierarchyExtractedFact[];
  dok2Summaries: DOK2SummaryGroup[];
  metadata: {
    dok1NodesFound: number;
    dok2NodesFound: number;
    totalFactsExtracted: number;
    totalDOK2PointsExtracted: number;
    sourcesAttributed: number;
    categoriesFound: string[];
  };
}
