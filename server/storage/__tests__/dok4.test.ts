/**
 * Tests for FR3: DOK4 Storage CRUD Functions
 *
 * Tests storage functions against a real local database (Docker Postgres).
 * Uses transactions with rollback for test isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import { brainlifts, dok3Insights, dok4Spovs, dok4Dok3Links } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import {
  saveDOK4Spovs,
  getDOK4Spovs,
  linkDOK4Spov,
  updateDOK4SpovStatus,
  saveDOK4Rejection,
  saveDOK4GradeResult,
  getDOK4MeanScore,
} from '../dok4';
import type { DOK4GradeResult } from '@shared/dok4-types';

// Test fixtures
let testBrainliftId: number;
let testBrainliftId2: number;
let testDok3InsightId1: number;
let testDok3InsightId2: number;

beforeAll(async () => {
  // Create test brainlifts (summary is NOT NULL)
  const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };
  const [bl1] = await db.insert(brainlifts).values({
    title: 'DOK4 Test Brainlift',
    slug: 'dok4-test-' + Date.now(),
    description: 'Test brainlift for DOK4 storage tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl1.id;

  const [bl2] = await db.insert(brainlifts).values({
    title: 'DOK4 Test Brainlift 2',
    slug: 'dok4-test-2-' + Date.now(),
    description: 'Second test brainlift for IDOR tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId2 = bl2.id;

  // Create test DOK3 insights for linking
  const [i1] = await db.insert(dok3Insights).values({
    brainliftId: testBrainliftId,
    text: 'Test DOK3 insight 1',
    status: 'graded',
    score: 4,
  }).returning({ id: dok3Insights.id });
  testDok3InsightId1 = i1.id;

  const [i2] = await db.insert(dok3Insights).values({
    brainliftId: testBrainliftId,
    text: 'Test DOK3 insight 2',
    status: 'graded',
    score: 3,
  }).returning({ id: dok3Insights.id });
  testDok3InsightId2 = i2.id;
});

afterAll(async () => {
  // Clean up test data (cascading deletes handle children)
  await db.delete(brainlifts).where(eq(brainlifts.id, testBrainliftId));
  await db.delete(brainlifts).where(eq(brainlifts.id, testBrainliftId2));
});

beforeEach(async () => {
  // Clean dok4 data before each test (fresh state)
  await db.delete(dok4Spovs).where(eq(dok4Spovs.brainliftId, testBrainliftId));
  await db.delete(dok4Spovs).where(eq(dok4Spovs.brainliftId, testBrainliftId2));
});


describe('saveDOK4Spovs', () => {
  it('saves array of SPOVs with pending_linking status and returns IDs', async () => {
    const ids = await saveDOK4Spovs(testBrainliftId, [
      { text: 'SPOV 1' },
      { text: 'SPOV 2', workflowyNodeId: 'node-123' },
    ]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeGreaterThan(0);
    expect(ids[1]).toBeGreaterThan(0);

    // Verify status is pending_linking
    const spovs = await db.select().from(dok4Spovs).where(eq(dok4Spovs.brainliftId, testBrainliftId));
    expect(spovs).toHaveLength(2);
    expect(spovs[0].status).toBe('pending_linking');
    expect(spovs[1].status).toBe('pending_linking');
  });

  it('returns empty array with no inserts for empty input', async () => {
    const ids = await saveDOK4Spovs(testBrainliftId, []);
    expect(ids).toEqual([]);

    const spovs = await db.select().from(dok4Spovs).where(eq(dok4Spovs.brainliftId, testBrainliftId));
    expect(spovs).toHaveLength(0);
  });

  it('saves SPOV with null workflowyNodeId', async () => {
    const ids = await saveDOK4Spovs(testBrainliftId, [
      { text: 'SPOV without node ID' },
    ]);

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, ids[0]));
    expect(spov.workflowyNodeId).toBeNull();
  });
});


describe('getDOK4Spovs', () => {
  it('returns SPOVs with linkedDok3InsightIds and primaryDok3InsightId', async () => {
    // Create SPOV and link it
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'Linked SPOV' }]);
    await linkDOK4Spov(spovId, testBrainliftId, [
      { dok3InsightId: testDok3InsightId1, isPrimary: true },
      { dok3InsightId: testDok3InsightId2, isPrimary: false },
    ]);

    const spovs = await getDOK4Spovs(testBrainliftId);
    expect(spovs).toHaveLength(1);
    expect(spovs[0].linkedDok3InsightIds).toContain(testDok3InsightId1);
    expect(spovs[0].linkedDok3InsightIds).toContain(testDok3InsightId2);
    expect(spovs[0].primaryDok3InsightId).toBe(testDok3InsightId1);
  });

  it('filters by brainliftId (IDOR safety)', async () => {
    await saveDOK4Spovs(testBrainliftId, [{ text: 'BL1 SPOV' }]);
    await saveDOK4Spovs(testBrainliftId2, [{ text: 'BL2 SPOV' }]);

    const spovs1 = await getDOK4Spovs(testBrainliftId);
    const spovs2 = await getDOK4Spovs(testBrainliftId2);

    expect(spovs1).toHaveLength(1);
    expect(spovs1[0].text).toBe('BL1 SPOV');
    expect(spovs2).toHaveLength(1);
    expect(spovs2[0].text).toBe('BL2 SPOV');
  });

  it('returns empty array when no SPOVs exist', async () => {
    const spovs = await getDOK4Spovs(testBrainliftId);
    expect(spovs).toEqual([]);
  });

  it('returns empty linkedDok3InsightIds and null primaryDok3InsightId for unlinked SPOV', async () => {
    await saveDOK4Spovs(testBrainliftId, [{ text: 'Unlinked SPOV' }]);

    const spovs = await getDOK4Spovs(testBrainliftId);
    expect(spovs).toHaveLength(1);
    expect(spovs[0].linkedDok3InsightIds).toEqual([]);
    expect(spovs[0].primaryDok3InsightId).toBeNull();
  });
});


describe('linkDOK4Spov', () => {
  it('creates link rows with correct is_primary flags', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'To link' }]);

    await linkDOK4Spov(spovId, testBrainliftId, [
      { dok3InsightId: testDok3InsightId1, isPrimary: true },
      { dok3InsightId: testDok3InsightId2, isPrimary: false },
    ]);

    const links = await db.select().from(dok4Dok3Links).where(eq(dok4Dok3Links.spovId, spovId));
    expect(links).toHaveLength(2);

    const primaryLink = links.find(l => l.dok3InsightId === testDok3InsightId1);
    const secondaryLink = links.find(l => l.dok3InsightId === testDok3InsightId2);
    expect(primaryLink?.isPrimary).toBe(true);
    expect(secondaryLink?.isPrimary).toBe(false);
  });

  it('sets SPOV status to linked', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'To link' }]);
    await linkDOK4Spov(spovId, testBrainliftId, [
      { dok3InsightId: testDok3InsightId1, isPrimary: true },
    ]);

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('linked');
  });

  it('does not update SPOV from wrong brainlift (IDOR protection)', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'BL1 SPOV' }]);

    // Try to link using wrong brainliftId
    await linkDOK4Spov(spovId, testBrainliftId2, [
      { dok3InsightId: testDok3InsightId1, isPrimary: true },
    ]);

    // SPOV should still be pending_linking (status not changed)
    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('pending_linking');
  });
});


describe('updateDOK4SpovStatus', () => {
  it('updates status with brainliftId guard', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'Status test' }]);

    await updateDOK4SpovStatus(spovId, testBrainliftId, 'grading');

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('grading');
  });

  it('does not update SPOV from wrong brainlift', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'IDOR test' }]);

    await updateDOK4SpovStatus(spovId, testBrainliftId2, 'grading');

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('pending_linking'); // unchanged
  });
});


describe('saveDOK4Rejection', () => {
  it('saves rejection fields and sets status to rejected', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'Reject me' }]);

    await saveDOK4Rejection(spovId, {
      rejectionReason: 'This is not a claim',
      rejectionCategory: 'not_a_claim',
    });

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('rejected');
    expect(spov.rejectionReason).toBe('This is not a claim');
    expect(spov.rejectionCategory).toBe('not_a_claim');
  });
});


describe('saveDOK4GradeResult', () => {
  it('saves all grading fields, sets status to graded and graded_at', async () => {
    const [spovId] = await saveDOK4Spovs(testBrainliftId, [{ text: 'Grade me' }]);

    const gradeResult: DOK4GradeResult = {
      foundationIntegrityIndex: 3.5,
      dok1FoundationScore: 4.0,
      dok2FoundationScore: 3.2,
      dok3FoundationScore: 3.8,
      foundationCeiling: 4,
      traceabilityFlagged: false,
      traceabilityFlaggedSource: null,
      traceabilityOverlapSummary: null,
      divergenceQuestion: 'Is AI ethics a solvable problem?',
      divergenceVanillaResponse: 'Generic AI response',
      qualityScoreRaw: 5,
      score: 4, // Capped by ceiling
      positionSummary: 'Strong ethical stance',
      frameworkDependency: 'Ethics framework',
      keyEvidence: ['Evidence 1', 'Evidence 2'],
      vulnerabilityPoints: ['Vulnerability 1'],
      criteriaBreakdown: {
        S1: { assessment: 'strong', evidence: 'Contested' },
        S2: { assessment: 'strong', evidence: 'Divergent' },
        S3: { assessment: 'strong', evidence: 'Grounded' },
        S4: { assessment: 'strong', evidence: 'Clear side' },
        S5: { assessment: 'partial', evidence: 'Some synthesis' },
        D1: { assessment: 'strong', evidence: 'Counterarguments' },
        O1: { assessment: 'strong', evidence: 'Causal reasoning' },
        O2: { assessment: 'strong', evidence: 'Distinct voice' },
      },
      rationale: 'Excellent SPOV',
      feedback: 'Keep pushing boundaries',
      antimemeticAssessment: {
        barrier_type: 'immunity',
        barrier_diagnosis: 'Audience may dismiss due to prior beliefs',
        strategy: 'Lead with shared values before divergent claim',
      },
      evaluatorModel: 'claude-3-5-sonnet-20241022',
    };

    await saveDOK4GradeResult(spovId, gradeResult);

    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spovId));
    expect(spov.status).toBe('graded');
    expect(spov.gradedAt).toBeTruthy();
    expect(spov.qualityScoreRaw).toBe(5);
    expect(spov.score).toBe(4);
    expect(spov.foundationIntegrityIndex).toBe('3.5');
    expect(spov.foundationCeiling).toBe(4);
    expect(spov.divergenceQuestion).toBe('Is AI ethics a solvable problem?');
    expect(spov.positionSummary).toBe('Strong ethical stance');
    expect(spov.evaluatorModel).toBe('claude-3-5-sonnet-20241022');
    expect(spov.keyEvidence).toEqual(['Evidence 1', 'Evidence 2']);
    expect(spov.antimemeticAssessment).toEqual({
      barrier_type: 'immunity',
      barrier_diagnosis: 'Audience may dismiss due to prior beliefs',
      strategy: 'Lead with shared values before divergent claim',
    });
  });
});


describe('getDOK4MeanScore', () => {
  it('returns average of graded SPOV scores', async () => {
    const ids = await saveDOK4Spovs(testBrainliftId, [
      { text: 'SPOV A' },
      { text: 'SPOV B' },
    ]);

    // Grade both SPOVs with different scores
    await db.update(dok4Spovs).set({ status: 'graded', score: 4, gradedAt: new Date() }).where(eq(dok4Spovs.id, ids[0]));
    await db.update(dok4Spovs).set({ status: 'graded', score: 2, gradedAt: new Date() }).where(eq(dok4Spovs.id, ids[1]));

    const mean = await getDOK4MeanScore(testBrainliftId);
    expect(mean).toBeCloseTo(3.0, 1);
  });

  it('returns null when no graded SPOVs exist', async () => {
    const mean = await getDOK4MeanScore(testBrainliftId);
    expect(mean).toBeNull();
  });

  it('excludes rejected SPOVs and null scores', async () => {
    const ids = await saveDOK4Spovs(testBrainliftId, [
      { text: 'Graded SPOV' },
      { text: 'Rejected SPOV' },
      { text: 'Pending SPOV' },
    ]);

    await db.update(dok4Spovs).set({ status: 'graded', score: 4, gradedAt: new Date() }).where(eq(dok4Spovs.id, ids[0]));
    await db.update(dok4Spovs).set({ status: 'rejected', rejectionReason: 'Not a claim' }).where(eq(dok4Spovs.id, ids[1]));
    // ids[2] stays as pending_linking with null score

    const mean = await getDOK4MeanScore(testBrainliftId);
    expect(mean).toBeCloseTo(4.0, 1); // Only the graded SPOV
  });
});
