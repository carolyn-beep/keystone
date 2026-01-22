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
function buildParentMap(roots: HierarchyNode[]): Map<string, HierarchyNode | null> {
  const parentMap = new Map<string, HierarchyNode | null>();

  function traverse(node: HierarchyNode, parent: HierarchyNode | null) {
    parentMap.set(node.id, parent);
    node.children.forEach(child => traverse(child, node));
  }

  roots.forEach(root => traverse(root, null));
  return parentMap;
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
        // Also check any sibling with a URL
        if (sibling.extractedUrl) {
          return sibling.extractedUrl;
        }
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
        if (sibling.extractedUrl) {
          sourceUrl = sibling.extractedUrl;
        }
        // Also check sibling's children for URL (e.g., Source > [link])
        for (const child of sibling.children) {
          if (child.extractedUrl) {
            sourceUrl = child.extractedUrl;
            break;
          }
        }
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

      // Check for URL in this node
      if (current.extractedUrl) {
        sourceUrl = current.extractedUrl;
      }
      // Check children of source for URL (handles Source > [DOK1, Link to source])
      if (!sourceUrl) {
        for (const child of current.children) {
          if (/link\s*to\s*source/i.test(child.name) && child.extractedUrl) {
            sourceUrl = child.extractedUrl;
            break;
          }
          if (child.extractedUrl) {
            sourceUrl = child.extractedUrl;
            break;
          }
        }
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

  // Facts are the children of the DOK1 marker node
  for (const child of dok1Node.children) {
    // Skip if it's a marker node (DOK2, etc.)
    if (child.isDOK1Marker || child.isSourceMarker || child.isCategoryMarker) {
      continue;
    }

    const factText = child.name.trim();
    if (factText.length < 10) {
      // Skip very short entries (likely headers or bullets)
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
      if (grandchildText.length >= 10 && !grandchild.isDOK1Marker) {
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
