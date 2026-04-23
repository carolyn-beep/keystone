/**
 * Tests for 04-create: Storage functions for creating DOK items.
 *
 * Integration tests against the real database covering:
 * - FR1: createFact (DOK1)
 * - FR2: createDok2Summary (DOK2)
 * - FR3: createDok3Insight (DOK3)
 * - FR4: createDok4Spov (DOK4)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import {
  brainlifts, facts, dok2Summaries, dok2Points, dok2FactRelations,
  dok3Insights, dok3InsightLinks, dok4Spovs, dok4Dok3Links,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

import { createFact } from '../dok1-crud';
import { createDok2Summary } from '../dok2-crud';
import { createDok3Insight } from '../dok3-crud';
import { createDok4Spov } from '../dok4-crud';

let testBrainliftId: number;
let otherBrainliftId: number;

const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };

beforeAll(async () => {
  const [bl] = await db.insert(brainlifts).values({
    title: 'Create Test Brainlift',
    slug: 'create-test-' + Date.now(),
    description: 'Test brainlift for DOK create tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl.id;

  const [bl2] = await db.insert(brainlifts).values({
    title: 'Other Brainlift',
    slug: 'create-other-' + Date.now(),
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
  await db.delete(brainlifts).where(inArray(brainlifts.id, [testBrainliftId, otherBrainliftId]));
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function insertFact(brainliftId: number, text = 'Helper fact') {
  const [f] = await db.insert(facts).values({
    brainliftId,
    originalId: 'helper-' + Date.now() + '-' + Math.random(),
    fact: text,
    score: 4,
    source: 'https://example.com',
  }).returning();
  return f;
}

async function insertDok2(brainliftId: number, sourceName: string, sourceUrl: string) {
  const [s] = await db.insert(dok2Summaries).values({
    brainliftId,
    sourceName,
    sourceUrl,
    grade: 4,
  }).returning();
  await db.insert(dok2Points).values({ summaryId: s.id, text: 'Test point', sortOrder: 0 });
  return s;
}

async function insertDok3(brainliftId: number, status: string = 'graded') {
  const [i] = await db.insert(dok3Insights).values({
    brainliftId,
    text: 'Test insight ' + Date.now(),
    status: status as any,
    score: status === 'graded' ? 4 : null,
  }).returning();
  return i;
}

// ─── FR1: createFact ────────────────────────────────────────────────────────

describe('createFact', () => {
  it('inserts a new fact with score=0 and returns its ID', async () => {
    const result = await createFact({
      brainliftId: testBrainliftId,
      fact: 'Water boils at 100C at sea level',
      source: 'https://science.org',
      category: 'Chemistry',
    });

    expect(result.id).toBeGreaterThan(0);

    // Verify in DB
    const [row] = await db.select().from(facts).where(eq(facts.id, result.id));
    expect(row.fact).toBe('Water boils at 100C at sea level');
    expect(row.source).toBe('https://science.org');
    expect(row.category).toBe('Chemistry');
    expect(row.score).toBe(0);
    expect(row.isGradeable).toBe(true);
    expect(row.brainliftId).toBe(testBrainliftId);
  });

  it('creates a fact without optional category', async () => {
    const result = await createFact({
      brainliftId: testBrainliftId,
      fact: 'The Earth orbits the Sun',
      source: 'https://nasa.gov',
    });

    const [row] = await db.select().from(facts).where(eq(facts.id, result.id));
    expect(row.category).toBeNull();
  });
});

// ─── FR2: createDok2Summary ─────────────────────────────────────────────────

describe('createDok2Summary', () => {
  it('inserts summary with points and fact relations, returns ID', async () => {
    const fact1 = await insertFact(testBrainliftId, 'Related fact 1');
    const fact2 = await insertFact(testBrainliftId, 'Related fact 2');

    const result = await createDok2Summary({
      brainliftId: testBrainliftId,
      sourceName: 'Test Source',
      sourceUrl: 'https://testsource.com',
      points: ['Point A', 'Point B', 'Point C'],
      relatedFactIds: [fact1.id, fact2.id],
    });

    expect(result.id).toBeGreaterThan(0);

    // Verify summary row
    const [summary] = await db.select().from(dok2Summaries).where(eq(dok2Summaries.id, result.id));
    expect(summary.sourceName).toBe('Test Source');
    expect(summary.sourceUrl).toBe('https://testsource.com');
    expect(summary.grade).toBeNull();

    // Verify points
    const points = await db.select().from(dok2Points)
      .where(eq(dok2Points.summaryId, result.id));
    expect(points).toHaveLength(3);
    expect(points.map(p => p.text).sort()).toEqual(['Point A', 'Point B', 'Point C']);

    // Verify fact relations
    const rels = await db.select().from(dok2FactRelations)
      .where(eq(dok2FactRelations.summaryId, result.id));
    expect(rels).toHaveLength(2);
    expect(rels.map(r => r.factId).sort()).toEqual([fact1.id, fact2.id].sort());
  });

  it('works with empty relatedFactIds', async () => {
    const result = await createDok2Summary({
      brainliftId: testBrainliftId,
      sourceName: 'No Facts Source',
      points: ['Standalone point'],
      relatedFactIds: [],
    });

    expect(result.id).toBeGreaterThan(0);

    const rels = await db.select().from(dok2FactRelations)
      .where(eq(dok2FactRelations.summaryId, result.id));
    expect(rels).toHaveLength(0);
  });
});

// ─── FR3: createDok3Insight ─────────────────────────────────────────────────

describe('createDok3Insight', () => {
  it('inserts insight with status=linked and creates DOK2 links', async () => {
    const dok2a = await insertDok2(testBrainliftId, 'Source A', 'https://source-a.com');
    const dok2b = await insertDok2(testBrainliftId, 'Source B', 'https://source-b.com');

    const result = await createDok3Insight({
      brainliftId: testBrainliftId,
      text: 'Cross-source insight about patterns',
      linkedDok2Ids: [dok2a.id, dok2b.id],
    });

    expect(result.id).toBeGreaterThan(0);

    // Verify insight row
    const [insight] = await db.select().from(dok3Insights).where(eq(dok3Insights.id, result.id));
    expect(insight.text).toBe('Cross-source insight about patterns');
    expect(insight.status).toBe('linked');
    expect(insight.score).toBeNull();

    // Verify links
    const links = await db.select().from(dok3InsightLinks)
      .where(eq(dok3InsightLinks.insightId, result.id));
    expect(links).toHaveLength(2);
    expect(links.map(l => l.dok2SummaryId).sort()).toEqual([dok2a.id, dok2b.id].sort());
  });
});

// ─── FR4: createDok4Spov ────────────────────────────────────────────────────

describe('createDok4Spov', () => {
  it('inserts SPOV with status=linked and creates DOK3 links with primary', async () => {
    const dok3a = await insertDok3(testBrainliftId, 'graded');
    const dok3b = await insertDok3(testBrainliftId, 'graded');

    const result = await createDok4Spov({
      brainliftId: testBrainliftId,
      text: 'A strong point of view on the topic',
      linkedDok3Ids: [dok3a.id, dok3b.id],
      primaryDok3Id: dok3a.id,
    });

    expect(result.id).toBeGreaterThan(0);

    // Verify SPOV row
    const [spov] = await db.select().from(dok4Spovs).where(eq(dok4Spovs.id, result.id));
    expect(spov.text).toBe('A strong point of view on the topic');
    expect(spov.status).toBe('linked');
    expect(spov.score).toBeNull();

    // Verify links with primary designation
    const links = await db.select().from(dok4Dok3Links)
      .where(eq(dok4Dok3Links.spovId, result.id));
    expect(links).toHaveLength(2);

    const primaryLink = links.find(l => l.dok3InsightId === dok3a.id);
    const secondaryLink = links.find(l => l.dok3InsightId === dok3b.id);
    expect(primaryLink?.isPrimary).toBe(true);
    expect(secondaryLink?.isPrimary).toBe(false);
  });
});
