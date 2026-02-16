/**
 * Hierarchy-Based DOK1 Fact Extractor
 *
 * Uses tree traversal to find DOK1 markers at any depth and walk UP
 * to find source/category ancestors for proper attribution.
 */

import type {
  HierarchyNode,
  AncestorContext,
  HierarchyExtractedFact,
  HierarchyExtractionResult,
  DOK2SummaryGroup,
  DOK2SummaryPoint,
  FullHierarchyExtractionResult,
} from '@shared/hierarchy-types';

/**
 * Find all DOK1 marker nodes at any depth in the hierarchy
 */
export function findDOK1Nodes(roots: HierarchyNode[]): HierarchyNode[] {
  const results: HierarchyNode[] = [];

  function traverse(node: HierarchyNode) {
    if (node.isDOK1Marker) {
      results.push(node);
    }
    node.children.forEach(traverse);
  }

  roots.forEach(traverse);
  return results;
}

/**
 * Build a parent map for efficient ancestor lookups
 */
export function buildParentMap(roots: HierarchyNode[]): Map<string, HierarchyNode | null> {
  const parentMap = new Map<string, HierarchyNode | null>();

  function traverse(node: HierarchyNode, parent: HierarchyNode | null) {
    parentMap.set(node.id, parent);
    node.children.forEach(child => traverse(child, node));
  }

  roots.forEach(root => traverse(root, null));
  return parentMap;
}

/**
 * Recursively search for URLs within a node's subtree
 * Prioritizes "Link to source" patterns, then any URL found
 * Excludes DOK1/DOK2 marker subtrees to avoid picking up unrelated URLs
 */
function findUrlInSubtree(node: HierarchyNode): string | null {
  // Don't search inside DOK1/DOK2 markers - those have their own content
  if (node.isDOK1Marker || node.isDOK2Marker) {
    return null;
  }

  // Check this node first
  if (node.extractedUrl) {
    return node.extractedUrl;
  }

  // Search children recursively
  for (const child of node.children) {
    // Prioritize "Link to source" pattern
    if (/link\s*to\s*source/i.test(child.name) && child.extractedUrl) {
      return child.extractedUrl;
    }
  }

  // Then check any child with URL
  for (const child of node.children) {
    const url = findUrlInSubtree(child);
    if (url) return url;
  }

  return null;
}

/**
 * Walk UP the tree from a DOK1 node to find ancestor context (category, source)
 * Also checks SIBLINGS of the DOK1 node since Source is often a sibling, not parent
 */
