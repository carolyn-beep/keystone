/**
 * Markdown-to-Hierarchy Parser
 *
 * Parses indented markdown bullet lines back into HierarchyNode[].
 * Reverse of serializeSubtree(). Sets marker booleans using
 * the same regex patterns as the Workflowy parser.
 */

import type { HierarchyNode } from '@shared/hierarchy-types';

// Marker patterns — same as file-extractors.ts
const DOK1_PATTERN = /DOK\s*1\b/i;
const DOK2_PATTERN = /^DOK\s*2\b/i;
const DOK3_PATTERN = /^DOK\s*3\b/i;
const DOK4_PATTERN = /^(DOK\s*4\b|SPOVs?\b(?!\s*\d)|Spiky\s+POVs?\b(?!\s*\d))/i;
const SOURCE_PATTERN = /^Source\s*\d*/i;
const CATEGORY_PATTERN = /^Category\s*\d*/i;
const PURPOSE_PATTERN = /^Purpose\s*$/i;

let idCounter = 0;

function nextId(): string {
  return `md-parsed-${++idCounter}`;
}

/**
 * Parse a markdown string (indented bullet list) into HierarchyNode[].
 *
 * Expected format:
 * ```
 * - Root item
 *   - Child item
 *     - Grandchild
 * - Another root
 * ```
 *
 * Each line: optional spaces + "- " + text
 * Depth determined by leading spaces (2 spaces per level).
 */
export function parseMarkdownToHierarchy(markdown: string): HierarchyNode[] {
  idCounter = 0;
  const lines = markdown.split('\n');
  const roots: HierarchyNode[] = [];
  const stack: { node: HierarchyNode; depth: number }[] = [];

  for (const line of lines) {
    // Match lines like "  - text" or "- text"
    const match = line.match(/^(\s*)-\s(.+)/);
    if (!match) continue;

    const indent = match[1].length;
    const depth = Math.floor(indent / 2);
    const name = match[2].trim();

    if (!name) continue;

    const node: HierarchyNode = {
      id: nextId(),
      name,
      note: null,
      depth,
      children: [],
      isDOK1Marker: DOK1_PATTERN.test(name),
      isDOK2Marker: DOK2_PATTERN.test(name),
      isDOK3Marker: DOK3_PATTERN.test(name),
      isDOK4Marker: DOK4_PATTERN.test(name),
      isSourceMarker: SOURCE_PATTERN.test(name),
      isCategoryMarker: CATEGORY_PATTERN.test(name),
      isPurposeMarker: PURPOSE_PATTERN.test(name),
      extractedUrl: extractUrl(name),
    };

    // Pop stack until we find a parent at shallower depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    stack.push({ node, depth });
  }

  return roots;
}

/**
 * Extract URL from a node name if it contains one.
 * Handles both plain URLs and markdown links [text](url).
 */
function extractUrl(name: string): string | null {
  // Markdown link: [text](url)
  const mdMatch = name.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (mdMatch) return mdMatch[1];

  // Plain URL
  const urlMatch = name.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch) return urlMatch[1];

  return null;
}
