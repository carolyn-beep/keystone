/**
 * Human-readable names for DOK3 and DOK4 criterion codes.
 *
 * Used by `summarizeCriteria` (server/storage/internal.ts) to render the
 * `criteriaSummary` field of the internal assessment API in a form that lets
 * agents connect a low score to a concrete revision direction (e.g. low DOK4
 * P1 => shorten the SPOV).
 *
 * Lookup is keyed on (dokLevel, criterion code). DOK3 and DOK4 use overlapping
 * keys (notably both register P1, with different meanings: DOK3 P1 = "Adds
 * Explanatory Power", DOK4 P1 = "Punchiness"), so a flat single-map lookup
 * would mislabel half the SPOVs in the system. Always pass dokLevel.
 *
 * Legacy DOK4 v1 criteria (S5, O1) are kept under level 4 so historical SPOVs
 * continue to render. They are annotated `[legacy]` so agents do not waste
 * cycles trying to improve scores against a removed criterion.
 *
 * Frontend has its own labels (`DOK4_CRITERIA_AXES` in DOK4Tab.tsx); the MCP
 * defines its own labels (separate repo, spec 09). Server-only helper here.
 */

export interface CriterionLabel {
  name: string;
  isLegacy?: boolean;
}

export type LabelDokLevel = 3 | 4;

export const CRITERIA_LABELS_BY_LEVEL: Record<LabelDokLevel, Record<string, CriterionLabel>> = {
  3: {
    // Framework Visibility
    V1: { name: 'Framework Identifiable' },
    V2: { name: 'Framework Distinct' },
    V3: { name: 'Framework Domain-Specific' },
    // Framework Coherence
    C1: { name: 'Evidence Supports' },
    C2: { name: 'Internally Consistent' },
    // Framework Productivity
    P1: { name: 'Adds Explanatory Power' },
    P2: { name: 'Advances Purpose' },
  },
  4: {
    // v2 Spikiness (form)
    S1: { name: 'Contested' },
    S4: { name: 'Clear Side' },
    P1: { name: 'Punchiness' },
    // v2 Ownership (authenticity)
    S2: { name: 'LLM Divergence' },
    S3: { name: 'Grounded & Traceable' },
    O2: { name: 'Distinct Voice' },
    // v1 legacy
    S5: { name: 'Cross-Domain Synthesis', isLegacy: true },
    O1: { name: 'Causal Reasoning', isLegacy: true },
  },
};

/**
 * Render `<KEY> (<Name>)` for known criteria, with `[legacy]` suffix for
 * deprecated v1 codes. Returns the raw key unchanged when unknown so callers
 * do not need to special-case unmapped codes (forward-compatible if a new
 * criterion lands before this map is updated).
 *
 * dokLevel is required because DOK3 and DOK4 share keys with different
 * meanings (e.g. P1).
 */
export function labelForCriterion(key: string, dokLevel: LabelDokLevel): string {
  const entry = CRITERIA_LABELS_BY_LEVEL[dokLevel]?.[key];
  if (!entry) return key;
  return entry.isLegacy ? `${key} (${entry.name} [legacy])` : `${key} (${entry.name})`;
}
