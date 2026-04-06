/**
 * Tests for 03-edit-delete: Storage functions for editing and deleting DOK items.
 *
 * Tests cover:
 * - FR1: editFact (DOK1)
 * - FR2: editDok2Summary (DOK2)
 * - FR3: editDok3Insight (DOK3)
 * - FR4: editDok4Spov (DOK4)
 * - FR5: Delete impact previews
 * - FR6: deleteFact (DOK1)
 * - FR7: deleteDok2Summary, deleteDok3Insight, deleteDok4Spov
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import {
  brainlifts, facts, dok2Summaries, dok2Points, dok2FactRelations,
  dok3Insights, dok3InsightLinks, dok4Spovs, dok4Dok3Links,
  dokItemVersions,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

// Storage functions under test
import {
  editFact,
  deleteFact,
  getFactDeleteImpact,
} from '../dok1-crud';
import {
  editDok2Summary,
  deleteDok2Summary,
  getDok2DeleteImpact,
} from '../dok2-crud';
import {
  editDok3Insight,
  deleteDok3Insight,
  getDok3DeleteImpact,
} from '../dok3-crud';
import {
  editDok4Spov,
  deleteDok4Spov,
  getDok4DeleteImpact,
} from '../dok4-crud';

let testBrainliftId: number;
let otherBrainliftId: number;

const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };

beforeAll(async () => {
  const [bl] = await db.insert(brainlifts).values({
    title: 'CRUD Test Brainlift',
    slug: 'crud-test-' + Date.now(),
    description: 'Test brainlift for DOK CRUD tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl.id;

  const [bl2] = await db.insert(brainlifts).values({
    title: 'Other Brainlift',
    slug: 'crud-other-' + Date.now(),
    description: 'Other brainlift for IDOR tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  otherBrainliftId = bl2.id;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await db.delete(dok4Dok3Links).where(
    inArray(dok4Dok3Links.spovId,
      db.select({ id: dok4Spovs.id }).from(dok4Spovs)
        .where(inArray(dok4Spovs.brainliftId, [testBrainliftId, otherBrainliftId]))
    )
  );
  await db.delete(dok4Spovs).where(inArray(dok4Spovs.brainliftId, [testBrainliftId, otherBrainliftId]));
  await db.delete(dok3InsightLinks).where(
    inArray(dok3InsightLinks.insightId,
      db.select({ id: dok3Insights.id }).from(dok3Insights)
        .where(inArray(dok3Insights.brainliftId, [testBrainliftId, otherBrainliftId]))
    )
  );
  await db.delete(dok3Insights).where(inArray(dok3Insights.brainliftId, [testBrainliftId, otherBrainliftId]));
  await db.delete(dok2FactRelations).where(
    inArray(dok2FactRelations.summaryId,
      db.select({ id: dok2Summaries.id }).from(dok2Summaries)
        .where(inArray(dok2Summaries.brainliftId, [testBrainliftId, otherBrainliftId]))
    )
  );
  await db.delete(dok2Points).where(
    inArray(dok2Points.summaryId,
      db.select({ id: dok2Summaries.id }).from(dok2Summaries)
        .where(inArray(dok2Summaries.brainliftId, [testBrainliftId, otherBrainliftId]))
    )
  );
  await db.delete(dok2Summaries).where(inArray(dok2Summaries.brainliftId, [testBrainliftId, otherBrainliftId]));
  await db.delete(facts).where(inArray(facts.brainliftId, [testBrainliftId, otherBrainliftId]));
  await db.delete(dokItemVersions).where(inArray(dokItemVersions.brainliftId, [testBrainliftId, otherBrainliftId]));
  await db.delete(brainlifts).where(inArray(brainlifts.id, [testBrainliftId, otherBrainliftId]));
});

// ─── Helper: create test data ────────────────────────────────────────────────

async function createFact(opts: { text?: string; score?: number; brainliftId?: number } = {}) {
  const [f] = await db.insert(facts).values({
    brainliftId: opts.brainliftId ?? testBrainliftId,
    originalId: 'test-' + Date.now() + '-' + Math.random(),
    fact: opts.text ?? 'Test fact text',
    score: opts.score ?? 4,
    note: 'Test feedback',
  }).returning();
  return f;
}

async function createDok2(opts: { points?: string[]; brainliftId?: number } = {}) {
  const [s] = await db.insert(dok2Summaries).values({
    brainliftId: opts.brainliftId ?? testBrainliftId,
    sourceName: 'Test Source',
    sourceUrl: 'https://example.com',
    grade: 3,
    diagnosis: 'Test diagnosis',
    feedback: 'Test feedback',
  }).returning();

  const points = opts.points ?? ['Point 1', 'Point 2'];
  if (points.length > 0) {
    await db.insert(dok2Points).values(
      points.map((text, i) => ({ summaryId: s.id, text, sortOrder: i }))
    );
  }

  return s;
}

async function createDok3(opts: { text?: string; brainliftId?: number; status?: string } = {}) {
  const [i] = await db.insert(dok3Insights).values({
    brainliftId: opts.brainliftId ?? testBrainliftId,
    text: opts.text ?? 'Test insight text',
    status: (opts.status ?? 'graded') as any,
    score: 4,
    rationale: 'Test rationale',
    feedback: 'Test feedback',
    criteriaBreakdown: { V1: { assessment: 'strong', evidence: 'test' } },
  }).returning();
  return i;
}

async function createDok4(opts: { text?: string; brainliftId?: number; status?: string } = {}) {
  const [s] = await db.insert(dok4Spovs).values({
    brainliftId: opts.brainliftId ?? testBrainliftId,
    text: opts.text ?? 'Test SPOV text',
    status: (opts.status ?? 'graded') as any,
    score: 4,
    rationale: 'Test rationale',
    feedback: 'Test feedback',
    criteriaBreakdown: { C1: { assessment: 'strong', evidence: 'test' } },
  }).returning();
  return s;
}

async function linkFactToDok2(factId: number, summaryId: number) {
  await db.insert(dok2FactRelations).values({ factId, summaryId });
}

async function linkDok2ToDok3(summaryId: number, insightId: number) {
  await db.insert(dok3InsightLinks).values({ dok2SummaryId: summaryId, insightId });
}

async function linkDok3ToDok4(insightId: number, spovId: number, isPrimary = false) {
  await db.insert(dok4Dok3Links).values({ dok3InsightId: insightId, spovId, isPrimary });
}

// ─── FR1: Edit DOK1 Fact ─────────────────────────────────────────────────────

describe('editFact', () => {
  it('returns previous text, score, and feedback', async () => {
    const fact = await createFact({ text: 'Original text', score: 3 });
    const result = await editFact(fact.id, testBrainliftId, 'Updated text');

    expect(result.previousText).toBe('Original text');
    expect(result.previousScore).toBe(3);
    expect(result.previousFeedback).toBe('Test feedback');
  });

  it('updates the fact text in the database', async () => {
    const fact = await createFact({ text: 'Before edit' });
    await editFact(fact.id, testBrainliftId, 'After edit');

    const [updated] = await db.select().from(facts).where(eq(facts.id, fact.id));
    expect(updated.fact).toBe('After edit');
    expect(updated.updatedAt).not.toBeNull();
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const fact = await createFact();
    const result = await editFact(fact.id, otherBrainliftId, 'Hacked text');
    expect(result).toBeNull();
  });

  it('returns null for non-existent factId', async () => {
    const result = await editFact(999999, testBrainliftId, 'No such fact');
    expect(result).toBeNull();
  });
});

// ─── FR2: Edit DOK2 Summary ─────────────────────────────────────────────────

describe('editDok2Summary', () => {
  it('returns previous points, score, and feedback', async () => {
    const dok2 = await createDok2({ points: ['Old point 1', 'Old point 2'] });
    const result = await editDok2Summary(dok2.id, testBrainliftId, ['New point 1', 'New point 2', 'New point 3']);

    expect(result).not.toBeNull();
    expect(result!.previousPoints).toEqual(['Old point 1', 'Old point 2']);
    expect(result!.previousScore).toBe(3);
    expect(result!.previousFeedback).toBe('Test feedback');
  });

  it('replaces points in the database', async () => {
    const dok2 = await createDok2({ points: ['A', 'B'] });
    await editDok2Summary(dok2.id, testBrainliftId, ['X', 'Y', 'Z']);

    const points = await db.select().from(dok2Points)
      .where(eq(dok2Points.summaryId, dok2.id));
    expect(points.map(p => p.text).sort()).toEqual(['X', 'Y', 'Z']);
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const dok2 = await createDok2();
    const result = await editDok2Summary(dok2.id, otherBrainliftId, ['hacked']);
    expect(result).toBeNull();
  });
});

// ─── FR3: Edit DOK3 Insight ─────────────────────────────────────────────────

describe('editDok3Insight', () => {
  it('returns previous text, score, rationale, and criteriaBreakdown', async () => {
    const insight = await createDok3({ text: 'Original insight' });
    const result = await editDok3Insight(insight.id, testBrainliftId, 'Updated insight');

    expect(result).not.toBeNull();
    expect(result!.previousText).toBe('Original insight');
    expect(result!.previousScore).toBe(4);
    expect(result!.previousRationale).toBe('Test rationale');
    expect(result!.previousCriteriaBreakdown).toEqual({ V1: { assessment: 'strong', evidence: 'test' } });
  });

  it('updates insight text in the database', async () => {
    const insight = await createDok3({ text: 'Before' });
    await editDok3Insight(insight.id, testBrainliftId, 'After');

    const [updated] = await db.select().from(dok3Insights).where(eq(dok3Insights.id, insight.id));
    expect(updated.text).toBe('After');
    expect(updated.updatedAt).not.toBeNull();
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const insight = await createDok3();
    const result = await editDok3Insight(insight.id, otherBrainliftId, 'hacked');
    expect(result).toBeNull();
  });
});

// ─── FR4: Edit DOK4 SPOV ────────────────────────────────────────────────────

describe('editDok4Spov', () => {
  it('returns previous text, score, rationale, and criteriaBreakdown', async () => {
    const spov = await createDok4({ text: 'Original SPOV' });
    const result = await editDok4Spov(spov.id, testBrainliftId, 'Updated SPOV');

    expect(result).not.toBeNull();
    expect(result!.previousText).toBe('Original SPOV');
    expect(result!.previousScore).toBe(4);
    expect(result!.previousRationale).toBe('Test rationale');
  });

  it('updates SPOV text in the database', async () => {
    const spov = await createDok4({ text: 'Before' });
    await editDok4Spov(spov.id, testBrainliftId, 'After');

    const [updated] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, spov.id));
    expect(updated.text).toBe('After');
    expect(updated.updatedAt).not.toBeNull();
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const spov = await createDok4();
    const result = await editDok4Spov(spov.id, otherBrainliftId, 'hacked');
    expect(result).toBeNull();
  });
});

// ─── FR5: Delete Impact Preview ──────────────────────────────────────────────

describe('getFactDeleteImpact', () => {
  it('returns correct impact for a fact linked to DOK2s', async () => {
    const fact = await createFact({ text: 'Impactful fact', score: 4 });
    const dok2a = await createDok2();
    const dok2b = await createDok2();
    await linkFactToDok2(fact.id, dok2a.id);
    await linkFactToDok2(fact.id, dok2b.id);

    const impact = await getFactDeleteImpact(fact.id, testBrainliftId);
    expect(impact).not.toBeNull();
    expect(impact!.item.id).toBe(fact.id);
    expect(impact!.item.text).toBe('Impactful fact');
    expect(impact!.unlinkedItems.length).toBe(2);
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const fact = await createFact();
    const impact = await getFactDeleteImpact(fact.id, otherBrainliftId);
    expect(impact).toBeNull();
  });

  it('includes transitive stale counts through DOK link graph', async () => {
    // Build a chain: fact -> dok2 -> dok3 -> dok4
    const fact = await createFact({ text: 'Chain fact', score: 5 });
    const dok2 = await createDok2();
    const dok3 = await createDok3();
    const dok4 = await createDok4();
    await linkFactToDok2(fact.id, dok2.id);
    await linkDok2ToDok3(dok2.id, dok3.id);
    await linkDok3ToDok4(dok3.id, dok4.id);

    const impact = await getFactDeleteImpact(fact.id, testBrainliftId);
    expect(impact).not.toBeNull();
    expect(impact!.staleDok2Ids.length).toBe(1);
    expect(impact!.staleDok3Ids.length).toBe(1);
    expect(impact!.staleDok4Ids.length).toBe(1);
  });
});

describe('getDok2DeleteImpact', () => {
  it('returns correct impact for a DOK2 linked to DOK3s', async () => {
    const dok2 = await createDok2();
    const dok3 = await createDok3();
    await linkDok2ToDok3(dok2.id, dok3.id);

    const impact = await getDok2DeleteImpact(dok2.id, testBrainliftId);
    expect(impact).not.toBeNull();
    expect(impact!.item.id).toBe(dok2.id);
    expect(impact!.staleDok3Ids.length).toBe(1);
  });
});

describe('getDok3DeleteImpact', () => {
  it('returns correct impact for a DOK3 linked to DOK4s', async () => {
    const dok3 = await createDok3();
    const dok4 = await createDok4();
    await linkDok3ToDok4(dok3.id, dok4.id);

    const impact = await getDok3DeleteImpact(dok3.id, testBrainliftId);
    expect(impact).not.toBeNull();
    expect(impact!.item.id).toBe(dok3.id);
    expect(impact!.staleDok4Ids.length).toBe(1);
  });
});

describe('getDok4DeleteImpact', () => {
  it('returns item with no downstream impact (terminal level)', async () => {
    const dok4 = await createDok4({ text: 'Terminal SPOV' });
    const impact = await getDok4DeleteImpact(dok4.id, testBrainliftId);
    expect(impact).not.toBeNull();
    expect(impact!.item.id).toBe(dok4.id);
    expect(impact!.unlinkedItems).toEqual([]);
    expect(impact!.staleDok2Ids).toEqual([]);
    expect(impact!.staleDok3Ids).toEqual([]);
    expect(impact!.staleDok4Ids).toEqual([]);
  });
});

// ─── FR6: Delete DOK1 Fact ───────────────────────────────────────────────────

describe('deleteFact', () => {
  it('deletes fact and removes dok2_fact_relations', async () => {
    const fact = await createFact({ text: 'Delete me' });
    const dok2 = await createDok2();
    await linkFactToDok2(fact.id, dok2.id);

    const result = await deleteFact(fact.id, testBrainliftId);
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);

    // Fact should be gone
    const [gone] = await db.select().from(facts).where(eq(facts.id, fact.id));
    expect(gone).toBeUndefined();

    // Relation should be gone
    const rels = await db.select().from(dok2FactRelations)
      .where(eq(dok2FactRelations.factId, fact.id));
    expect(rels.length).toBe(0);
  });

  it('marks dependent DOK2s as stale after deletion', async () => {
    const fact = await createFact({ text: 'Stale trigger' });
    const dok2 = await createDok2();
    await linkFactToDok2(fact.id, dok2.id);

    await deleteFact(fact.id, testBrainliftId);

    const [staled] = await db.select().from(dok2Summaries).where(eq(dok2Summaries.id, dok2.id));
    expect(staled.isStale).toBe(true);
    expect(staled.staleReason).toContain('deleted');
  });

  it('returns null for wrong brainliftId (IDOR)', async () => {
    const fact = await createFact();
    const result = await deleteFact(fact.id, otherBrainliftId);
    expect(result).toBeNull();
  });
});

// ─── FR7: Delete DOK2/DOK3/DOK4 ─────────────────────────────────────────────

describe('deleteDok2Summary', () => {
  it('deletes DOK2, its points, and fact relations', async () => {
    const dok2 = await createDok2({ points: ['P1', 'P2'] });
    const fact = await createFact();
    await linkFactToDok2(fact.id, dok2.id);

    const result = await deleteDok2Summary(dok2.id, testBrainliftId);
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);

    // DOK2 should be gone
    const [gone] = await db.select().from(dok2Summaries).where(eq(dok2Summaries.id, dok2.id));
    expect(gone).toBeUndefined();

    // Points should be gone
    const points = await db.select().from(dok2Points).where(eq(dok2Points.summaryId, dok2.id));
    expect(points.length).toBe(0);

    // Fact relation should be gone
    const rels = await db.select().from(dok2FactRelations).where(eq(dok2FactRelations.summaryId, dok2.id));
    expect(rels.length).toBe(0);
  });

  it('marks dependent DOK3s as stale', async () => {
    const dok2 = await createDok2();
    const dok3 = await createDok3();
    await linkDok2ToDok3(dok2.id, dok3.id);

    await deleteDok2Summary(dok2.id, testBrainliftId);

    const [staled] = await db.select().from(dok3Insights).where(eq(dok3Insights.id, dok3.id));
    expect(staled.isStale).toBe(true);
  });
});

describe('deleteDok3Insight', () => {
  it('deletes DOK3 and its insight links', async () => {
    const dok3 = await createDok3();
    const dok2 = await createDok2();
    await linkDok2ToDok3(dok2.id, dok3.id);

    const result = await deleteDok3Insight(dok3.id, testBrainliftId);
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);

    const [gone] = await db.select().from(dok3Insights).where(eq(dok3Insights.id, dok3.id));
    expect(gone).toBeUndefined();

    const links = await db.select().from(dok3InsightLinks).where(eq(dok3InsightLinks.insightId, dok3.id));
    expect(links.length).toBe(0);
  });

  it('marks dependent DOK4s as stale', async () => {
    const dok3 = await createDok3();
    const dok4 = await createDok4();
    await linkDok3ToDok4(dok3.id, dok4.id);

    await deleteDok3Insight(dok3.id, testBrainliftId);

    const [staled] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, dok4.id));
    expect(staled.isStale).toBe(true);
  });
});

describe('deleteDok4Spov', () => {
  it('deletes DOK4 and its DOK3 links, no downstream stale', async () => {
    const dok4 = await createDok4();
    const dok3 = await createDok3();
    await linkDok3ToDok4(dok3.id, dok4.id);

    const result = await deleteDok4Spov(dok4.id, testBrainliftId);
    expect(result).not.toBeNull();
    expect(result!.deleted).toBe(true);

    const [gone] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, dok4.id));
    expect(gone).toBeUndefined();

    // DOK3 link should be gone (cascade)
    const links = await db.select().from(dok4Dok3Links).where(eq(dok4Dok3Links.spovId, dok4.id));
    expect(links.length).toBe(0);

    // DOK3 should NOT be stale (DOK4 is terminal, no upstream stale)
    const [dok3Check] = await db.select().from(dok3Insights).where(eq(dok3Insights.id, dok3.id));
    expect(dok3Check.isStale).toBe(false);
  });
});
