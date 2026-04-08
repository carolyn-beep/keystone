/**
 * Tests for FR2: Version History Storage Functions
 *
 * Tests createVersion, getVersionHistory, and pruneVersions against
 * a real local database (Docker Postgres).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import { brainlifts, dokItemVersions } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Will import from the module under test once implemented
import {
  createVersion,
  getVersionHistory,
  pruneVersions,
} from '../versions';

let testBrainliftId: number;

beforeAll(async () => {
  const defaultSummary = { totalFacts: 0, meanScore: '0', score5Count: 0, contradictionCount: 0 };
  const [bl] = await db.insert(brainlifts).values({
    title: 'Versions Test Brainlift',
    slug: 'versions-test-' + Date.now(),
    description: 'Test brainlift for version storage tests',
    summary: defaultSummary,
  }).returning({ id: brainlifts.id });
  testBrainliftId = bl.id;
});

afterAll(async () => {
  // Clean up test rows explicitly in case this suite runs against an older local schema.
  await db.delete(dokItemVersions).where(eq(dokItemVersions.brainliftId, testBrainliftId));
  await db.delete(brainlifts).where(eq(brainlifts.id, testBrainliftId));
});

beforeEach(async () => {
  // Clean all versions for this brainlift before each test
  await db.delete(dokItemVersions).where(eq(dokItemVersions.brainliftId, testBrainliftId));
});

describe('createVersion', () => {
  it('returns versionNumber 0 for first call on an item', async () => {
    const result = await createVersion({
      dokLevel: 1,
      itemId: 9999,
      brainliftId: testBrainliftId,
      textContent: 'Original fact text',
      score: 4,
      feedback: 'Good fact',
    });

    expect(result.versionNumber).toBe(0);
    expect(result.id).toBeGreaterThan(0);
  });

  it('increments versionNumber on sequential calls', async () => {
    const itemId = 9998;
    const v0 = await createVersion({
      dokLevel: 1,
      itemId,
      brainliftId: testBrainliftId,
      textContent: 'Original',
      score: 3,
      feedback: null,
    });
    const v1 = await createVersion({
      dokLevel: 1,
      itemId,
      brainliftId: testBrainliftId,
      textContent: 'Edit 1',
      score: 4,
      feedback: 'Improved',
    });
    const v2 = await createVersion({
      dokLevel: 1,
      itemId,
      brainliftId: testBrainliftId,
      textContent: 'Edit 2',
      score: 5,
      feedback: 'Great',
    });

    expect(v0.versionNumber).toBe(0);
    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);
  });

  it('stores null score for ungraded items', async () => {
    const result = await createVersion({
      dokLevel: 2,
      itemId: 9997,
      brainliftId: testBrainliftId,
      textContent: 'Ungraded summary',
      score: null,
      feedback: null,
    });

    const versions = await getVersionHistory(2, 9997);
    expect(versions[0].score).toBeNull();
  });

  it('stores diagnosis field for DOK2 items', async () => {
    const result = await createVersion({
      dokLevel: 2,
      itemId: 9996,
      brainliftId: testBrainliftId,
      textContent: 'DOK2 summary text',
      score: 3,
      feedback: 'Needs work',
      diagnosis: 'Missing key sources',
    });

    const versions = await getVersionHistory(2, 9996);
    expect(versions[0].diagnosis).toBe('Missing key sources');
  });

  it('stores snapshot text accurately', async () => {
    const longText = 'A detailed fact about something important with special chars: <>&"\'';
    await createVersion({
      dokLevel: 1,
      itemId: 9995,
      brainliftId: testBrainliftId,
      textContent: longText,
      score: 4,
      feedback: 'Accurate',
    });

    const versions = await getVersionHistory(1, 9995);
    expect(versions[0].textContent).toBe(longText);
    expect(versions[0].score).toBe(4);
    expect(versions[0].feedback).toBe('Accurate');
  });
});

describe('getVersionHistory', () => {
  it('returns versions in descending order by versionNumber', async () => {
    const itemId = 9994;
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v0', score: 1, feedback: null });
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v1', score: 2, feedback: null });
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v2', score: 3, feedback: null });

    const history = await getVersionHistory(1, itemId);

    expect(history).toHaveLength(3);
    expect(history[0].versionNumber).toBe(2);
    expect(history[1].versionNumber).toBe(1);
    expect(history[2].versionNumber).toBe(0);
  });

  it('returns empty array for nonexistent item', async () => {
    const history = await getVersionHistory(1, 999999);
    expect(history).toEqual([]);
  });
});

describe('pruneVersions', () => {
  it('is a no-op when 4 or fewer versions exist', async () => {
    const itemId = 9993;
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v0', score: 1, feedback: null });
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v1', score: 2, feedback: null });
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v2', score: 3, feedback: null });
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v3', score: 4, feedback: null });

    const deleted = await pruneVersions(1, itemId);
    expect(deleted).toBe(0);

    const history = await getVersionHistory(1, itemId);
    expect(history).toHaveLength(4);
  });

  it('keeps original (0) + latest 3, deletes middle versions', async () => {
    const itemId = 9992;
    // Create 6 versions: 0, 1, 2, 3, 4, 5
    for (let i = 0; i < 6; i++) {
      await createVersion({
        dokLevel: 1,
        itemId,
        brainliftId: testBrainliftId,
        textContent: `v${i}`,
        score: i,
        feedback: null,
      });
    }

    const deleted = await pruneVersions(1, itemId);
    expect(deleted).toBe(2); // versions 1 and 2 deleted

    const history = await getVersionHistory(1, itemId);
    expect(history).toHaveLength(4);
    const versionNumbers = history.map(v => v.versionNumber).sort((a, b) => a - b);
    expect(versionNumbers).toEqual([0, 3, 4, 5]);
  });

  it('never deletes versionNumber 0 (original)', async () => {
    const itemId = 9991;
    for (let i = 0; i < 7; i++) {
      await createVersion({
        dokLevel: 1,
        itemId,
        brainliftId: testBrainliftId,
        textContent: `v${i}`,
        score: i,
        feedback: null,
      });
    }

    await pruneVersions(1, itemId);

    const history = await getVersionHistory(1, itemId);
    const hasOriginal = history.some(v => v.versionNumber === 0);
    expect(hasOriginal).toBe(true);
  });

  it('returns correct count of deleted versions', async () => {
    const itemId = 9990;
    // Create 8 versions: 0-7. Keep 0, 5, 6, 7. Delete 1, 2, 3, 4.
    for (let i = 0; i < 8; i++) {
      await createVersion({
        dokLevel: 1,
        itemId,
        brainliftId: testBrainliftId,
        textContent: `v${i}`,
        score: i,
        feedback: null,
      });
    }

    const deleted = await pruneVersions(1, itemId);
    expect(deleted).toBe(4);
  });

  it('returns 0 when only original exists', async () => {
    const itemId = 9989;
    await createVersion({ dokLevel: 1, itemId, brainliftId: testBrainliftId, textContent: 'v0', score: 1, feedback: null });

    const deleted = await pruneVersions(1, itemId);
    expect(deleted).toBe(0);
  });
});
