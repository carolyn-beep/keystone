/**
 * Canonical Tree Assembly
 *
 * Provides buildCleanHierarchy (FR4):
 * - Converts MergedPreformatResult into HierarchyNode[] tree
 * - All sections use parsedNodes directly (except Owner which stays JSON)
 * - Correct node ordering, depths, markers, IDs
 * - Output matches the exact structure the hierarchy extractor expects
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type { MergedPreformatResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// ID Generation
// ═══════════════════════════════════════════════════════════════════════════

/** Counter state for generating unique IDs within a single build */
const idCounters: Record<string, number> = {};

function resetCounters() {
  for (const key of Object.keys(idCounters)) {
    delete idCounters[key];
  }
}

function nextId(section: string): string {
  if (!idCounters[section]) idCounters[section] = 0;
  idCounters[section]++;
  return `preformat-${section}-${idCounters[section]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Node Factory
// ═══════════════════════════════════════════════════════════════════════════

/** Create a HierarchyNode with all boolean markers defaulting to false */
function makeNode(opts: {
  section: string;
  name: string;
  depth: number;
  children?: HierarchyNode[];
  isDOK1Marker?: boolean;
  isDOK2Marker?: boolean;
  isDOK3Marker?: boolean;
  isDOK4Marker?: boolean;
  isSourceMarker?: boolean;
  isCategoryMarker?: boolean;
  isPurposeMarker?: boolean;
  extractedUrl?: string | null;
}): HierarchyNode {
  return {
    id: nextId(opts.section),
    name: opts.name,
    note: null,
    depth: opts.depth,
    children: opts.children ?? [],
    isDOK1Marker: opts.isDOK1Marker ?? false,
    isDOK2Marker: opts.isDOK2Marker ?? false,
    isDOK3Marker: opts.isDOK3Marker ?? false,
    isDOK4Marker: opts.isDOK4Marker ?? false,
    isSourceMarker: opts.isSourceMarker ?? false,
    isCategoryMarker: opts.isCategoryMarker ?? false,
    isPurposeMarker: opts.isPurposeMarker ?? false,
    extractedUrl: opts.extractedUrl ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Section Builders
// ═══════════════════════════════════════════════════════════════════════════

function buildOwnerSection(name: string, depth: number): HierarchyNode {
  return makeNode({
    section: 'owner',
    name: 'Owner',
    depth,
    children: [
      makeNode({ section: 'owner', name, depth: depth + 1 }),
    ],
  });
}

function buildPurposeSection(
  purposeNodes: HierarchyNode[],
  depth: number,
): HierarchyNode {
  return makeNode({
    section: 'purpose',
    name: 'Purpose',
    depth,
    isPurposeMarker: true,
    children: purposeNodes,
  });
}

function buildExpertsSection(
  expertNodes: HierarchyNode[],
  depth: number,
): HierarchyNode {
  return makeNode({
    section: 'experts',
    name: 'Experts',
    depth,
    children: expertNodes,
  });
}

function buildDOK4Section(
  spovNodes: HierarchyNode[],
  depth: number,
): HierarchyNode {
  return makeNode({
    section: 'dok4',
    name: 'DOK4 - SPOV',
    depth,
    isDOK4Marker: true,
    children: spovNodes,
  });
}

function buildDOK3Section(
  insightNodes: HierarchyNode[],
  depth: number,
): HierarchyNode {
  return makeNode({
    section: 'dok3',
    name: 'DOK3 - Insights',
    depth,
    isDOK3Marker: true,
    children: insightNodes,
  });
}

function buildDOK2Section(
  categories: MergedPreformatResult['categories'],
  depth: number,
): HierarchyNode {
  const categoryChildren = categories.map(cat => {
    // Use parsedNodes directly — they already have the right structure
    // with DOK markers, source markers, etc. set by the markdown parser
    const children = cat.parsedNodes ?? [];

    return makeNode({
      section: 'category',
      name: cat.category,
      depth: depth + 1,
      isCategoryMarker: true,
      children,
    });
  });

  return makeNode({
    section: 'dok2',
    name: 'DOK2 - Knowledge Tree',
    depth,
    children: categoryChildren,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a MergedPreformatResult into a canonical HierarchyNode[] tree.
 *
 * Sections are ordered: Owner, Purpose, Experts, DOK4, DOK3, DOK2, Scratchpad.
 * Missing sections are omitted from the tree.
 *
 * @param bypassedScratchpad - Original scratchpad HierarchyNode[] copied verbatim
 *   from the input. These are NOT sent to LLMs. Any LLM-classified scratchpad
 *   content (from merged.scratchpadNodes) is appended as additional children.
 */
export function buildCleanHierarchy(
  merged: MergedPreformatResult,
  bypassedScratchpad: HierarchyNode[] = [],
): HierarchyNode[] {
  // Reset ID counters for each build
  resetCounters();

  const rootDepth = 0;
  const sections: HierarchyNode[] = [];

  // 1. Owner
  if (merged.owner) {
    sections.push(buildOwnerSection(merged.owner.name, rootDepth));
  }

  // 2. Purpose
  if (merged.purposeNodes.length > 0) {
    sections.push(buildPurposeSection(merged.purposeNodes, rootDepth));
  }

  // 3. Experts
  if (merged.expertNodes.length > 0) {
    sections.push(buildExpertsSection(merged.expertNodes, rootDepth));
  }

  // 4. DOK4 - SPOV
  if (merged.spovNodes.length > 0) {
    sections.push(buildDOK4Section(merged.spovNodes, rootDepth));
  }

  // 5. DOK3 - Insights
  if (merged.insightNodes.length > 0) {
    sections.push(buildDOK3Section(merged.insightNodes, rootDepth));
  }

  // 6. DOK2 - Knowledge Tree
  if (merged.categories.length > 0) {
    sections.push(buildDOK2Section(merged.categories, rootDepth));
  }

  // 7. Scratchpad — original nodes copied verbatim + LLM-classified additions
  const hasOriginalScratchpad = bypassedScratchpad.length > 0;
  const hasLLMScratchpad = merged.scratchpadNodes.length > 0;

  if (hasOriginalScratchpad || hasLLMScratchpad) {
    // Start with the original scratchpad's children (verbatim copy)
    const scratchpadChildren: HierarchyNode[] = [];

    for (const origNode of bypassedScratchpad) {
      // Copy the original scratchpad's children directly (preserve full subtree)
      for (const child of origNode.children) {
        scratchpadChildren.push(child);
      }
    }

    // Append LLM-classified scratchpad nodes as additional children
    for (const node of merged.scratchpadNodes) {
      scratchpadChildren.push(node);
    }

    sections.push(
      makeNode({
        section: 'scratchpad',
        name: 'Scratchpad',
        depth: rootDepth,
        children: scratchpadChildren,
      }),
    );
  }

  return sections;
}
