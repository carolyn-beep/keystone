/**
 * Section Identification and Chunk Serialization for BrainLift Pre-Formatting.
 *
 * Splits a raw HierarchyNode[] tree into semantic chunks suitable for
 * parallel LLM classification calls.
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import {
  type ChunkType,
  type PreformatChunk,
  SECTION_PATTERNS,
  CATEGORY_PATTERN,
} from './types';

/**
 * Classify a top-level node name against canonical section patterns.
 * Returns the matching ChunkType, 'knowledgeTree' (intermediate), or 'unknown'.
 */
export type SectionClassification = ChunkType | 'knowledgeTree' | 'scratchpad';

export function identifySection(name: string): SectionClassification {
  const trimmed = name.trim();
  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return key as SectionClassification;
    }
  }
  return 'unknown';
}

/**
 * Split a Knowledge Tree node into per-category chunks or a single KT chunk.
 *
 * If any children match the category pattern, those become 'category' chunks.
 * Non-category children are grouped into a single 'knowledge_tree' chunk.
 * If no categories are found, the entire node becomes one 'knowledge_tree' chunk.
 */
export function splitKnowledgeTree(
  node: HierarchyNode,
): { type: ChunkType; label: string; nodes: HierarchyNode[] }[] {
  const categoryChildren: HierarchyNode[] = [];
  const otherChildren: HierarchyNode[] = [];

  for (const child of node.children) {
    if (CATEGORY_PATTERN.test(child.name.trim())) {
      categoryChildren.push(child);
    } else {
      otherChildren.push(child);
    }
  }

  // No categories found — return entire KT as one chunk
  if (categoryChildren.length === 0) {
    return [{ type: 'knowledge_tree', label: node.name, nodes: [node] }];
  }

  const result: { type: ChunkType; label: string; nodes: HierarchyNode[] }[] = [];

  // Each category child becomes its own chunk
  for (const cat of categoryChildren) {
    result.push({ type: 'category', label: cat.name, nodes: [cat] });
  }

  // Non-category children go into a knowledge_tree chunk
  if (otherChildren.length > 0) {
    result.push({
      type: 'knowledge_tree',
      label: node.name,
      nodes: otherChildren,
    });
  }

  return result;
}

/**
 * Recursively serialize a HierarchyNode subtree into indented markdown.
 * Each node becomes `- {name}` indented by 2 spaces per depth level.
 * Notes appear as indented text below the node line.
 */
export function serializeSubtree(node: HierarchyNode, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  let result = `${indent}- ${node.name}\n`;

  if (node.note) {
    result += `${indent}  ${node.note}\n`;
  }

  for (const child of node.children) {
    result += serializeSubtree(child, depth + 1);
  }

  return result;
}

/**
 * Collect all node IDs in a subtree (depth-first).
 */
export function collectNodeIds(node: HierarchyNode): string[] {
  const ids: string[] = [node.id];
  for (const child of node.children) {
    ids.push(...collectNodeIds(child));
  }
  return ids;
}

/**
 * Build a full markdown chunk including context header.
 */
function buildChunkMarkdown(
  type: ChunkType,
  label: string,
  nodes: HierarchyNode[],
): string {
  let markdown = `## ${type}: ${label}\n\n`;
  for (const node of nodes) {
    markdown += serializeSubtree(node);
  }
  return markdown;
}

export interface ChunkingResult {
  chunks: PreformatChunk[];
  /** Original scratchpad nodes — bypassed from LLM, copied verbatim to output */
  bypassedScratchpad: HierarchyNode[];
}

/**
 * Main entry point. Given HierarchyNode[] roots, identify sections,
 * split Knowledge Tree into categories, and serialize each chunk.
 *
 * Scratchpad nodes are detected and BYPASSED — they are not sent to LLMs.
 * They are returned separately for verbatim copying into the final output.
 *
 * Returns ChunkingResult with chunks for LLM processing + bypassed scratchpad.
 */
