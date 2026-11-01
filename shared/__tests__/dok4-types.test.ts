/**
 * Tests for FR2: DOK4 Shared Types
 *
 * Validates that all DOK4 type definitions, constants, and interfaces exist
 * and have the correct shape. These are compile-time + runtime checks.
 */

import { describe, it, expect } from 'vitest';
import {
  DOK4_STATUS,
  DOK4_REJECTION_CATEGORY,
  DOK4_BARRIER_TYPE,
  type DOK4Status,
  type DOK4RejectionCategory,
  type DOK4BarrierType,
  type DOK4CriterionResult,
  type DOK4CriteriaBreakdown,
  type DOK4AntimemeticAssessment,
  type DOK4SpovWithLinks,
  type DOK4GradeResult,
  type DOK4EvaluationContext,
} from '../dok4-types';

describe('DOK4 Shared Types', () => {
  describe('DOK4_STATUS', () => {
    it('has all 6 status values', () => {
      expect(DOK4_STATUS.PENDING_LINKING).toBe('pending_linking');
      expect(DOK4_STATUS.LINKED).toBe('linked');
      expect(DOK4_STATUS.GRADING).toBe('grading');
      expect(DOK4_STATUS.GRADED).toBe('graded');
      expect(DOK4_STATUS.REJECTED).toBe('rejected');
      expect(DOK4_STATUS.ERROR).toBe('error');
      expect(Object.keys(DOK4_STATUS)).toHaveLength(6);
    });

    it('values are assignable to DOK4Status type', () => {
      const status: DOK4Status = DOK4_STATUS.PENDING_LINKING;
      expect(status).toBe('pending_linking');
    });
  });

  describe('DOK4_REJECTION_CATEGORY', () => {
    it('has 3 rejection categories', () => {
      expect(DOK4_REJECTION_CATEGORY.NOT_A_CLAIM).toBe('not_a_claim');
      expect(DOK4_REJECTION_CATEGORY.DOK3_MISCLASSIFICATION).toBe('dok3_misclassification');
      expect(DOK4_REJECTION_CATEGORY.OPINION_WITHOUT_EVIDENCE).toBe('opinion_without_evidence');
      expect(Object.keys(DOK4_REJECTION_CATEGORY)).toHaveLength(3);
    });

    it('values are assignable to DOK4RejectionCategory type', () => {
      const cat: DOK4RejectionCategory = DOK4_REJECTION_CATEGORY.NOT_A_CLAIM;
      expect(cat).toBe('not_a_claim');
    });
  });

  describe('DOK4_BARRIER_TYPE', () => {
    it('has 3 barrier types', () => {
      expect(DOK4_BARRIER_TYPE.IMMUNITY).toBe('immunity');
      expect(DOK4_BARRIER_TYPE.LOW_TRANSMISSION).toBe('low_transmission');
      expect(DOK4_BARRIER_TYPE.HIGH_DRAG).toBe('high_drag');
      expect(Object.keys(DOK4_BARRIER_TYPE)).toHaveLength(3);
    });

    it('values are assignable to DOK4BarrierType type', () => {
      const barrier: DOK4BarrierType = DOK4_BARRIER_TYPE.IMMUNITY;
      expect(barrier).toBe('immunity');
    });
  });

  describe('DOK4CriteriaBreakdown', () => {
    it('has all 7 criteria keys (S1-S5, O1, O2)', () => {
      const breakdown: DOK4CriteriaBreakdown = {
        S1: { assessment: 'strong', evidence: 'Contested topic' },
        S2: { assessment: 'partial', evidence: 'Some divergence' },
        S3: { assessment: 'strong', evidence: 'Well grounded' },
        S4: { assessment: 'strong', evidence: 'Clear position' },
        S5: { assessment: 'weak', evidence: 'Limited synthesis' },
        O1: { assessment: 'partial', evidence: 'Some causal reasoning' },
        O2: { assessment: 'strong', evidence: 'Distinct voice' },
      };

      expect(Object.keys(breakdown)).toHaveLength(7);
      expect(breakdown.S1.assessment).toBe('strong');
      expect(breakdown.O1.evidence).toBe('Some causal reasoning');
    });
  });

  describe('DOK4SpovWithLinks', () => {
    it('includes linkedDok3InsightIds and primaryDok3InsightId fields', () => {
      const spov: DOK4SpovWithLinks = {
        id: 1,
        brainliftId: 1,
        text: 'Test SPOV',
        workflowyNodeId: null,
        status: 'pending_linking',
        rejectionReason: null,
        rejectionCategory: null,
        foundationIntegrityIndex: null,
        dok1FoundationScore: null,
        dok2FoundationScore: null,
        dok3FoundationScore: null,
        foundationCeiling: null,
        traceabilityFlagged: false,
        traceabilityFlaggedSource: null,
        traceabilityOverlapSummary: null,
        divergenceQuestion: null,
        divergenceVanillaResponse: null,
        qualityScoreRaw: null,
        score: null,
        positionSummary: null,
        frameworkDependency: null,
        keyEvidence: null,
        vulnerabilityPoints: null,
        criteriaBreakdown: null,
        rationale: null,
        feedback: null,
        antimemeticAssessment: null,
        evaluatorModel: null,
        gradedAt: null,
        createdAt: '2026-03-03T00:00:00Z',
        linkedDok3InsightIds: [1, 2, 3],
        primaryDok3InsightId: 1,
      };

      expect(spov.linkedDok3InsightIds).toEqual([1, 2, 3]);
      expect(spov.primaryDok3InsightId).toBe(1);
    });
  });

  describe('DOK4GradeResult', () => {
    it('includes all grading output fields', () => {
      const result: DOK4GradeResult = {
        foundationIntegrityIndex: 3.5,
        dok1FoundationScore: 4.0,
        dok2FoundationScore: 3.2,
        dok3FoundationScore: 3.8,
        foundationCeiling: 4,
        traceabilityFlagged: false,
        traceabilityFlaggedSource: null,
        traceabilityOverlapSummary: null,
        divergenceQuestion: 'Is AI consciousness possible?',
        divergenceVanillaResponse: 'Generic response...',
        qualityScoreRaw: 4,
        score: 4,
        positionSummary: 'Strong position on AI ethics',
        frameworkDependency: 'Builds on ethical framework',
        keyEvidence: ['Evidence 1', 'Evidence 2'],
        criteriaBreakdown: {
          S1: { assessment: 'strong', evidence: 'e' },
          S4: { assessment: 'strong', evidence: 'e' },
          P1: { assessment: 'strong', evidence: 'e' },
          S2: { assessment: 'strong', evidence: 'e' },
          S3: { assessment: 'strong', evidence: 'e' },
          O2: { assessment: 'strong', evidence: 'e' },
        },
        rationale: 'Well reasoned SPOV',
        feedback: 'Good work',
        antimemeticAssessment: null,
        evaluatorModel: 'claude-3-5-sonnet-20241022',
      };

      expect(result.qualityScoreRaw).toBe(4);
      expect(result.score).toBe(4);
      expect(result.foundationCeiling).toBe(4);
      expect(result.keyEvidence).toHaveLength(2);
    });
  });

  describe('DOK4EvaluationContext', () => {
    it('includes all grading input fields', () => {
      const context: DOK4EvaluationContext = {
        brainliftPurpose: 'Test purpose',
        spovText: 'My spiky point of view...',
        primaryDok3: {
          id: 1,
          text: 'Cross-source insight',
          score: 4,
          frameworkName: 'Ethical Framework',
          frameworkDescription: 'Description of framework',
        },
        additionalDok3s: [{ id: 2, text: 'Another insight', score: 3 }],
        linkedDok2s: [{
          id: 1,
          sourceName: 'Source A',
          sourceUrl: 'https://example.com',
          grade: 4,
          points: ['Point 1'],
          dok1Facts: [{
            id: 1,
            fact: 'A fact',
            score: 5,
            source: 'Source A',
          }],
        }],
        sourceEvidence: [{
          sourceName: 'Source A',
          sourceUrl: 'https://example.com',
          content: 'Evidence text',
        }],
        foundationIndex: 3.5,
        foundationCeiling: 4,
        dok1FoundationScore: 4.0,
        dok2FoundationScore: 3.2,
        dok3FoundationScore: 3.8,
        traceabilityResult: null,
        divergenceResult: null,
      };

      expect(context.primaryDok3.id).toBe(1);
      expect(context.linkedDok2s).toHaveLength(1);
      expect(context.foundationIndex).toBe(3.5);
    });
  });
});
