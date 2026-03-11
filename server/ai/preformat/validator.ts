/**
 * Integrity Validation + Text Similarity Utilities
 *
 * Provides:
 * - normalizeText / jaccardSimilarity / findBestMatch (FR1)
 * - validateIntegrity (FR3)
 *
 * All checks are programmatic -- no LLM calls.
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type { MergedPreformatResult, ValidationReport } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const SIMILARITY_THRESHOLD_DUPLICATE = 0.9;
const SIMILARITY_THRESHOLD_HALLUCINATION = 0.7;
const SIMILARITY_THRESHOLD_CONTENT_LOSS = 0.6;
const MIN_TEXT_LENGTH_FOR_LOSS_CHECK = 10;
const MAX_CONTENT_LOSS_PERCENT = 10;
const MAX_HALLUCINATION_PERCENT = 5;

/** Template instruction patterns to exclude from content loss calculation */
const TEMPLATE_PATTERNS: RegExp[] = [
  /^what (are|is) /i,
  /^creating lists of /i,
  /^how to /i,
  /instructions?:/i,
  /^template/i,
];

/** Workflowy artifact patterns to exclude from content loss calculation */
const ARTIFACT_PATTERNS: RegExp[] = [
  /^\d+\s*backlinks?$/i,
  /workflowy\.com\/#\//i,
];

/** Structural marker names that are labels, not content */
const STRUCTURAL_MARKER_PATTERNS: RegExp[] = [
  /^owner$/i,
  /^purpose$/i,
  /^experts?$/i,
  /^(DOK\s*[1-4])/i,
  /^(knowledge\s*tree|KT)$/i,
  /^(SPOVs?|Spiky\s*POVs?)$/i,
  /^insights?$/i,
  /^(category\s*\d*)/i,
  /^(source|link to source)/i,
  /^(out of scope)/i,
  /^(who|focus|why follow|where):/i,
  /^(DOK[1-4]\s*-\s*(facts?|summary|insights?|SPOV))/i,
  /^scratchpad$/i,
  /^links$/i,
];

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Text Similarity Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize text for comparison: lowercase, strip punctuation, split into word tokens.
 */
export function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Jaccard similarity index on normalized word sets.
 * Returns 0.0 to 1.0.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = normalizeText(a);
  const wordsB = normalizeText(b);

  if (wordsA.length === 0 && wordsB.length === 0) return 0.0;
  if (wordsA.length === 0 || wordsB.length === 0) return 0.0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let intersection = 0;
  setA.forEach(word => {
    if (setB.has(word)) intersection++;
  });

  // Compute union size: |A| + |B| - |A ∩ B|
  const unionSize = setA.size + setB.size - intersection;
  return intersection / unionSize;
}

/**
 * Strip markdown link syntax: [text](url) → text url
 * Prevents token merging when normalizeText strips punctuation.
 */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 $2');
}

/**
 * Check if all words in `subset` appear in `superset` (normalized).
 * Handles cases like "Kenda Laney" being a subset of "Expert #2 - Kenda Laney".
 */
function isWordSubset(subset: string, superset: string): boolean {
  const subWords = normalizeText(subset);
  const superWords = new Set(normalizeText(superset));
  if (subWords.length === 0) return false;
  return subWords.every(w => superWords.has(w));
}

/**
 * Check if the normalized `needle` is contained as a substring in `candidate`
 * (case-insensitive). Handles URLs and markdown links.
 */
function isSubstringMatch(needle: string, candidate: string): boolean {
  const a = needle.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();
  return b.includes(a) || a.includes(b);
}

/**
 * Find the best fuzzy match for `needle` in `haystack`.
 * Uses Jaccard similarity as primary metric, with markdown-aware Jaccard,
 * word-subset, and substring containment as fallbacks.
 *
 * Returns the best-matching string and its score (0.0 to 1.0).
 */