export function findAncestorContext(
  dok1Node: HierarchyNode,
  parentMap: Map<string, HierarchyNode | null>
): AncestorContext {
  let category: string | null = null;
  let source: string | null = null;
  let sourceUrl: string | null = null;

  // Helper: Check siblings for URL (looks for "Link to source" pattern or any URL)
  const findUrlInSiblings = (node: HierarchyNode, parent: HierarchyNode | null): string | null => {
    if (!parent) return null;
    for (const sibling of parent.children) {
      if (sibling.id !== node.id) {
        // Check for "Link to source" pattern (common in some brainlifts)
        if (/link\s*to\s*source/i.test(sibling.name) && sibling.extractedUrl) {
          return sibling.extractedUrl;
        }
        // Also check any sibling with a URL (recursively search subtree)
        const url = findUrlInSubtree(sibling);
        if (url) return url;
      }
    }
    return null;
  };

  // First, check siblings of the DOK1 node for Source marker or URL
  // This handles the common structure: Category > [Source, DOK1 Facts]
  const dok1Parent = parentMap.get(dok1Node.id);
  if (dok1Parent) {
    for (const sibling of dok1Parent.children) {
      if (sibling.id !== dok1Node.id && sibling.isSourceMarker && !source) {
        source = sibling.name.replace(/^Source\s*:?\s*/i, '').trim() || sibling.name;
        // Recursively search source subtree for URL
        sourceUrl = findUrlInSubtree(sibling);
        break;
      }
    }
    // Also check siblings for "Link to source" pattern (URL sibling of DOK1)
    if (!sourceUrl) {
      sourceUrl = findUrlInSiblings(dok1Node, dok1Parent);
    }
  }

  // Walk up from the DOK1 node's parent to find category and potentially more sources
  let current = dok1Parent;

  console.log(`[HierarchyExtractor] Walking ancestors for DOK1 "${dok1Node.name.substring(0, 30)}..."`);
  console.log(`[HierarchyExtractor]   dok1Parent: ${dok1Parent?.name.substring(0, 40) || 'null'}, isSource: ${dok1Parent?.isSourceMarker}`);
  console.log(`[HierarchyExtractor]   After sibling check: source="${source}", sourceUrl="${sourceUrl}"`);

  while (current) {
    console.log(`[HierarchyExtractor]   Checking ancestor: "${current.name.substring(0, 40)}", isSource: ${current.isSourceMarker}, isCat: ${current.isCategoryMarker}`);

    // Check for source marker in ancestors (closer ancestor takes precedence)
    if (current.isSourceMarker && !source) {
      source = current.name.replace(/^Source\s*:?\s*/i, '').trim() || current.name;
      console.log(`[HierarchyExtractor]   -> Found source: "${source}"`);

      // Recursively search source subtree for URL
      if (!sourceUrl) {
        sourceUrl = findUrlInSubtree(current);
      }
    }

    // Check for category marker
    if (current.isCategoryMarker && !category) {
      category = current.name.replace(/^Category\s*\d*:?\s*/i, '').trim() || current.name;
    }

    // Stop if we've found both
    if (category && source) break;

    current = parentMap.get(current.id);
  }

  // FALLBACK: If no explicit Category marker found, infer from DOK1's parent
  if (!category && dok1Parent) {
    if (dok1Parent.isSourceMarker) {
      // Parent is Source, use grandparent as category
      const grandparent = parentMap.get(dok1Parent.id);
      if (grandparent && !grandparent.isSourceMarker && !grandparent.isDOK1Marker) {
        category = grandparent.name;
        console.log(`[HierarchyExtractor]   -> Inferred category from grandparent: "${category}"`);
      }
    } else if (!dok1Parent.isDOK1Marker) {
      category = dok1Parent.name;
      console.log(`[HierarchyExtractor]   -> Inferred category from parent: "${category}"`);
    }
  }

  console.log(`[HierarchyExtractor]   FINAL: category="${category}", source="${source}", url="${sourceUrl}"`);
  return { category, source, sourceUrl };
}

/**
 * Extract individual facts from a DOK1 node's children
 */
function extractFactsFromDOK1Node(
  dok1Node: HierarchyNode,
  context: AncestorContext,
  startId: number
): HierarchyExtractedFact[] {
  const facts: HierarchyExtractedFact[] = [];
  let idCounter = startId;

  // Collect facts from a node's children, recursing into short-named labels
  // (e.g. "fact 1", "fact 2") that wrap the actual content one level deeper
  function collectFacts(node: HierarchyNode) {
    for (const child of node.children) {
      // Skip marker nodes (DOK2, etc.)
      if (child.isDOK1Marker || child.isDOK2Marker || child.isSourceMarker || child.isCategoryMarker) {
        continue;
      }

      const factText = child.name.trim();

      if (factText.length < 10) {
        // Short entry (e.g. "fact 1" label) — descend into its children
        // to find the actual fact content one level deeper
        if (child.children.length > 0) {
          collectFacts(child);
        }
        continue;
      }

      facts.push({
        id: `${idCounter++}`,
        fact: factText,
        category: context.category || 'General',
        source: context.source || 'Unknown',
        sourceUrl: context.sourceUrl,
        depth: child.depth,
      });

      // Also check grandchildren (nested facts under bullet points)
      for (const grandchild of child.children) {
        const grandchildText = grandchild.name.trim();
        if (grandchildText.length >= 10 && !grandchild.isDOK1Marker && !grandchild.isDOK2Marker) {
          facts.push({
            id: `${idCounter++}`,
            fact: grandchildText,
            category: context.category || 'General',
            source: context.source || 'Unknown',
            sourceUrl: context.sourceUrl,
            depth: grandchild.depth,
          });
        }
      }
    }
  }

  collectFacts(dok1Node);

  return facts;
}

