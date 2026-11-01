/**
 * Tests for FR1: Database Schema (Drizzle table definitions)
 *
 * Validates that the Drizzle table definitions exist with correct columns,
 * constraints, and type exports. These are compile-time verifiable but we
 * also check runtime properties of the table objects.
 */

import { describe, it, expect } from 'vitest';
import {
  dok4Spovs,
  dok4Dok3Links,
  DOK4_SPOV_STATUS,
  type DOK4SpovStatus,
} from '../schema';

describe('DOK4 Database Schema', () => {
  describe('dok4Spovs table', () => {
    it('has all expected columns', () => {
      const columns = Object.keys(dok4Spovs);
      // Core columns
      expect(columns).toContain('id');
      expect(columns).toContain('brainliftId');
      expect(columns).toContain('text');
      expect(columns).toContain('workflowyNodeId');
      expect(columns).toContain('status');

      // Rejection columns
      expect(columns).toContain('rejectionReason');
      expect(columns).toContain('rejectionCategory');

      // Foundation columns
      expect(columns).toContain('foundationIntegrityIndex');
      expect(columns).toContain('dok1FoundationScore');
      expect(columns).toContain('dok2FoundationScore');
      expect(columns).toContain('dok3FoundationScore');
      expect(columns).toContain('foundationCeiling');

      // Traceability columns
      expect(columns).toContain('traceabilityFlagged');
      expect(columns).toContain('traceabilityFlaggedSource');
      expect(columns).toContain('traceabilityOverlapSummary');

      // Divergence columns
      expect(columns).toContain('divergenceQuestion');
      expect(columns).toContain('divergenceVanillaResponse');

      // Quality columns
      expect(columns).toContain('qualityScoreRaw');
      expect(columns).toContain('score');
      expect(columns).toContain('positionSummary');
      expect(columns).toContain('frameworkDependency');
      expect(columns).toContain('keyEvidence');
      expect(columns).toContain('vulnerabilityPoints');
      expect(columns).toContain('criteriaBreakdown');
      expect(columns).toContain('rationale');
      expect(columns).toContain('feedback');

      // Antimemetic
      expect(columns).toContain('antimemeticAssessment');

      // Metadata
      expect(columns).toContain('evaluatorModel');
      expect(columns).toContain('gradedAt');
      expect(columns).toContain('createdAt');
    });
  });

  describe('dok4Dok3Links table', () => {
    it('has spov_id, dok3_insight_id, is_primary columns', () => {
      const columns = Object.keys(dok4Dok3Links);
      expect(columns).toContain('id');
      expect(columns).toContain('spovId');
      expect(columns).toContain('dok3InsightId');
      expect(columns).toContain('isPrimary');
    });
  });

  describe('DOK4_SPOV_STATUS', () => {
    it('has all 6 status values matching DOK4_STATUS', () => {
      expect(DOK4_SPOV_STATUS.PENDING_LINKING).toBe('pending_linking');
      expect(DOK4_SPOV_STATUS.LINKED).toBe('linked');
      expect(DOK4_SPOV_STATUS.GRADING).toBe('grading');
      expect(DOK4_SPOV_STATUS.GRADED).toBe('graded');
      expect(DOK4_SPOV_STATUS.REJECTED).toBe('rejected');
      expect(DOK4_SPOV_STATUS.ERROR).toBe('error');
      expect(Object.keys(DOK4_SPOV_STATUS)).toHaveLength(6);
    });

    it('type DOK4SpovStatus is assignable', () => {
      const status: DOK4SpovStatus = DOK4_SPOV_STATUS.PENDING_LINKING;
      expect(status).toBe('pending_linking');
    });
  });
});