export function findBestMatch(
  needle: string,
  haystack: string[],
): { match: string; score: number } {
  if (haystack.length === 0) return { match: '', score: 0.0 };

  let bestMatch = '';
  let bestScore = 0.0;

  for (const candidate of haystack) {
    // Primary: Jaccard similarity
    let score = jaccardSimilarity(needle, candidate);

    // Fallback 1: Jaccard on markdown-stripped versions.
    // [text](url) normalizes to merged tokens; stripping markdown first fixes this.
    if (score < 0.7) {
      const mdScore = jaccardSimilarity(stripMarkdownLinks(needle), stripMarkdownLinks(candidate));
      score = Math.max(score, mdScore);
    }

    // Fallback 2: word-subset check
    // (e.g., "Kenda Laney" ⊂ "Expert #2 - Kenda Laney")
    if (score < 0.7 && (isWordSubset(needle, candidate) || isWordSubset(candidate, needle))) {
      score = Math.max(score, 0.85);
    }

    // Fallback 3: substring containment for URLs and short strings
    // (e.g., "https://foo.com" ⊂ "Find her: https://foo.com")
    if (score < 0.7 && isSubstringMatch(needle, candidate)) {
      score = Math.max(score, 0.8);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return { match: bestMatch, score: bestScore };
}

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Integrity Validation
// ═══════════════════════════════════════════════════════════════════════════

/** Check if a text matches a template instruction pattern */
function isTemplateInstruction(text: string): boolean {
  return TEMPLATE_PATTERNS.some(p => p.test(text));
}

/** Check if a text matches a Workflowy artifact pattern */
function isWorkflowyArtifact(text: string): boolean {
  return ARTIFACT_PATTERNS.some(p => p.test(text));
}

/** Check if a text is a structural marker (not content) */
function isStructuralMarker(text: string): boolean {
  return STRUCTURAL_MARKER_PATTERNS.some(p => p.test(text));
}

/** Check if a text should be excluded from content loss calculation */
function shouldExcludeFromLossCheck(text: string): boolean {
  if (text.length < MIN_TEXT_LENGTH_FOR_LOSS_CHECK) return true;
  if (isTemplateInstruction(text)) return true;
  if (isWorkflowyArtifact(text)) return true;
  if (isStructuralMarker(text)) return true;
  return false;
}

/** Flatten all text from a HierarchyNode[] tree */
function flattenOriginalTexts(nodes: HierarchyNode[]): string[] {
  const texts: string[] = [];
  function walk(node: HierarchyNode) {
    if (node.name && node.name.trim().length > 0) {
      texts.push(node.name.trim());
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const node of nodes) {
    walk(node);
  }
  return texts;
}

/** Recursively flatten all text from a HierarchyNode[] tree */
function flattenNodes(nodes: HierarchyNode[]): string[] {
  const texts: string[] = [];
  const walk = (nodeList: HierarchyNode[]) => {
    for (const n of nodeList) {
      if (n.name && n.name.trim().length > 0) texts.push(n.name.trim());
      walk(n.children);
    }
  };
  walk(nodes);
  return texts;
}

/** Flatten all text from a MergedPreformatResult */
function flattenOutputTexts(merged: MergedPreformatResult): string[] {
  const texts: string[] = [];

  // Owner
  if (merged.owner) texts.push(merged.owner.name);

  // Purpose — walk parsedNodes
  texts.push(...flattenNodes(merged.purposeNodes));

  // Experts — walk parsedNodes
  texts.push(...flattenNodes(merged.expertNodes));

  // SPOVs — walk parsedNodes
  texts.push(...flattenNodes(merged.spovNodes));

  // Insights — walk parsedNodes
  texts.push(...flattenNodes(merged.insightNodes));

  // Categories: flatten all text from parsedNodes
  for (const cat of merged.categories) {
    if (cat.parsedNodes) {
      texts.push(...flattenNodes(cat.parsedNodes));
    }
  }

  // Scratchpad — walk parsedNodes
  texts.push(...flattenNodes(merged.scratchpadNodes));

  return texts.filter(t => t && t.trim().length > 0);
}

/**
 * Validate integrity of merged results against the original tree.
 *
 * Three checks:
 * 1. No-hallucination: every output text must match an original text
 * 2. No-content-loss: every meaningful original text must appear in output
 * 3. No-duplicates: no near-identical items within output lists
 */
export function validateIntegrity(
  original: HierarchyNode[],
  merged: MergedPreformatResult,
  bypassedScratchpad: HierarchyNode[] = [],
): ValidationReport {
  const originalTexts = flattenOriginalTexts(original);
  const outputTexts = flattenOutputTexts(merged);

  // Include bypassed scratchpad text in output set — these nodes were copied
  // verbatim so they should count as "accounted for" in both directions
  const bypassedTexts = bypassedScratchpad.flatMap(n => flattenOriginalTexts([n]));
  outputTexts.push(...bypassedTexts);

  const warnings: string[] = [];
  const possibleHallucinations: string[] = [];
  const missingFromOutput: string[] = [];
  const duplicatePairs: Array<[string, string]> = [];

  // ── Check 1: No-hallucination ──────────────────────────────────
  // For each output text, find best match in original.
  // Skip structural markers that the LLM was instructed to create
  // (DOK markers, Source: prefixes, link to source, Scratchpad labels).
  for (const text of outputTexts) {
    if (text.trim().length < MIN_TEXT_LENGTH_FOR_LOSS_CHECK) continue;
    if (isStructuralMarker(text)) continue;
    // "Source: X" — check if X (without prefix) matches the original
    const sourceMatch = text.match(/^Source:\s*(.+)/i);
    if (sourceMatch) {
      const sourceName = sourceMatch[1].trim();
      const { score } = findBestMatch(sourceName, originalTexts);
      if (score >= SIMILARITY_THRESHOLD_HALLUCINATION) continue;
    }
    const { score } = findBestMatch(text, originalTexts);
    if (score < SIMILARITY_THRESHOLD_HALLUCINATION) {
      possibleHallucinations.push(text);
    }
  }

  // ── Check 2: No-content-loss ───────────────────────────────────
  // For each original text (meaningful, not excluded), find best match in output
  const checkableOriginals = originalTexts.filter(t => !shouldExcludeFromLossCheck(t));
  for (const text of checkableOriginals) {
    const { score } = findBestMatch(text, outputTexts);
    if (score < SIMILARITY_THRESHOLD_CONTENT_LOSS) {
      missingFromOutput.push(text);
    }
  }

  const contentLossPercent = checkableOriginals.length > 0
    ? (missingFromOutput.length / checkableOriginals.length) * 100
    : 0;

  // ── Check 3: No-duplicates ─────────────────────────────────────
  // Check for duplicates in insight and SPOV parsedNodes text
  const insightTexts = flattenNodes(merged.insightNodes);
  if (insightTexts.length > 1) {
    for (let i = 0; i < insightTexts.length; i++) {
      for (let j = i + 1; j < insightTexts.length; j++) {
        const score = jaccardSimilarity(insightTexts[i], insightTexts[j]);
        if (score >= SIMILARITY_THRESHOLD_DUPLICATE) {
          duplicatePairs.push([insightTexts[i], insightTexts[j]]);
        }
      }
    }
  }

  const spovTexts = flattenNodes(merged.spovNodes);
  if (spovTexts.length > 1) {
    for (let i = 0; i < spovTexts.length; i++) {
      for (let j = i + 1; j < spovTexts.length; j++) {
        const score = jaccardSimilarity(spovTexts[i], spovTexts[j]);
        if (score >= SIMILARITY_THRESHOLD_DUPLICATE) {
          duplicatePairs.push([spovTexts[i], spovTexts[j]]);
        }
      }
    }
  }

  // ── Determine pass/fail ────────────────────────────────────────
  const hallucinationCount = possibleHallucinations.length;
  const duplicateCount = duplicatePairs.length;
  const hallucinationPercent = originalTexts.length > 0
    ? (hallucinationCount / originalTexts.length) * 100
    : 0;
  const passed = hallucinationPercent <= MAX_HALLUCINATION_PERCENT && contentLossPercent <= MAX_CONTENT_LOSS_PERCENT;

  if (hallucinationCount > 0) {
    warnings.push(`${hallucinationCount} possible hallucination(s) detected`);
  }
  if (contentLossPercent > 0) {
    warnings.push(`Content loss: ${contentLossPercent.toFixed(1)}%`);
  }
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} near-duplicate pair(s) in output`);
  }

  return {
    passed,
    contentLossPercent,
    hallucinationCount,
    duplicateCount,
    warnings,
    details: {
      missingFromOutput,
      possibleHallucinations,
      duplicatePairs,
    },
  };
}
