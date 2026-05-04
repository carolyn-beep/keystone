/**
 * Tests for summarizeCriteria: emits human-readable labels for each
 * criterion code via labelForCriterion. Lookup is level-aware because
 * DOK3 and DOK4 share keys (notably P1) with different meanings.
 *
 * Pure-function tests; no DB.
 */

import { describe, it, expect } from 'vitest';
import { formatDOK1AssessmentItem, summarizeCriteria } from '../internal';

describe('formatDOK1AssessmentItem', () => {
  it('does not expose internal score 0 as a real score for non-gradeable facts', () => {
    expect(formatDOK1AssessmentItem({
      id: 26855,
      fact: 'Unsupported claim',
      source: 'Source',
      category: 'Architecture',
      score: 0,
      note: 'Non-gradeable from available evidence',
      isGradeable: false,
      gradingStatus: 'graded',
    })).toEqual(expect.objectContaining({
      score: null,
      rawScore: 0,
      isGradeable: false,
      scoreState: 'non_gradeable',
    }));
  });

  it('represents gradeable score-0 facts as pending instead of failed', () => {
    expect(formatDOK1AssessmentItem({
      id: 99,
      fact: 'Pending claim',
      source: null,
      category: null,
      score: 0,
      note: null,
      isGradeable: true,
      gradingStatus: 'grading',
    })).toEqual(expect.objectContaining({
      score: null,
      rawScore: 0,
      isGradeable: true,
      scoreState: 'pending',
    }));
  });

  it('preserves normal 1-5 scores as scored DOK1 results', () => {
    expect(formatDOK1AssessmentItem({
      id: 100,
      fact: 'Verified claim',
      source: 'Source',
      category: 'Architecture',
      score: 5,
      note: 'Verified',
      isGradeable: true,
      gradingStatus: 'graded',
    })).toEqual(expect.objectContaining({
      score: 5,
      rawScore: 5,
      isGradeable: true,
      scoreState: 'scored',
    }));
  });
});

describe('summarizeCriteria', () => {
  describe('DOK4 labeled output', () => {
    it('labels DOK4 v2 keys with human-readable names', () => {
      const breakdown = {
        S1: { assessment: 'strong', evidence: 'irrelevant' },
        S2: { assessment: 'partial', evidence: 'irrelevant' },
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toBe('S1 (Contested): strong; S2 (LLM Divergence): partial');
    });

    it('labels DOK4 P1 as Punchiness (not the DOK3 Adds Explanatory Power meaning)', () => {
      const breakdown = {
        P1: { assessment: 'weak', evidence: 'too long, paragraph-style' },
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toBe('P1 (Punchiness): weak');
    });

    it('annotates legacy DOK4 keys with [legacy]', () => {
      const breakdown = {
        S5: { assessment: 'partial', evidence: 'x' },
        O1: { assessment: 'weak', evidence: 'x' },
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toBe(
        'S5 (Cross-Domain Synthesis [legacy]): partial; O1 (Causal Reasoning [legacy]): weak',
      );
    });

    it('handles mixed v2 + legacy keys correctly', () => {
      const breakdown = {
        S1: { assessment: 'strong' },
        S5: { assessment: 'partial' },
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toContain('S1 (Contested): strong');
      expect(result).toContain('S5 (Cross-Domain Synthesis [legacy]): partial');
    });
  });

  describe('DOK3 labeled output', () => {
    it('labels DOK3 keys', () => {
      const breakdown = {
        V1: { assessment: 'strong', evidence: 'x' },
        C1: { assessment: 'partial', evidence: 'x' },
        P2: { assessment: 'weak', evidence: 'x' },
      };
      const result = summarizeCriteria(breakdown, 3);
      expect(result).toBe(
        'V1 (Framework Identifiable): strong; C1 (Evidence Supports): partial; P2 (Advances Purpose): weak',
      );
    });

    it('labels DOK3 P1 as Adds Explanatory Power (not the DOK4 Punchiness meaning)', () => {
      const breakdown = {
        P1: { assessment: 'strong', evidence: 'framework explains causal structure' },
      };
      const result = summarizeCriteria(breakdown, 3);
      expect(result).toBe('P1 (Adds Explanatory Power): strong');
    });
  });

  describe('graceful degradation', () => {
    it('passes unknown criterion codes through unchanged', () => {
      const breakdown = {
        Z9: { assessment: 'weak' },
      };
      expect(summarizeCriteria(breakdown, 4)).toBe('Z9: weak');
    });
  });

  describe('null / empty handling', () => {
    it('returns null for null breakdown', () => {
      expect(summarizeCriteria(null, 4)).toBeNull();
    });

    it('returns null for empty object', () => {
      expect(summarizeCriteria({}, 4)).toBeNull();
    });

    it('returns null when no entry has a non-empty assessment', () => {
      const breakdown = {
        S1: { assessment: '' },
        S2: { evidence: 'no assessment field' },
      };
      expect(summarizeCriteria(breakdown, 4)).toBeNull();
    });

    it('skips entries that are not objects', () => {
      const breakdown: Record<string, any> = {
        S1: { assessment: 'strong' },
        S2: 'not an object',
        S3: null,
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toBe('S1 (Contested): strong');
    });
  });

  describe('truncation', () => {
    it('truncates assessment values longer than 50 characters', () => {
      const longAssessment = 'a'.repeat(75);
      const breakdown = {
        S1: { assessment: longAssessment },
      };
      const result = summarizeCriteria(breakdown, 4);
      expect(result).toBe(`S1 (Contested): ${'a'.repeat(50)}`);
    });
  });
});
