/**
 * Tests for assembleTextForEntity (FR4 helper).
 *
 * Integration tests against local Docker Postgres -- exercises the actual
 * dok2_points / dok3_insights / dok4_spovs query paths.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import {
  brainlifts,
  dok2Points,
  dok2Summaries,
  dok3Insights,
  dok4Spovs,
  user,
} from '@shared/schema';
import { assembleTextForEntity } from '../assembleText';
import { NotFoundError } from '../../../middleware/error-handler';

const TEST_USER_ID = `test-assemble-${Date.now()}`;
let BRAINLIFT_ID = 0;
let SUMMARY_ID = 0;
let SUMMARY_EMPTY_ID = 0;
let INSIGHT_ID = 0;
let SPOV_ID = 0;

beforeAll(async () => {
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Assemble Text Test User',
    email: `assemble-${Date.now()}@test.com`,
    emailVerified: false,
  });
  const [bl] = await db
    .insert(brainlifts)
    .values({
      slug: `assemble-test-${Date.now()}`,
      title: 'Assemble',
      description: 'fixture',
      summary: { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 },
      createdByUserId: TEST_USER_ID,
    })
    .returning();
  BRAINLIFT_ID = bl.id;

  const [sum] = await db
    .insert(dok2Summaries)
    .values({
      brainliftId: BRAINLIFT_ID,
      sourceName: 'Src',
    })
    .returning();
  SUMMARY_ID = sum.id;

  const [sumEmpty] = await db
    .insert(dok2Summaries)
    .values({
      brainliftId: BRAINLIFT_ID,
      sourceName: 'Src',
    })
    .returning();
  SUMMARY_EMPTY_ID = sumEmpty.id;

  // Three points with non-sequential sortOrder; assemble should sort ASC.
  await db.insert(dok2Points).values([
    { summaryId: SUMMARY_ID, text: 'second', sortOrder: 2 },
    { summaryId: SUMMARY_ID, text: 'third', sortOrder: 3 },
    { summaryId: SUMMARY_ID, text: 'first', sortOrder: 1 },
  ]);

  const [insight] = await db
    .insert(dok3Insights)
    .values({
      brainliftId: BRAINLIFT_ID,
      text: 'A DOK3 insight body',
    })
    .returning();
  INSIGHT_ID = insight.id;

  const [spov] = await db
    .insert(dok4Spovs)
    .values({
      brainliftId: BRAINLIFT_ID,
      text: 'A DOK4 SPOV body',
    })
    .returning();
  SPOV_ID = spov.id;
});

afterAll(async () => {
  await db.delete(dok2Points).where(eq(dok2Points.summaryId, SUMMARY_ID)).catch(() => {});
  await db.delete(dok2Summaries).where(eq(dok2Summaries.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(dok3Insights).where(eq(dok3Insights.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(dok4Spovs).where(eq(dok4Spovs.brainliftId, BRAINLIFT_ID)).catch(() => {});
  await db.delete(brainlifts).where(eq(brainlifts.id, BRAINLIFT_ID)).catch(() => {});
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('assembleTextForEntity -- DOK2', () => {
  it('concatenates points by sortOrder ASC separated by \\n\\n', async () => {
    const text = await assembleTextForEntity('dok2_summary', SUMMARY_ID, BRAINLIFT_ID);
    expect(text).toBe('first\n\nsecond\n\nthird');
  });

  it('returns empty string for a summary with zero points (no throw)', async () => {
    const text = await assembleTextForEntity('dok2_summary', SUMMARY_EMPTY_ID, BRAINLIFT_ID);
    expect(text).toBe('');
  });
});

describe('assembleTextForEntity -- DOK3', () => {
  it('returns insights.text verbatim', async () => {
    const text = await assembleTextForEntity('dok3_insight', INSIGHT_ID, BRAINLIFT_ID);
    expect(text).toBe('A DOK3 insight body');
  });

  it('throws NotFoundError when insight does not exist', async () => {
    await expect(
      assembleTextForEntity('dok3_insight', 9_999_999, BRAINLIFT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when brainliftId does not match', async () => {
    await expect(
      assembleTextForEntity('dok3_insight', INSIGHT_ID, BRAINLIFT_ID + 99999),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('assembleTextForEntity -- DOK4', () => {
  it('returns spov.text verbatim', async () => {
    const text = await assembleTextForEntity('dok4_spov', SPOV_ID, BRAINLIFT_ID);
    expect(text).toBe('A DOK4 SPOV body');
  });

  it('throws NotFoundError when SPOV does not exist', async () => {
    await expect(
      assembleTextForEntity('dok4_spov', 9_999_999, BRAINLIFT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