export function identifyAndSerializeChunks(
  roots: HierarchyNode[],
): ChunkingResult {
  if (roots.length === 0) {
    return { chunks: [], bypassedScratchpad: [] };
  }

  // Top-level children are the section boundaries.
  // If the tree has a single root, use its children. If multiple roots, use them directly.
  const topLevelNodes =
    roots.length === 1 && roots[0].children.length > 0
      ? roots[0].children
      : roots;

  // Classify each top-level node
  const classified: {
    section: SectionClassification;
    node: HierarchyNode;
  }[] = topLevelNodes.map((node) => ({
    section: identifySection(node.name),
    node,
  }));

  // Extract scratchpad nodes — bypass LLM processing entirely
  const bypassedScratchpad: HierarchyNode[] = [];
  const nonScratchpad = classified.filter((c) => {
    if (c.section === 'scratchpad') {
      bypassedScratchpad.push(c.node);
      return false;
    }
    return true;
  });

  // If all remaining nodes are unknown, return a single 'unstructured' chunk
  const allUnknown = nonScratchpad.every((c) => c.section === 'unknown');
  if (allUnknown && nonScratchpad.length > 0) {
    const allNodes = nonScratchpad.map((c) => c.node);
    const allIds = allNodes.flatMap(collectNodeIds);
    return {
      chunks: [
        {
          type: 'unstructured',
          label: 'Full Document',
          markdown: buildChunkMarkdown('unstructured', 'Full Document', allNodes),
          sourceNodeIds: allIds,
          originalNodes: allNodes,
        },
      ],
      bypassedScratchpad,
    };
  }

  // ── Extract misplaced children ──────────────────────────────────
  // Scan each classified node's direct children for nodes that match a
  // DIFFERENT section pattern. Pull them out as separate top-level entries
  // so each goes to the correct section-specific prompt.
  const expanded: typeof nonScratchpad = [];
  for (const entry of nonScratchpad) {
    const { section, node } = entry;
    if (section === 'unknown' || node.children.length === 0) {
      expanded.push(entry);
      continue;
    }

    const kept: HierarchyNode[] = [];
    let hadMisplaced = false;

    for (const child of node.children) {
      const childSection = identifySection(child.name);
      if (childSection !== 'unknown' && childSection !== section) {
        // This child belongs to a different section — extract it
        if (childSection === 'scratchpad') {
          bypassedScratchpad.push(child);
        } else {
          expanded.push({ section: childSection, node: child });
        }
        hadMisplaced = true;
      } else {
        kept.push(child);
      }
    }

    if (hadMisplaced) {
      // Rebuild the parent node with only its rightful children
      if (kept.length > 0) {
        const trimmedNode: HierarchyNode = { ...node, children: kept };
        expanded.push({ section, node: trimmedNode });
      }
      // If all children were misplaced, the parent has nothing left — skip it
    } else {
      expanded.push(entry);
    }
  }

  // ── Build chunks from expanded list ───────────────────────────────
  const chunks: PreformatChunk[] = [];
  const unknownNodes: HierarchyNode[] = [];

  for (const { section, node } of expanded) {
    if (section === 'unknown') {
      unknownNodes.push(node);
      continue;
    }

    if (section === 'knowledgeTree') {
      // Split into per-category chunks or single KT chunk
      const ktChunks = splitKnowledgeTree(node);
      for (const ktChunk of ktChunks) {
        const allIds = ktChunk.nodes.flatMap(collectNodeIds);
        chunks.push({
          type: ktChunk.type,
          label: ktChunk.label,
          markdown: buildChunkMarkdown(ktChunk.type, ktChunk.label, ktChunk.nodes),
          sourceNodeIds: allIds,
          originalNodes: ktChunk.nodes,
        });
      }
      continue;
    }

    // Regular section (owner, purpose, experts, spovs, insights)
    const chunkType = section as ChunkType;
    const allIds = collectNodeIds(node);
    chunks.push({
      type: chunkType,
      label: node.name,
      markdown: buildChunkMarkdown(chunkType, node.name, [node]),
      sourceNodeIds: allIds,
      originalNodes: [node],
    });
  }

  // Group unknown nodes into a single 'unknown' chunk
  if (unknownNodes.length > 0) {
    const allIds = unknownNodes.flatMap(collectNodeIds);
    chunks.push({
      type: 'unknown',
      label: 'Unrecognized Sections',
      markdown: buildChunkMarkdown('unknown', 'Unrecognized Sections', unknownNodes),
      sourceNodeIds: allIds,
      originalNodes: unknownNodes,
    });
  }

  // ── Split oversized chunks (recursive) ────────────────────────
  const finalChunks = splitOversizedChunks(chunks);

  return { chunks: finalChunks, bypassedScratchpad };
}

