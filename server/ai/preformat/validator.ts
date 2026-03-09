/**
 * Integrity Validation + Text Similarity Utilities
 *
 * Provides:
 * - normalizeText / jaccardSimilarity / findBestMatch (FR1)
 * - validateIntegrity (FR3)
 */

import type { HierarchyNode } from '@shared/hierarchy-types';
import type { MergedPreformatResult, ValidationReport } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// FR1: Text Similarity Utilities (stubs)
// ═══════════════════════════════════════════════════════════════════════════

export function normalizeText(_text: string): string[] {
  throw new Error('Not implemented');
}

export function jaccardSimilarity(_a: string, _b: string): number {
  throw new Error('Not implemented');
}

export function findBestMatch(_needle: string, _haystack: string[]): { match: string; score: number } {
  throw new Error('Not implemented');
}

// ═══════════════════════════════════════════════════════════════════════════
// FR3: Integrity Validation (stub)
// ═══════════════════════════════════════════════════════════════════════════

export function validateIntegrity(
  _original: HierarchyNode[],
  _merged: MergedPreformatResult,
): ValidationReport {
  throw new Error('Not implemented');
}