/**
 * Main extraction function - extracts all DOK1 facts from hierarchy with proper context
 */
export function extractFactsFromHierarchy(
  roots: HierarchyNode[]
): HierarchyExtractionResult {
  if (!roots || roots.length === 0) {
    return {
      facts: [],
      metadata: {
        dok1NodesFound: 0,
        totalFactsExtracted: 0,
        sourcesAttributed: 0,
        categoriesFound: [],
      },
    };
  }

  // Build parent map for ancestor lookups
  const parentMap = buildParentMap(roots);

  // Find all DOK1 marker nodes
  const dok1Nodes = findDOK1Nodes(roots);

  console.log(`[HierarchyExtractor] Found ${dok1Nodes.length} DOK1 marker nodes`);

  const allFacts: HierarchyExtractedFact[] = [];
  const categoriesFound = new Set<string>();
  let sourcesAttributed = 0;
  let factIdCounter = 1;

  for (const dok1Node of dok1Nodes) {
    // Find context by walking up the tree
    const context = findAncestorContext(dok1Node, parentMap);

    console.log(`[HierarchyExtractor] DOK1 node "${dok1Node.name.substring(0, 30)}..." -> category: ${context.category}, source: ${context.source}`);

    // Extract facts from this DOK1 node
    const facts = extractFactsFromDOK1Node(dok1Node, context, factIdCounter);
    factIdCounter += facts.length;

    // Track statistics
    for (const fact of facts) {
      if (fact.category && fact.category !== 'General') {
        categoriesFound.add(fact.category);
      }
      if (fact.source && fact.source !== 'Unknown') {
        sourcesAttributed++;
      }
    }

    allFacts.push(...facts);
  }

  console.log(`[HierarchyExtractor] Extracted ${allFacts.length} facts from hierarchy`);

  return {
    facts: allFacts,
    metadata: {
      dok1NodesFound: dok1Nodes.length,
      totalFactsExtracted: allFacts.length,
      sourcesAttributed,
      categoriesFound: Array.from(categoriesFound),
    },
  };
}

/**
 * Convert hierarchy-extracted facts to the format expected by brainliftExtractor
 * IMPORTANT: URL must be in the `source` field for evidence fetching to work
 */
export function convertToExtractorFormat(facts: HierarchyExtractedFact[]): Array<{
  id: string;
  category: string;
  source: string | null;
  fact: string;
  score: number;
  aiNotes: string;
  contradicts: string | null;
  flags: string[];
}> {
  return facts.map(f => {
    // Build source string - URL is critical for evidence fetching
    // Format: "Source Name https://url" so extractUrlFromSource() can find it
    let sourceWithUrl: string | null = null;
    if (f.sourceUrl) {
      sourceWithUrl = f.source && f.source !== 'Unknown'
        ? `${f.source} ${f.sourceUrl}`
        : f.sourceUrl;
    } else {
      sourceWithUrl = f.source && f.source !== 'Unknown' ? f.source : null;
    }

    return {
      id: f.id,
      category: f.category,
      source: sourceWithUrl,
      fact: f.fact,
      score: 0,
      aiNotes: f.sourceUrl
        ? `Source: ${f.sourceUrl}`
        : f.source && f.source !== 'Unknown'
          ? `Source: ${f.source}`
          : "No sources have been linked to this fact",
      contradicts: null,
      flags: [],
    };
  });
}

// ============================================================================
// PURPOSE EXTRACTION
// ============================================================================

/**
 * Result from purpose extraction
 */
export interface ExtractedPurpose {
  mainPurpose: string;  // First meaningful child (not In-scope/Out-of-scope)
  fullText: string;     // Combined text for description field
}

/**
 * Extract purpose from hierarchy by finding the Purpose marker node
 * and extracting its first meaningful child.
 *
 * Expected structure:
 * - Purpose (depth 0, isPurposeMarker: true)
 *   - Main purpose text (depth 1) ← extract this
 *   - In-scope (depth 1) [optional]
 *   - Out-of-scope (depth 1) [optional]
 */