// ═══════════════════════════════════════════════════════════════════════════
// Recursive Chunk Splitting
// ═══════════════════════════════════════════════════════════════════════════

const MAX_CHUNK_CHARS = 15000;
const MAX_SPLIT_DEPTH = 4;

/**
 * Recursively split oversized chunks until all are under the threshold.
 *
 * Three strategies, tried in order:
 * 1. Multi-root: chunk has multiple originalNodes → split into one chunk per root
 * 2. Single root with children → split by children
 * 3. Can't split further (leaf or max depth) → send as-is
 */
export function splitOversizedChunks(
  chunks: PreformatChunk[],
  maxChars: number = MAX_CHUNK_CHARS,
  maxDepth: number = MAX_SPLIT_DEPTH,
): PreformatChunk[] {
  const result: PreformatChunk[] = [];
  // Queue entries: [chunk, currentDepth]
  const queue: Array<[PreformatChunk, number]> = chunks.map(c => [c, 0]);

  while (queue.length > 0) {
    const [chunk, depth] = queue.shift()!;

    // Under threshold or max depth reached → accept as-is
    if (chunk.markdown.length <= maxChars || depth >= maxDepth) {
      result.push(chunk);
      continue;
    }

    // Debug: log what we're about to split
    console.log(`  [ChunkSplit] Oversized: type=${chunk.type} label="${chunk.label}" len=${chunk.markdown.length} depth=${depth} originalNodes=${chunk.originalNodes.length} rootChildren=${chunk.originalNodes[0]?.children.length ?? 0}`);

    // Strategy 1: Multiple originalNodes → split into one chunk per root
    if (chunk.originalNodes.length > 1) {
      for (const node of chunk.originalNodes) {
        const nodeIds = collectNodeIds(node);
        queue.push([{
          type: chunk.type,
          label: `${chunk.label} > ${node.name}`,
          markdown: buildChunkMarkdown(chunk.type, `${chunk.label} > ${node.name}`, [node]),
          sourceNodeIds: nodeIds,
          originalNodes: [node],
        }, depth + 1]);
      }
      continue;
    }

    // Strategy 2: Single root with splittable children → split by children
    // If the root has exactly 1 child, unwrap it and split by grandchildren instead
    let root = chunk.originalNodes[0];
    let label = chunk.label;
    if (root && root.children.length === 1 && root.children[0].children.length > 0) {
      // Unwrap the single-child wrapper
      label = `${label} > ${root.children[0].name}`;
      root = root.children[0];
    }
    if (root && root.children.length > 1) {
      for (const child of root.children) {
        const childIds = collectNodeIds(child);
        queue.push([{
          type: chunk.type,
          label: `${label} > ${child.name}`,
          markdown: buildChunkMarkdown(chunk.type, `${label} > ${child.name}`, [child]),
          sourceNodeIds: childIds,
          originalNodes: [child],
        }, depth + 1]);
      }
      continue;
    }

    // Strategy 3: Can't split further (leaf node or single child) → accept as-is
    result.push(chunk);
  }

  return result;
}
