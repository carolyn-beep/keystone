/**
 * Tests for FR3: Stale Flag Propagation Storage Functions
 *
 * Tests propagateStaleFlags, dismissStaleFlag, and getStaleItems against
 * a real local database (Docker Postgres).
 *
 * Sets up a full DOK chain: facts -> dok2_summaries -> dok3_insights -> dok4_spovs
 * linked through their respective link tables.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import {
  brainlifts, facts, dok2Summaries, dok2FactRelations,
  dok3Insights, dok3InsightLinks, dok4Spovs, dok4Dok3Links,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

import {
  propagateStaleFlags,
  dismissStaleFlag,
  getStaleItems,
} from '../stale';

let testBrainliftId: number;
let otherBrainliftId: number;

// DOK1
let fact1Id: number;
let fact2Id: number;

// DOK2
let dok2Id1: number;  // linked to fact1
let dok2Id2: number;  // linked to fact2
let dok2Unlinked: number;  // no links to any fact

// DOK3
let dok3Id1: number;  // linked to dok2Id1
let dok3Id2: number;  // linked to dok2Id1 and dok2Id2
let dok3Unlinked: number;  // no links

// DOK4
let dok4Id1: number;  // linked to dok3Id1
let dok4Id2: number;  // linked to dok3Id2
let dok4Unlinked: number;  // no links

// Other brainlift items (should not be affected)
let otherFact: number;

beforeAll(async () => {
  const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };

  // Create test brainlifts
  const [bl1] = await db.insert(brainlifts).values({
    title: 'Stale Test Brainlift',
    slug: 'stale-test-' + Date.now(),
    description: 'Test brainlift for stale propagation tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl1.id;

  const [bl2] = await db.insert(brainlifts).values({
    title: 'Other Brainlift',
    slug: 'stale-other-' + Date.now(),
    description: 'Should not be affected by stale propagation',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  otherBrainliftId = bl2.id;

  // Create DOK1 facts
  const [f1] = await db.insert(facts).values({
    brainliftId: testBrainliftId, originalId: 'stale-1.1', fact: 'Fact 1', score: 4,
  }).returning({ id: facts.id });
  fact1Id = f1.id;

  const [f2] = await db.insert(facts).values({
    brainliftId: testBrainliftId, originalId: 'stale-1.2', fact: 'Fact 2', score: 3,
  }).returning({ id: facts.id });
  fact2Id = f2.id;

  const [of] = await db.insert(facts).values({
    brainliftId: otherBrainliftId, originalId: 'other-1.1', fact: 'Other fact', score: 5,
  }).returning({ id: facts.id });
  otherFact = of.id;

  // Create DOK2 summaries
  const [d2_1] = await db.insert(dok2Summaries).values({
    brainliftId: testBrainliftId, sourceName: 'Source A', category: 'Cat A',
  }).returning({ id: dok2Summaries.id });
  dok2Id1 = d2_1.id;

  const [d2_2] = await db.insert(dok2Summaries).values({
    brainliftId: testBrainliftId, sourceName: 'Source B', category: 'Cat B',
  }).returning({ id: dok2Summaries.id });
  dok2Id2 = d2_2.id;

  const [d2_u] = await db.insert(dok2Summaries).values({
    brainliftId: testBrainliftId, sourceName: 'Source Unlinked', category: 'Cat C',
  }).returning({ id: dok2Summaries.id });
  dok2Unlinked = d2_u.id;

  // Link DOK2 -> DOK1
  await db.insert(dok2FactRelations).values([
    { summaryId: dok2Id1, factId: fact1Id },
    { summaryId: dok2Id2, factId: fact2Id },
  ]);

  // Create DOK3 insights
  const [d3_1] = await db.insert(dok3Insights).values({
    brainliftId: testBrainliftId, text: 'Insight 1', status: 'graded', score: 4,
  }).returning({ id: dok3Insights.id });
  dok3Id1 = d3_1.id;

  const [d3_2] = await db.insert(dok3Insights).values({
    brainliftId: testBrainliftId, text: 'Insight 2', status: 'graded', score: 3,
  }).returning({ id: dok3Insights.id });
  dok3Id2 = d3_2.id;

  const [d3_u] = await db.insert(dok3Insights).values({
    brainliftId: testBrainliftId, text: 'Insight Unlinked', status: 'graded', score: 2,
  }).returning({ id: dok3Insights.id });
  dok3Unlinked = d3_u.id;

  // Link DOK3 -> DOK2
  await db.insert(dok3InsightLinks).values([
    { insightId: dok3Id1, dok2SummaryId: dok2Id1 },
    { insightId: dok3Id2, dok2SummaryId: dok2Id1 },
    { insightId: dok3Id2, dok2SummaryId: dok2Id2 },
  ]);

  // Create DOK4 SPOVs
  const [d4_1] = await db.insert(dok4Spovs).values({
    brainliftId: testBrainliftId, text: 'SPOV 1', status: 'graded', score: 4,
  }).returning({ id: dok4Spovs.id });
  dok4Id1 = d4_1.id;

  const [d4_2] = await db.insert(dok4Spovs).values({
    brainliftId: testBrainliftId, text: 'SPOV 2', status: 'graded', score: 3,
  }).returning({ id: dok4Spovs.id });
  dok4Id2 = d4_2.id;

  const [d4_u] = await db.insert(dok4Spovs).values({
    brainliftId: testBrainliftId, text: 'SPOV Unlinked', status: 'graded', score: 2,
  }).returning({ id: dok4Spovs.id });
  dok4Unlinked = d4_u.id;

  // Link DOK4 -> DOK3
  await db.insert(dok4Dok3Links).values([
    { spovId: dok4Id1, dok3InsightId: dok3Id1, isPrimary: true },
    { spovId: dok4Id2, dok3InsightId: dok3Id2, isPrimary: true },
  ]);
});

afterAll(async () => {
  // Clean up in dependency order (facts FK doesn't cascade)
  // DOK4 links and SPOVs cascade from dok3/dok4
  // DOK3 links cascade from dok3_insights
  // DOK2 fact relations cascade from dok2_summaries
  // But facts -> brainlifts has no cascade, so delete facts first
  await db.delete(dok4Dok3Links).where(eq(dok4Dok3Links.spovId, dok4Id1));
  await db.delete(dok4Dok3Links).where(eq(dok4Dok3Links.spovId, dok4Id2));
  await db.delete(dok4Spovs).where(eq(dok4Spovs.brainliftId, testBrainliftId));
  await db.delete(dok3InsightLinks).where(eq(dok3InsightLinks.insightId, dok3Id1));
  await db.delete(dok3InsightLinks).where(eq(dok3InsightLinks.insightId, dok3Id2));
  await db.delete(dok3Insights).where(eq(dok3Insights.brainliftId, testBrainliftId));
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.summaryId, dok2Id1));
  await db.delete(dok2FactRelations).where(eq(dok2FactRelations.summaryId, dok2Id2));
  await db.delete(dok2Summaries).where(eq(dok2Summaries.brainliftId, testBrainliftId));
  await db.delete(facts).where(eq(facts.brainliftId, testBrainliftId));
  await db.delete(facts).where(eq(facts.brainliftId, otherBrainliftId));
  await db.delete(brainlifts).where(eq(brainlifts.id, testBrainliftId));
  await db.delete(brainlifts).where(eq(brainlifts.id, otherBrainliftId));
});

// Reset stale flags before each test
beforeEach(async () => {
  await db.update(facts).set({ isStale: false, staleReason: null }).where(eq(facts.brainliftId, testBrainliftId));
  await db.update(dok2Summaries).set({ isStale: false, staleReason: null }).where(eq(dok2Summaries.brainliftId, testBrainliftId));
  await db.update(dok3Insights).set({ isStale: false, staleReason: null }).where(eq(dok3Insights.brainliftId, testBrainliftId));
  await db.update(dok4Spovs).set({ isStale: false, staleReason: null }).where(eq(dok4Spovs.brainliftId, testBrainliftId));
  // Also reset other brainlift
  await db.update(facts).set({ isStale: false, staleReason: null }).where(eq(facts.brainliftId, otherBrainliftId));
});


describe('propagateStaleFlags', () => {
  it('DOK1 edit marks linked DOK2s, DOK3s, and DOK4s stale transitively', async () => {
    const result = await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Fact 1 was edited',
    });

    // fact1 -> dok2Id1 -> dok3Id1, dok3Id2 -> dok4Id1, dok4Id2
    expect(result.dok2Count).toBe(1);      // dok2Id1
    expect(result.dok3Count).toBe(2);      // dok3Id1, dok3Id2 (both linked to dok2Id1)
    expect(result.dok4Count).toBe(2);      // dok4Id1, dok4Id2

    // Verify the actual stale flags are set
    const stale = await getStaleItems(testBrainliftId);
    expect(stale.dok2).toContain(dok2Id1);
    expect(stale.dok2).not.toContain(dok2Unlinked);
    expect(stale.dok3).toContain(dok3Id1);
    expect(stale.dok3).toContain(dok3Id2);
    expect(stale.dok3).not.toContain(dok3Unlinked);
    expect(stale.dok4).toContain(dok4Id1);
    expect(stale.dok4).toContain(dok4Id2);
    expect(stale.dok4).not.toContain(dok4Unlinked);
  });

  it('DOK2 edit marks linked DOK3s and DOK4s stale', async () => {
    const result = await propagateStaleFlags({
      dokLevel: 2,
      itemId: dok2Id1,
      brainliftId: testBrainliftId,
      reason: 'DOK2 summary was edited',
    });

    // dok2Id1 -> dok3Id1, dok3Id2 -> dok4Id1, dok4Id2
    expect(result.dok2Count).toBe(0);
    expect(result.dok3Count).toBe(2);
    expect(result.dok4Count).toBe(2);
  });

  it('DOK3 edit marks linked DOK4s stale', async () => {
    const result = await propagateStaleFlags({
      dokLevel: 3,
      itemId: dok3Id1,
      brainliftId: testBrainliftId,
      reason: 'DOK3 insight was edited',
    });

    expect(result.dok2Count).toBe(0);
    expect(result.dok3Count).toBe(0);
    expect(result.dok4Count).toBe(1); // only dok4Id1
  });

  it('DOK4 edit returns all counts as 0 (leaf level)', async () => {
    const result = await propagateStaleFlags({
      dokLevel: 4,
      itemId: dok4Id1,
      brainliftId: testBrainliftId,
      reason: 'DOK4 SPOV was edited',
    });

    expect(result.dok2Count).toBe(0);
    expect(result.dok3Count).toBe(0);
    expect(result.dok4Count).toBe(0);
  });

  it('items without links are unaffected', async () => {
    // Edit fact2 -- only linked to dok2Id2, which links to dok3Id2, then dok4Id2
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact2Id,
      brainliftId: testBrainliftId,
      reason: 'Fact 2 was edited',
    });

    const stale = await getStaleItems(testBrainliftId);
    // dok2Unlinked, dok3Unlinked, dok4Unlinked should NOT be stale
    expect(stale.dok2).not.toContain(dok2Unlinked);
    expect(stale.dok3).not.toContain(dok3Unlinked);
    expect(stale.dok4).not.toContain(dok4Unlinked);
    // dok2Id1 should NOT be stale (not linked to fact2)
    expect(stale.dok2).not.toContain(dok2Id1);
  });

  it('already-stale items get reason updated', async () => {
    // First propagation
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'First edit',
    });

    // Second propagation with different reason
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Second edit',
    });

    // Verify reason was updated (check DOK2 directly)
    const [dok2] = await db.select()
      .from(dok2Summaries)
      .where(eq(dok2Summaries.id, dok2Id1));
    expect(dok2.staleReason).toBe('Second edit');
    expect(dok2.isStale).toBe(true);
  });

  it('scoped to brainliftId -- other brainlifts unaffected', async () => {
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Edit in test brainlift',
    });

    // Other brainlift's fact should not be stale
    const [other] = await db.select()
      .from(facts)
      .where(eq(facts.id, otherFact));
    expect(other.isStale).toBe(false);
  });
});


describe('dismissStaleFlag', () => {
  it('clears isStale and staleReason', async () => {
    // Make dok2Id1 stale first
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Fact edited',
    });

    await dismissStaleFlag(2, dok2Id1, testBrainliftId);

    const [dok2] = await db.select()
      .from(dok2Summaries)
      .where(eq(dok2Summaries.id, dok2Id1));
    expect(dok2.isStale).toBe(false);
    expect(dok2.staleReason).toBeNull();
  });

  it('no-op for non-stale items', async () => {
    // dok2Id1 starts non-stale (reset in beforeEach)
    await dismissStaleFlag(2, dok2Id1, testBrainliftId);

    const [dok2] = await db.select()
      .from(dok2Summaries)
      .where(eq(dok2Summaries.id, dok2Id1));
    expect(dok2.isStale).toBe(false);
    expect(dok2.staleReason).toBeNull();
  });

  it('requires brainliftId match (IDOR safe)', async () => {
    // Make dok2Id1 stale
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Fact edited',
    });

    // Try to dismiss with wrong brainliftId
    await dismissStaleFlag(2, dok2Id1, otherBrainliftId);

    // Should still be stale (wrong brainliftId)
    const [dok2] = await db.select()
      .from(dok2Summaries)
      .where(eq(dok2Summaries.id, dok2Id1));
    expect(dok2.isStale).toBe(true);
  });
});


describe('getStaleItems', () => {
  it('returns correct IDs grouped by level', async () => {
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: fact1Id,
      brainliftId: testBrainliftId,
      reason: 'Fact edited',
    });

    const stale = await getStaleItems(testBrainliftId);

    expect(stale.dok1).toEqual([]); // DOK1 itself is not marked stale by propagation
    expect(stale.dok2.sort()).toEqual([dok2Id1].sort());
    expect(stale.dok3.sort()).toEqual([dok3Id1, dok3Id2].sort());
    expect(stale.dok4.sort()).toEqual([dok4Id1, dok4Id2].sort());
  });

  it('returns empty arrays when nothing is stale', async () => {
    const stale = await getStaleItems(testBrainliftId);

    expect(stale.dok1).toEqual([]);
    expect(stale.dok2).toEqual([]);
    expect(stale.dok3).toEqual([]);
    expect(stale.dok4).toEqual([]);
  });
});
