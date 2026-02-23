import type { HierarchyNode } from '@shared/hierarchy-types';

// Same marker patterns as external-sources.ts (kept in sync)
const DOK1_PATTERN = /DOK\s*1\b/i;
const DOK2_PATTERN = /^DOK\s*2\b/i;
const DOK3_PATTERN = /^DOK\s*3\b/i;
const SOURCE_PATTERN = /^Source\s*\d*/i;
const CATEGORY_PATTERN = /^Category\s*\d*/i;
const PURPOSE_PATTERN = /^Purpose\s*$/i;
const URL_PATTERN = /https?:\/\/[^\s\]\)]+/;

/**
 * Detect if HTML is a WorkFlowy native export (has data-wfid or data-chid attributes).
 */
export function isWorkflowyExportHTML(htmlContent: string): boolean {
  return /data-wfid=/.test(htmlContent) || /data-chid=/.test(htmlContent);
}

/**
 * Strip HTML tags and decode entities from a string.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract URL from link tags inside HTML content.
 */
function extractUrlFromHtml(html: string): string | null {
  const hrefMatch = html.match(/href=["']([^"']+)["']/);
  if (hrefMatch) return hrefMatch[1];
  const urlMatch = html.match(URL_PATTERN);
  return urlMatch ? urlMatch[0] : null;
}

/**
 * Parse WorkFlowy native export HTML into HierarchyNode[] tree.
 * Uses a single-pass, stack-based approach for O(n) performance on large files.
 *
 * Export format per <li>:
 *   <div class="name" data-wfid="..." data-parent="...">
 *     <span class="innerContentContainer">text</span>
 *   </div>
 *   <span class="note"><span class="innerContentContainer">note</span></span>
 *   <ul>...children...</ul>
 */
