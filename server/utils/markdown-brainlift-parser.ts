/**
 * Markdown Brainlift Parser
 *
 * Converts a structured .md brainlift file (following the template in
 * docs/brainlift-md-format.md) into a HierarchyNode[] tree -- the same
 * format the Workflowy parser produces. All downstream extractors, graders,
 * and linkers work unchanged.
 *
 * Pure function -- no LLM calls, no side effects.
 */

import type { HierarchyNode, WorkflowyFetchResult } from '@shared/hierarchy-types';

// ---------------------------------------------------------------------------
// Marker regexes -- identical to server/utils/external-sources.ts lines 10-17.
// Duplicated here to avoid changing the external-sources module's public API.
// If the canonical patterns change, update these too.
// ---------------------------------------------------------------------------
const DOK1_PATTERN = /DOK\s*1\b/i;
const DOK2_PATTERN = /^DOK\s*2\b/i;
const DOK3_PATTERN = /^DOK\s*3\b/i;
const DOK4_PATTERN = /^(DOK\s*4\b|SPOVs?\b(?!\s*\d)|Spiky\s+POVs?\b(?!\s*\d))/i;
const SOURCE_PATTERN = /^Source\s*\d*/i;
const CATEGORY_PATTERN = /^Category\s*\d*/i;
const PURPOSE_PATTERN = /^Purpose\s*$/i;
const URL_PATTERN = /https?:\/\/[^\s\]\)]+/;

/**
 * Parse a structured .md brainlift file into a HierarchyNode[] tree.
 *
 * Applies the same marker detection regexes as Workflowy parsing.
 * Returns both the raw markdown (for originalContent storage) and
 * the parsed hierarchy (for the extraction pipeline).
 */
export function parseMarkdownBrainlift(markdown: string): WorkflowyFetchResult {
  if (!markdown) {
    return { markdown: '', hierarchy: [] };
  }

  // Normalize line endings and tabs
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ');

  const lines = normalized.split('\n');
  let nodeIdCounter = 0;

  // Stack tracks the current ancestry chain: [{ node, depth }]
  const stack: Array<{ node: HierarchyNode; depth: number }> = [];
  const roots: HierarchyNode[] = [];

  for (const rawLine of lines) {
    // Trim trailing whitespace only (preserve leading for depth calc)
    const line = rawLine.replace(/\s+$/, '');

    // Skip blank lines
    if (!line) continue;

    // Skip # Title lines
    if (/^#\s/.test(line)) continue;

    // Only process bullet lines: detect "- " after optional leading spaces
    const bulletMatch = line.match(/^(\s*)-\s(.*)$/);
    if (!bulletMatch) continue;

    const leadingSpaces = bulletMatch[1].length;
    const depth = Math.floor(leadingSpaces / 2);
    const name = bulletMatch[2].trim();

    // Apply marker regexes
    const isDOK1Marker = DOK1_PATTERN.test(name);
    const isDOK2Marker = DOK2_PATTERN.test(name);
    const isDOK3Marker = DOK3_PATTERN.test(name);
    const isDOK4Marker = DOK4_PATTERN.test(name);
    const isSourceMarker = SOURCE_PATTERN.test(name);
    const isCategoryMarker = CATEGORY_PATTERN.test(name);
    const isPurposeMarker = PURPOSE_PATTERN.test(name);

    // Extract URL
    const urlMatch = name.match(URL_PATTERN);
    const extractedUrl = urlMatch ? urlMatch[0] : null;

    const node: HierarchyNode = {
      id: `node_${++nodeIdCounter}`,
      name,
      note: null,
      depth,
      children: [],
      isDOK1Marker,
      isDOK2Marker,
      isDOK3Marker,
      isDOK4Marker,
      isSourceMarker,
      isCategoryMarker,
      isPurposeMarker,
      extractedUrl,
    };

    // Pop stack until we find a parent (depth strictly less than current)
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      // Top-level node
      roots.push(node);
    } else {
      // Child of the current stack top
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, depth });
  }

  return { markdown, hierarchy: roots };
}