export function extractPurposeFromHierarchy(roots: HierarchyNode[]): ExtractedPurpose | null {
  // Find the Purpose marker node
  let purposeNode: HierarchyNode | null = null;

  function findPurposeNode(node: HierarchyNode): boolean {
    if (node.isPurposeMarker) {
      purposeNode = node;
      return true;
    }
    for (const child of node.children) {
      if (findPurposeNode(child)) return true;
    }
    return false;
  }

  for (const root of roots) {
    if (findPurposeNode(root)) break;
  }

  if (!purposeNode) {
    console.log('[PurposeExtractor] No Purpose marker node found');
    return null;
  }

  console.log(`[PurposeExtractor] Found Purpose node with ${purposeNode.children.length} children`);

  // Find the first meaningful child (not In-scope/Out-of-scope headers)
  const scopePattern = /^(In-scope|Out-of-scope)\s*$/i;
  let mainPurpose: string | null = null;
  const purposeParts: string[] = [];

  for (const child of purposeNode.children) {
    const text = child.name.trim();

    // Skip scope headers
    if (scopePattern.test(text)) {
      continue;
    }

    // Skip very short content (likely structural)
    if (text.length < 20) {
      continue;
    }

    // First meaningful child is the main purpose
    if (!mainPurpose) {
      mainPurpose = text;
    }

    // Collect all meaningful children for fullText
    purposeParts.push(text);
  }

  if (!mainPurpose) {
    console.log('[PurposeExtractor] No meaningful purpose content found');
    return null;
  }

  console.log(`[PurposeExtractor] Extracted purpose: "${mainPurpose.substring(0, 80)}..."`);

  return {
    mainPurpose,
    fullText: purposeParts.join(' '),
  };
}

// ============================================================================
// DOK2 EXTRACTION
// ============================================================================

/**
 * Find all DOK2 marker nodes at any depth in the hierarchy
 */
export function findDOK2Nodes(roots: HierarchyNode[]): HierarchyNode[] {
  const results: HierarchyNode[] = [];

  function traverse(node: HierarchyNode) {
    if (node.isDOK2Marker) {
      results.push(node);
    }
    node.children.forEach(traverse);
  }

  roots.forEach(traverse);
  return results;
}

/**
 * Find the source node ID by walking up from a DOK2 node
 * Looks for a sibling or ancestor with isSourceMarker or URL
 */
function findSourceNodeId(
  dok2Node: HierarchyNode,
  parentMap: Map<string, HierarchyNode | null>
): string | null {
  // First check siblings for a Source marker
  const parent = parentMap.get(dok2Node.id);
  if (parent) {
    for (const sibling of parent.children) {
      if (sibling.id !== dok2Node.id && sibling.isSourceMarker) {
        return sibling.id;
      }
    }
  }

  // Walk up ancestors to find source
  let current = parent;
  while (current) {
    if (current.isSourceMarker) {
      return current.id;
    }
    current = parentMap.get(current.id) ?? null;
  }

  return null;
}

/**
 * Recursively collect all text from a node and its descendants
 * Preserves hierarchy via depth indicator for indentation
 *
 * @param node - The node to collect from
 * @param depth - Current depth for indentation
 * @param isDirectChildOfDOK2 - Whether this node is a direct child of the DOK2 marker
 */
function collectNestedText(
  node: HierarchyNode,
  depth: number = 0,
  isDirectChildOfDOK2: boolean = false
): { text: string; depth: number }[] {
  const results: { text: string; depth: number }[] = [];

  // Skip marker nodes entirely
  if (node.isDOK1Marker || node.isDOK2Marker || node.isSourceMarker || node.isCategoryMarker) {
    return results;
  }

  const text = node.name.trim();
  const hasChildren = node.children.length > 0;

  // Determine if this node should be included as a point:
  // - Direct children of DOK2 WITH children are organizational headers → SKIP
  // - Everything else with meaningful length → CAPTURE
  const isOrganizationalHeader = isDirectChildOfDOK2 && hasChildren;
  const shouldInclude = text.length >= 10 && !isOrganizationalHeader;

  if (shouldInclude) {
    results.push({ text, depth });
  }

  // Recurse into children
  for (const child of node.children) {
    // If we skipped this node as a header, don't increase depth for children
    const childDepth = shouldInclude ? depth + 1 : depth;
    // Children are never direct children of DOK2 (only the first level is)
    results.push(...collectNestedText(child, childDepth, false));
  }

  return results;
}