export function parseWorkflowyExportHTML(htmlContent: string): { markdown: string; hierarchy: HierarchyNode[] } {
  let nodeIdCounter = 0;
  const roots: HierarchyNode[] = [];

  // Each stack frame holds the node being built + its collection state
  interface StackFrame {
    node: HierarchyNode;
    nameHtml: string;
    noteHtml: string;
    nodeId: string;
  }
  const stack: StackFrame[] = [];

  // Element-level state (not per-node — these track which HTML element we're inside)
  let inNameDiv = false;
  let inNoteSpan = false;
  let inInnerContent = false;
  let innerContentDepth = 0;

  // Derived: what are we actively collecting?
  const isCollectingName = () => inInnerContent && inNameDiv && stack.length > 0;
  const isCollectingNote = () => inInnerContent && inNoteSpan && stack.length > 0;

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let match;

  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const attrs = match[2] || '';
    const isClosing = fullTag[1] === '/';
    const frame = stack[stack.length - 1]; // Current <li> frame (if any)

    if (tagName === 'li' && !isClosing) {
      // Push new frame
      stack.push({
        node: {
          id: `node_${++nodeIdCounter}`,
          name: '',
          note: null,
          depth: stack.length,
          children: [],
          isDOK1Marker: false,
          isDOK2Marker: false,
          isDOK3Marker: false,
          isSourceMarker: false,
          isCategoryMarker: false,
          isPurposeMarker: false,
          extractedUrl: null,
        },
        nameHtml: '',
        noteHtml: '',
        nodeId: '',
      });
      // Reset element state (child <li> starts fresh)
      inNameDiv = false;
      inNoteSpan = false;
      inInnerContent = false;
    } else if (tagName === 'li' && isClosing) {
      const closed = stack.pop();
      if (closed) {
        const name = stripHtmlTags(closed.nameHtml);
        const note = closed.noteHtml ? stripHtmlTags(closed.noteHtml) : null;

        closed.node.id = closed.nodeId || closed.node.id;
        closed.node.name = name;
        closed.node.note = note;
        closed.node.extractedUrl = extractUrlFromHtml(closed.nameHtml + ' ' + (closed.noteHtml || ''));
        closed.node.isDOK1Marker = DOK1_PATTERN.test(name);
        closed.node.isDOK2Marker = DOK2_PATTERN.test(name);
        closed.node.isDOK3Marker = DOK3_PATTERN.test(name);
        closed.node.isSourceMarker = SOURCE_PATTERN.test(name);
        closed.node.isCategoryMarker = CATEGORY_PATTERN.test(name);
        closed.node.isPurposeMarker = PURPOSE_PATTERN.test(name);

        if (name) {
          const parent = stack[stack.length - 1];
          if (parent) {
            parent.node.children.push(closed.node);
          } else {
            roots.push(closed.node);
          }
        }
      }
      // Reset element state after closing
      inNameDiv = false;
      inNoteSpan = false;
      inInnerContent = false;
    } else if (tagName === 'div' && !isClosing && /class=["']name["']/.test(attrs)) {
      inNameDiv = true;
      if (frame) {
        const wfidMatch = attrs.match(/data-wfid=["']([^"']+)["']/);
        const chidMatch = attrs.match(/data-chid=["']([^"']+)["']/);
        frame.nodeId = wfidMatch?.[1] || chidMatch?.[1] || '';
      }
    } else if (tagName === 'div' && isClosing && inNameDiv) {
      inNameDiv = false;
      inInnerContent = false;
    } else if (tagName === 'span' && !isClosing && /class=["']note["']/.test(attrs)) {
      inNoteSpan = true;
    } else if (tagName === 'span' && isClosing && inNoteSpan && !inInnerContent) {
      inNoteSpan = false;
    } else if (tagName === 'span' && !isClosing && /class=["']innerContentContainer["']/.test(attrs)) {
      inInnerContent = true;
      innerContentDepth = 1;
    } else if (tagName === 'span' && isClosing && inInnerContent) {
      innerContentDepth--;
      if (innerContentDepth <= 0) {
        inInnerContent = false;
      }
    } else if (tagName === 'span' && !isClosing && inInnerContent) {
      innerContentDepth++;
    }

    // Collect text after this tag for active collectors
    if (frame && (isCollectingName() || isCollectingNote())) {
      const textStart = tagRegex.lastIndex;
      const nextTagIdx = htmlContent.indexOf('<', textStart);
      if (nextTagIdx > textStart) {
        const text = htmlContent.substring(textStart, nextTagIdx);
        if (text.trim()) {
          if (isCollectingName()) frame.nameHtml += text;
          else if (isCollectingNote()) frame.noteHtml += text;
        }
      }
    }

    // Capture href from <a> tags inside content areas
    if (tagName === 'a' && !isClosing && frame && (isCollectingName() || isCollectingNote())) {
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/);
      if (hrefMatch) {
        if (isCollectingName()) frame.nameHtml += ` ${hrefMatch[1]} `;
        else frame.noteHtml += ` ${hrefMatch[1]} `;
      }
    }
  }

  // Generate markdown matching the URL path's nodeToText format:
  // depth 0 → # heading, depth 1 → ## heading, depth 2+ → indented bullet
  function nodeToMarkdown(node: HierarchyNode, depth: number): string {
    let line: string;
    if (depth === 0) {
      line = `# ${node.name}`;
      if (node.note) line += `\n${node.note}`;
    } else if (depth === 1) {
      line = `## ${node.name}`;
      if (node.note) line += `\n${node.note}`;
    } else {
      const indent = '  '.repeat(depth - 2);
      line = `${indent}- ${node.name}`;
      if (node.note) line += `\n${indent}  ${node.note}`;
    }
    const childLines = node.children.map(c => nodeToMarkdown(c, depth + 1));
    return [line, ...childLines].join('\n');
  }

  const markdown = roots.map(n => nodeToMarkdown(n, 0)).join('\n');

  console.log(`[WorkFlowy Export Parser] Parsed ${roots.length} root nodes, ${markdown.length} chars markdown`);

  return { markdown, hierarchy: roots };
}

export function extractTextFromHTML(htmlContent: string): string {
  // Parse HTML and extract text, preserving ul/li hierarchy with indentation
  const lines: string[] = [];

  // Remove script and style tags first
  let cleaned = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Track nesting depth for lists and current text accumulator
  let listDepth = 0;
  let inListItem = false;
  let currentText = '';

  // Process the HTML looking for tags
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(cleaned)) !== null) {
    // Accumulate text before this tag
    const textBefore = cleaned.substring(lastIndex, match.index);
    if (textBefore.trim()) {
      currentText += ' ' + textBefore.trim();
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith('</');

    if (tagName === 'ul' || tagName === 'ol') {
      if (!isClosing) {
        listDepth++;
      } else {
        listDepth = Math.max(0, listDepth - 1);
      }
    } else if (tagName === 'li') {
      if (!isClosing) {
        // Starting a new list item - flush any previous accumulated text first
        if (currentText.trim() && inListItem) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = true;
      } else {
        // Closing list item - flush accumulated text
        if (currentText.trim()) {
          const indent = '  '.repeat(Math.max(0, listDepth - 1));
          lines.push(indent + '- ' + currentText.trim());
          currentText = '';
        }
        inListItem = false;
      }
    } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      // Block-level elements - flush text on close
      if (isClosing && currentText.trim()) {
        if (inListItem) {
          // Don't flush here, let </li> handle it
        } else {
          lines.push(currentText.trim());
          currentText = '';
        }
      }
    } else if (tagName === 'br') {
      // Line break - add space to current text
      currentText += ' ';
    }

    lastIndex = match.index + fullTag.length;
  }

  // Get any remaining text after last tag
  const remainingText = cleaned.substring(lastIndex).trim();
  if (remainingText) {
    currentText += ' ' + remainingText;
  }
  if (currentText.trim()) {
    lines.push(currentText.trim());
  }

  // Decode HTML entities and clean up
  return lines
    .map(line => line
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    )
    .filter(line => line.length > 0)
    .join('\n');
}
