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
 * Find the best fuzzy match for `needle` in `haystack`.
 * Returns the best-matching string and its Jaccard score.
 */
export function findBestMatch(
  needle: string,
  haystack: string[],
): { match: string; score: number } {
  if (haystack.length === 0) return { match: '', score: 0.0 };

  let bestMatch = '';
  let bestScore = 0.0;

  for (const candidate of haystack) {
    const score = jaccardSimilarity(needle, candidate);
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

/** Flatten all text from a MergedPreformatResult */
function flattenOutputTexts(merged: MergedPreformatResult): string[] {
  const texts: string[] = [];

  // Owner
  if (merged.owner) texts.push(merged.owner.name);

  // Purpose
  if (merged.purpose) {
    texts.push(merged.purpose.purpose);
    for (const oos of merged.purpose.outOfScope) texts.push(oos);
  }

  // Experts -- include field values with their label prefix to match original tree format
  for (const expert of merged.experts) {
    texts.push(expert.name);
    texts.push(`Who: ${expert.who}`);
    texts.push(`Focus: ${expert.focus}`);
    texts.push(`Why Follow: ${expert.whyFollow}`);
    texts.push(`Where: ${expert.where}`);
  }

  // SPOVs
  for (const spov of merged.spovs) {
    texts.push(spov.text);
  }

  // Insights
  for (const insight of merged.insights) {
    texts.push(insight.text);
  }

  // Categories: facts and summaries
  for (const cat of merged.categories) {
    for (const src of cat.sources) {
      for (const fact of src.facts) texts.push(fact);
      for (const sum of src.summary) texts.push(sum);
    }
  }

  // Scratchpad
  for (const note of merged.scratchpad) {
    texts.push(note);
  }

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
): ValidationReport {
  const originalTexts = flattenOriginalTexts(original);
  const outputTexts = flattenOutputTexts(merged);

  const warnings: string[] = [];
  const possibleHallucinations: string[] = [];
  const missingFromOutput: string[] = [];
  const duplicatePairs: Array<[string, string]> = [];

  // ── Check 1: No-hallucination ──────────────────────────────────
  // For each output text, find best match in original
  for (const text of outputTexts) {
    if (text.trim().length < MIN_TEXT_LENGTH_FOR_LOSS_CHECK) continue;
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
  // Pairwise within each output list
  const listsToCheck: string[][] = [];

  // Facts per source
  for (const cat of merged.categories) {
    for (const src of cat.sources) {
      if (src.facts.length > 1) listsToCheck.push(src.facts);
    }
  }

  // Insights
  if (merged.insights.length > 1) {
    listsToCheck.push(merged.insights.map(i => i.text));
  }

  // SPOVs
  if (merged.spovs.length > 1) {
    listsToCheck.push(merged.spovs.map(s => s.text));
  }

  for (const list of listsToCheck) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const score = jaccardSimilarity(list[i], list[j]);
        if (score >= SIMILARITY_THRESHOLD_DUPLICATE) {
          duplicatePairs.push([list[i], list[j]]);
        }
      }
    }
  }

  // ── Determine pass/fail ────────────────────────────────────────
  const hallucinationCount = possibleHallucinations.length;
  const duplicateCount = duplicatePairs.length;
  const passed = hallucinationCount === 0 && contentLossPercent <= MAX_CONTENT_LOSS_PERCENT;

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