/**
 * Extract DOK2 summaries grouped by source
 * Links each DOK2 group to related DOK1s from the same source
 */
export function extractDOK2Summaries(
  roots: HierarchyNode[],
  dok1Facts: HierarchyExtractedFact[]
): DOK2SummaryGroup[] {
  const parentMap = buildParentMap(roots);
  const dok2Nodes = findDOK2Nodes(roots);
  const summaries: DOK2SummaryGroup[] = [];
  let groupCounter = 0;

  console.log(`[DOK2Extractor] Found ${dok2Nodes.length} DOK2 marker nodes`);

  for (const dok2Node of dok2Nodes) {
    // Reuse existing findAncestorContext() for source/category
    const context = findAncestorContext(dok2Node, parentMap);

    // Extract summary points from DOK2 node's children (recursively)
    const points: DOK2SummaryPoint[] = [];
    let pointCounter = 0;

    for (const child of dok2Node.children) {
      // Recursively collect all nested text with hierarchy preserved
      // Pass true for isDirectChildOfDOK2 - these are the immediate children
      const nestedPoints = collectNestedText(child, 0, true);
      for (const p of nestedPoints) {
        pointCounter++;
        points.push({
          id: `${groupCounter + 1}.${pointCounter}`,
          text: '  '.repeat(p.depth) + p.text,  // Indentation preserves hierarchy
        });
      }
    }

    // Skip if no points extracted
    if (points.length === 0) {
      console.log(`[DOK2Extractor] Skipping DOK2 node "${dok2Node.name.substring(0, 40)}..." - no valid points`);
      continue;
    }

    // Find related DOK1s (same source)
    const relatedDOK1Ids = dok1Facts
      .filter(f => f.source === context.source)
      .map(f => f.id);

    // Find the source node ID (sibling or ancestor with isSourceMarker)
    const sourceNodeId = findSourceNodeId(dok2Node, parentMap);

    groupCounter++;
    const summary: DOK2SummaryGroup = {
      id: String(groupCounter),
      // PRIMARY: Source reference
      sourceName: context.source || 'Unknown Source',
      sourceUrl: context.sourceUrl,
      sourceWorkflowyNodeId: sourceNodeId || dok2Node.id,  // Source node, fallback to DOK2 node
      // Context
      category: context.category || 'General',
      // Content
      points,
      // SECONDARY: Related DOK1s
      relatedDOK1Ids,
      // Metadata
      workflowyNodeId: dok2Node.id,
    };

    console.log(`[DOK2Extractor] DOK2 group ${groupCounter}: source="${summary.sourceName}", points=${points.length}, relatedDOK1s=${relatedDOK1Ids.length}`);
    summaries.push(summary);
  }

  console.log(`[DOK2Extractor] Extracted ${summaries.length} DOK2 groups with ${summaries.reduce((sum, g) => sum + g.points.length, 0)} total points`);

  return summaries;
}

/**
 * Combined extraction - returns both DOK1 facts and DOK2 summaries
 */
export function extractAllFromHierarchy(roots: HierarchyNode[]): FullHierarchyExtractionResult {
  // Extract DOK1 first (existing logic)
  const dok1Result = extractFactsFromHierarchy(roots);

  // Extract DOK2, linking to DOK1s
  const dok2Summaries = extractDOK2Summaries(roots, dok1Result.facts);

  return {
    facts: dok1Result.facts,
    dok2Summaries,
    metadata: {
      dok1NodesFound: dok1Result.metadata.dok1NodesFound,
      dok2NodesFound: findDOK2Nodes(roots).length,
      totalFactsExtracted: dok1Result.metadata.totalFactsExtracted,
      totalDOK2PointsExtracted: dok2Summaries.reduce((sum, g) => sum + g.points.length, 0),
      sourcesAttributed: dok1Result.metadata.sourcesAttributed,
      categoriesFound: dok1Result.metadata.categoriesFound,
    },
  };
}
