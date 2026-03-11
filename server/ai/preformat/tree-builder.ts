/**
 * Canonical Tree Assembly
 *
 * Provides buildCleanHierarchy (FR4):
 * - Converts MergedPreformatResult into HierarchyNode[] tree
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
  purpose: { purpose: string; outOfScope: string[] },
  depth: number,
): HierarchyNode {
  const children: HierarchyNode[] = [
    makeNode({ section: 'purpose', name: purpose.purpose, depth: depth + 1 }),
  ];

  if (purpose.outOfScope.length > 0) {
    const oosChildren = purpose.outOfScope.map(item =>
      makeNode({ section: 'purpose', name: item, depth: depth + 2 }),
    );
    children.push(
      makeNode({
        section: 'purpose',
        name: 'Out of scope:',
        depth: depth + 1,
        children: oosChildren,
      }),
    );
  }

  return makeNode({
    section: 'purpose',
    name: 'Purpose',
    depth,
    isPurposeMarker: true,
    children,
  });
}

function buildExpertsSection(
  experts: MergedPreformatResult['experts'],
  depth: number,
): HierarchyNode {
  const expertChildren = experts.map(expert => {
    const fields: HierarchyNode[] = [
      makeNode({ section: 'expert', name: `Who: ${expert.who}`, depth: depth + 2 }),
      makeNode({ section: 'expert', name: `Focus: ${expert.focus}`, depth: depth + 2 }),
      makeNode({ section: 'expert', name: `Why Follow: ${expert.whyFollow}`, depth: depth + 2 }),
      makeNode({ section: 'expert', name: `Where: ${expert.where}`, depth: depth + 2 }),
    ];

    // Emit additional fields as extra child nodes
    for (const af of (expert.additionalFields ?? [])) {
      fields.push(makeNode({ section: 'expert', name: `${af.label}: ${af.value}`, depth: depth + 2 }));
    }

    return makeNode({
      section: 'expert',
      name: `Expert - ${expert.name}`,
      depth: depth + 1,
      children: fields,
    });
  });

  return makeNode({
    section: 'experts',
    name: 'Experts',
    depth,
    children: expertChildren,
  });
}

function buildDOK4Section(
  spovs: MergedPreformatResult['spovs'],
  depth: number,
): HierarchyNode {
  const spovChildren = spovs.map(spov => {
    const contextChildren = (spov.context ?? []).map(ctx =>
      makeNode({ section: 'spov-context', name: ctx, depth: depth + 2 }),
    );
    return makeNode({
      section: 'spov',
      name: `spov ${spov.globalIndex} - ${spov.text}`,
      depth: depth + 1,
      children: contextChildren,
    });
  });

  return makeNode({
    section: 'dok4',
    name: 'DOK4 - SPOV',
    depth,
    isDOK4Marker: true,
    children: spovChildren,
  });
}

function buildDOK3Section(
  insights: MergedPreformatResult['insights'],
  depth: number,
): HierarchyNode {
  const insightChildren = insights.map(insight => {
    // Build Links sub-tree from sourceRefs
    const linkChildren = insight.sourceRefs.map(ref =>
      makeNode({ section: 'link', name: ref, depth: depth + 3 }),
    );
    const linksNode = makeNode({
      section: 'links',
      name: 'Links',
      depth: depth + 2,
      children: linkChildren,
    });

    return makeNode({
      section: 'insight',
      name: `Insight ${insight.globalIndex} - ${insight.text}`,
      depth: depth + 1,
      children: [linksNode],
    });
  });

  return makeNode({
    section: 'dok3',
    name: 'DOK3 - Insights',
    depth,
    isDOK3Marker: true,
    children: insightChildren,
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

function buildScratchpadSection(
  items: string[],
  depth: number,
): HierarchyNode {
  const children = items.map(item =>
    makeNode({ section: 'scratchpad', name: item, depth: depth + 1 }),
  );

  return makeNode({
    section: 'scratchpad',
    name: 'Scratchpad',
    depth,
    children,
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
 *   content (from merged.scratchpad) is appended as additional children.
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
  if (merged.purpose) {
    sections.push(buildPurposeSection(merged.purpose, rootDepth));
  }

  // 3. Experts
  if (merged.experts.length > 0) {
    sections.push(buildExpertsSection(merged.experts, rootDepth));
  }

  // 4. DOK4 - SPOV
  if (merged.spovs.length > 0) {
    sections.push(buildDOK4Section(merged.spovs, rootDepth));
  }

  // 5. DOK3 - Insights
  if (merged.insights.length > 0) {
    sections.push(buildDOK3Section(merged.insights, rootDepth));
  }

  // 6. DOK2 - Knowledge Tree
  if (merged.categories.length > 0) {
    sections.push(buildDOK2Section(merged.categories, rootDepth));
  }

  // 7. Scratchpad — original nodes copied verbatim + LLM-classified additions
  const hasOriginalScratchpad = bypassedScratchpad.length > 0;
  const hasLLMScratchpad = merged.scratchpad.length > 0;

  if (hasOriginalScratchpad || hasLLMScratchpad) {
    // Start with the original scratchpad's children (verbatim copy)
    const scratchpadChildren: HierarchyNode[] = [];

    for (const origNode of bypassedScratchpad) {
      // Copy the original scratchpad's children directly (preserve full subtree)
      for (const child of origNode.children) {
        scratchpadChildren.push(child);
      }
    }

    // Append LLM-classified scratchpad as additional children
    for (const item of merged.scratchpad) {
      scratchpadChildren.push(
        makeNode({ section: 'scratchpad', name: item, depth: rootDepth + 1 }),
      );
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
