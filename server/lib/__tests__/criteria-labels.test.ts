/**
 * Tests for the criterion-label module: maps (dokLevel, criterion code) to
 * human-readable names for inclusion in the assessment API's criteriaSummary.
 *
 * Lookup is level-aware because DOK3 and DOK4 share keys with different
 * meanings (notably P1: DOK3 "Adds Explanatory Power" vs DOK4 v2 "Punchiness").
 */

import { describe, it, expect } from 'vitest';
import { CRITERIA_LABELS_BY_LEVEL, labelForCriterion } from '../criteria-labels';

describe('labelForCriterion', () => {
  describe('DOK4 v2 criteria', () => {
    it('labels S1 with the Contested name', () => {
      expect(labelForCriterion('S1', 4)).toBe('S1 (Contested)');
    });

    it('labels S4 with the Clear Side name', () => {
      expect(labelForCriterion('S4', 4)).toBe('S4 (Clear Side)');
    });

    it('labels P1 with the Punchiness name (DOK4 v2)', () => {
      expect(labelForCriterion('P1', 4)).toBe('P1 (Punchiness)');
    });

    it('labels S2 with the LLM Divergence name', () => {
      expect(labelForCriterion('S2', 4)).toBe('S2 (LLM Divergence)');
    });

    it('labels S3 with the Grounded & Traceable name', () => {
      expect(labelForCriterion('S3', 4)).toBe('S3 (Grounded & Traceable)');
    });

    it('labels O2 with the Distinct Voice name', () => {
      expect(labelForCriterion('O2', 4)).toBe('O2 (Distinct Voice)');
    });
  });

  describe('DOK4 legacy (v1) criteria', () => {
    it('annotates S5 as legacy', () => {
      expect(labelForCriterion('S5', 4)).toBe('S5 (Cross-Domain Synthesis [legacy])');
    });

    it('annotates O1 as legacy', () => {
      expect(labelForCriterion('O1', 4)).toBe('O1 (Causal Reasoning [legacy])');
    });
  });

  describe('DOK3 criteria', () => {
    it('labels V1', () => {
      expect(labelForCriterion('V1', 3)).toBe('V1 (Framework Identifiable)');
    });

    it('labels V2', () => {
      expect(labelForCriterion('V2', 3)).toBe('V2 (Framework Distinct)');
    });

    it('labels V3', () => {
      expect(labelForCriterion('V3', 3)).toBe('V3 (Framework Domain-Specific)');
    });

    it('labels C1', () => {
      expect(labelForCriterion('C1', 3)).toBe('C1 (Evidence Supports)');
    });

    it('labels C2', () => {
      expect(labelForCriterion('C2', 3)).toBe('C2 (Internally Consistent)');
    });

    it('labels P1 with the DOK3 explanatory-power name', () => {
      expect(labelForCriterion('P1', 3)).toBe('P1 (Adds Explanatory Power)');
    });

    it('labels P2', () => {
      expect(labelForCriterion('P2', 3)).toBe('P2 (Advances Purpose)');
    });
  });

  describe('P1 collision disambiguation', () => {
    it('renders DOK3 P1 and DOK4 P1 with different names', () => {
      const dok3 = labelForCriterion('P1', 3);
      const dok4 = labelForCriterion('P1', 4);
      expect(dok3).toBe('P1 (Adds Explanatory Power)');
      expect(dok4).toBe('P1 (Punchiness)');
      expect(dok3).not.toBe(dok4);
    });
  });

  describe('graceful degradation', () => {
    it('returns the raw key for an unknown code', () => {
      expect(labelForCriterion('X9', 4)).toBe('X9');
    });

    it('returns the raw key when a DOK3 code is queried at DOK4 level', () => {
      // V1 lives only under level 3; DOK4 lookup falls through to raw key.
      expect(labelForCriterion('V1', 4)).toBe('V1');
    });

    it('returns the raw key when a DOK4-only code is queried at DOK3 level', () => {
      // S1 lives only under level 4; DOK3 lookup falls through to raw key.
      expect(labelForCriterion('S1', 3)).toBe('S1');
    });

    it('returns an empty string when given an empty string', () => {
      expect(labelForCriterion('', 4)).toBe('');
    });

    it('returns the raw key for unmapped lowercase variants', () => {
      // case-sensitive lookup; lowercase 's1' is not in the map
      expect(labelForCriterion('s1', 4)).toBe('s1');
    });
  });

  describe('CRITERIA_LABELS_BY_LEVEL map', () => {
    it('marks legacy DOK4 criteria with isLegacy=true', () => {
      expect(CRITERIA_LABELS_BY_LEVEL[4].S5?.isLegacy).toBe(true);
      expect(CRITERIA_LABELS_BY_LEVEL[4].O1?.isLegacy).toBe(true);
    });

    it('does not mark v2 DOK4 criteria as legacy', () => {
      expect(CRITERIA_LABELS_BY_LEVEL[4].S1?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[4].S4?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[4].P1?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[4].S2?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[4].S3?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[4].O2?.isLegacy).toBeFalsy();
    });

    it('does not mark DOK3 criteria as legacy', () => {
      expect(CRITERIA_LABELS_BY_LEVEL[3].V1?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].V2?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].V3?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].C1?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].C2?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].P1?.isLegacy).toBeFalsy();
      expect(CRITERIA_LABELS_BY_LEVEL[3].P2?.isLegacy).toBeFalsy();
    });
  });
});
