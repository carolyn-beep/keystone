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
export function identifySection(name: string): ChunkType | 'knowledgeTree' {
  const trimmed = name.trim();
  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    if (pattern.test(trimmed)) {
      // 'knowledgeTree' is an intermediate type — not a final ChunkType
      // It gets resolved to 'category' or 'knowledge_tree' by splitKnowledgeTree
      return key as ChunkType | 'knowledgeTree';
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

/**
 * Main entry point. Given HierarchyNode[] roots, identify sections,
 * split Knowledge Tree into categories, and serialize each chunk.
 *
 * Returns PreformatChunk[] ready for downstream LLM calls.
 */
export function identifyAndSerializeChunks(
  roots: HierarchyNode[],
): PreformatChunk[] {
  if (roots.length === 0) {
    return [];
  }

  // Top-level children are the section boundaries.
  // If the tree has a single root, use its children. If multiple roots, use them directly.
  const topLevelNodes =
    roots.length === 1 && roots[0].children.length > 0
      ? roots[0].children
      : roots;

  // Classify each top-level node
  const classified: {
    section: ChunkType | 'knowledgeTree';
    node: HierarchyNode;
  }[] = topLevelNodes.map((node) => ({
    section: identifySection(node.name),
    node,
  }));

  // If all nodes are unknown, return a single 'unstructured' chunk
  const allUnknown = classified.every((c) => c.section === 'unknown');
  if (allUnknown) {
    const allNodes = roots.length === 1 ? [roots[0]] : roots;
    const allIds = allNodes.flatMap(collectNodeIds);
    return [
      {
        type: 'unstructured',
        label: 'Full Document',
        markdown: buildChunkMarkdown('unstructured', 'Full Document', allNodes),
        sourceNodeIds: allIds,
        originalNodes: allNodes,
      },
    ];
  }

  const chunks: PreformatChunk[] = [];
  const unknownNodes: HierarchyNode[] = [];

  for (const { section, node } of classified) {
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

  return chunks;
}
