/**
 * Tests for FR2+FR4+FR5: Native Brainlift Storage
 *
 * Tests storage functions against a real local database (Docker Postgres).
 * Uses beforeAll/afterAll for test isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import { brainlifts, nativeBrainliftDetails, builderExperts, experts, facts, user } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  createNativeBrainlift,
  getNativeDetailsBySlug,
  updateNativeDetailsForBrainlift,
  setBuilderSuggestionState,
} from '../native-brainlifts';
import { deleteBrainlift, getLearningStreamContext, deriveTwitterHandle } from '../brainlifts';

// Track created brainlift IDs for cleanup
const createdBrainliftIds: number[] = [];
const TEST_USER_ID = 'test-native-bl-' + Date.now();

beforeAll(async () => {
  // Create a test user to satisfy FK constraint
  await db.insert(user).values({
    id: TEST_USER_ID,
    name: 'Native BL Test User',
    email: `native-bl-test-${Date.now()}@test.com`,
    emailVerified: false,
  });
});

afterAll(async () => {
  // Clean up all test data
  for (const id of createdBrainliftIds) {
    await db.delete(builderExperts).where(eq(builderExperts.brainliftId, id)).catch(() => {});
    await db.delete(nativeBrainliftDetails).where(eq(nativeBrainliftDetails.brainliftId, id)).catch(() => {});
    await db.delete(experts).where(eq(experts.brainliftId, id)).catch(() => {});
    await db.delete(facts).where(eq(facts.brainliftId, id)).catch(() => {});
    await db.delete(brainlifts).where(eq(brainlifts.id, id)).catch(() => {});
  }
  // Clean up test user
  await db.delete(user).where(eq(user.id, TEST_USER_ID)).catch(() => {});
});

describe('createNativeBrainlift (FR2)', () => {
  it('creates a brainlift with sourceType=native and a details row', async () => {
    const result = await createNativeBrainlift({
      topic: 'Test Native Brainlift Topic',
      purpose: 'A purpose that is long enough to pass validation',
      owner: 'Test Owner',
      userId: TEST_USER_ID,
    });

    createdBrainliftIds.push(result.brainlift.id);

    // Parent row checks
    expect(result.brainlift.title).toBe('Test Native Brainlift Topic');
    expect(result.brainlift.description).toBe('A purpose that is long enough to pass validation');
    expect(result.brainlift.author).toBe('Test Owner');
    expect(result.brainlift.sourceType).toBe('native');
    expect(result.brainlift.importStatus).toBe('complete');
    expect(result.brainlift.summary).toEqual({
      totalFacts: 0,
      meanScore: '0',
      score5Count: 0,
      contradictionCount: 0,
    });
    expect(result.brainlift.createdByUserId).toBe(TEST_USER_ID);
    expect(result.brainlift.slug).toBeTruthy();

    // Details row checks
    expect(result.nativeDetails.brainliftId).toBe(result.brainlift.id);
    expect(result.nativeDetails.phaseProgress).toEqual({
      phase1: 'complete',
      phase2: 'in_progress',
      phase3: 'locked',
      phase4: 'locked',
      phase5: 'locked',
    });
    expect(result.nativeDetails.lastActivePhase).toBe(2);
    expect(result.nativeDetails.suggestionStatus).toBe('queued');
    expect(result.nativeDetails.suggestionError).toBeNull();
  });

  it('creates successfully with null owner', async () => {
    const result = await createNativeBrainlift({
      topic: 'Null Owner Topic Test',
      purpose: 'A purpose that is long enough to pass validation checks',
      owner: null,
      userId: TEST_USER_ID,
    });

    createdBrainliftIds.push(result.brainlift.id);

    expect(result.brainlift.author).toBeNull();
  });

  it('generates unique slugs for duplicate titles', async () => {
    const result1 = await createNativeBrainlift({
      topic: 'Duplicate Title Test For Slugs',
      purpose: 'Purpose one that is long enough to pass',
      owner: null,
      userId: TEST_USER_ID,
    });
    createdBrainliftIds.push(result1.brainlift.id);

    const result2 = await createNativeBrainlift({
      topic: 'Duplicate Title Test For Slugs',
      purpose: 'Purpose two that is also long enough to pass',
      owner: null,
      userId: TEST_USER_ID,
    });
    createdBrainliftIds.push(result2.brainlift.id);

    expect(result1.brainlift.slug).not.toBe(result2.brainlift.slug);
  });
});

describe('getNativeDetailsBySlug (FR2)', () => {
  let testSlug: string;
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Get Details Test Topic',
      purpose: 'A purpose for the get details test brainlift',
      owner: 'Details Owner',
      userId: TEST_USER_ID,
    });
    testSlug = result.brainlift.slug;
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('returns NativeDetailsResponse for a native brainlift', async () => {
    const details = await getNativeDetailsBySlug(testSlug);

    expect(details).not.toBeNull();
    expect(details!.topic).toBe('Get Details Test Topic');
    expect(details!.purpose).toBe('A purpose for the get details test brainlift');
    expect(details!.owner).toBe('Details Owner');
    expect(details!.phaseProgress).toEqual({
      phase1: 'complete',
      phase2: 'in_progress',
      phase3: 'locked',
      phase4: 'locked',
      phase5: 'locked',
    });
    expect(details!.lastActivePhase).toBe(2);
    expect(details!.suggestionStatus).toBe('queued');
    expect(details!.suggestionError).toBeNull();
  });

  it('returns null for a non-existent slug', async () => {
    const details = await getNativeDetailsBySlug('nonexistent-slug-' + Date.now());
    expect(details).toBeNull();
  });

  it('returns null for an imported brainlift (no native details row)', async () => {
    // Create a brainlift without a native_brainlift_details row
    const [imported] = await db.insert(brainlifts).values({
      slug: 'imported-test-' + Date.now(),
      title: 'Imported Brainlift',
      description: 'An imported brainlift for testing',
      sourceType: 'html',
      summary: { totalFacts: 5, meanScore: '3.5', score5Count: 1, contradictionCount: 0 },
    }).returning();
    createdBrainliftIds.push(imported.id);

    const details = await getNativeDetailsBySlug(imported.slug);
    expect(details).toBeNull();
  });
});

describe('updateNativeDetailsForBrainlift (FR2)', () => {
  let testBrainliftId: number;
  let testSlug: string;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Update Test Topic',
      purpose: 'A purpose for the update test brainlift',
      owner: 'Update Owner',
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    testSlug = result.brainlift.slug;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('updates topic/purpose/owner on parent row', async () => {
    const updated = await updateNativeDetailsForBrainlift(testBrainliftId, {
      topic: 'Updated Topic',
      purpose: 'Updated purpose that is long enough',
      owner: 'New Owner',
    });

    expect(updated.topic).toBe('Updated Topic');
    expect(updated.purpose).toBe('Updated purpose that is long enough');
    expect(updated.owner).toBe('New Owner');
  });

  it('updates lastActivePhase on details row', async () => {
    const updated = await updateNativeDetailsForBrainlift(testBrainliftId, {
      lastActivePhase: 3,
    });

    expect(updated.lastActivePhase).toBe(3);
  });

  it('handles partial updates (only topic)', async () => {
    const updated = await updateNativeDetailsForBrainlift(testBrainliftId, {
      topic: 'Only Topic Updated',
    });

    expect(updated.topic).toBe('Only Topic Updated');
    // Other fields should remain as previously set
    expect(updated.owner).toBe('New Owner');
    expect(updated.lastActivePhase).toBe(3);
  });

  it('can set owner to null', async () => {
    const updated = await updateNativeDetailsForBrainlift(testBrainliftId, {
      owner: null,
    });

    expect(updated.owner).toBeNull();
  });
});

describe('setBuilderSuggestionState (FR2)', () => {
  let testBrainliftId: number;

  beforeAll(async () => {
    const result = await createNativeBrainlift({
      topic: 'Suggestion State Test Topic',
      purpose: 'A purpose for the suggestion state test',
      owner: null,
      userId: TEST_USER_ID,
    });
    testBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(testBrainliftId);
  });

  it('updates suggestion status to ready', async () => {
    await setBuilderSuggestionState(testBrainliftId, { status: 'ready' });

    const [row] = await db.select({ status: nativeBrainliftDetails.suggestionStatus })
      .from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, testBrainliftId));

    expect(row.status).toBe('ready');
  });

  it('updates suggestion status to failed with error', async () => {
    await setBuilderSuggestionState(testBrainliftId, {
      status: 'failed',
      error: 'AI service timeout',
    });

    const [row] = await db.select({
      status: nativeBrainliftDetails.suggestionStatus,
      error: nativeBrainliftDetails.suggestionError,
    })
      .from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, testBrainliftId));

    expect(row.status).toBe('failed');
    expect(row.error).toBe('AI service timeout');
  });

  it('clears error when setting status back to queued', async () => {
    await setBuilderSuggestionState(testBrainliftId, {
      status: 'queued',
      error: null,
    });

    const [row] = await db.select({
      status: nativeBrainliftDetails.suggestionStatus,
      error: nativeBrainliftDetails.suggestionError,
    })
      .from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, testBrainliftId));

    expect(row.status).toBe('queued');
    expect(row.error).toBeNull();
  });
});

describe('deleteBrainlift with native tables (FR4)', () => {
  it('deletes native_brainlift_details and builder_experts alongside parent', async () => {
    // Create native brainlift
    const result = await createNativeBrainlift({
      topic: 'Delete Test Topic Here',
      purpose: 'A purpose for the delete test brainlift',
      owner: null,
      userId: TEST_USER_ID,
    });
    const blId = result.brainlift.id;

    // Add builder experts
    await db.insert(builderExperts).values([
      {
        brainliftId: blId,
        name: 'Expert A',
        who: 'AI researcher',
        where: 'https://twitter.com/experta',
        origin: 'suggested' as const,
        status: 'saved' as const,
      },
      {
        brainliftId: blId,
        name: 'Expert B',
        who: 'Data scientist',
        where: '@expertb',
        origin: 'manual' as const,
        status: 'pending' as const,
      },
    ]);

    // Verify data exists
    const detailsBefore = await db.select().from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, blId));
    expect(detailsBefore).toHaveLength(1);

    const expertsBefore = await db.select().from(builderExperts)
      .where(eq(builderExperts.brainliftId, blId));
    expect(expertsBefore).toHaveLength(2);

    // Delete
    await deleteBrainlift(blId);

    // Verify everything is gone
    const detailsAfter = await db.select().from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, blId));
    expect(detailsAfter).toHaveLength(0);

    const expertsAfter = await db.select().from(builderExperts)
      .where(eq(builderExperts.brainliftId, blId));
    expect(expertsAfter).toHaveLength(0);

    const brainliftAfter = await db.select().from(brainlifts)
      .where(eq(brainlifts.id, blId));
    expect(brainliftAfter).toHaveLength(0);
  });
});

describe('deriveTwitterHandle (FR5)', () => {
  it('extracts handle from @handle format', () => {
    expect(deriveTwitterHandle('@elonmusk')).toBe('elonmusk');
  });

  it('extracts handle from twitter.com URL', () => {
    expect(deriveTwitterHandle('https://twitter.com/elonmusk')).toBe('elonmusk');
    expect(deriveTwitterHandle('twitter.com/elonmusk')).toBe('elonmusk');
    expect(deriveTwitterHandle('https://www.twitter.com/elonmusk')).toBe('elonmusk');
  });

  it('extracts handle from x.com URL', () => {
    expect(deriveTwitterHandle('https://x.com/elonmusk')).toBe('elonmusk');
    expect(deriveTwitterHandle('x.com/elonmusk')).toBe('elonmusk');
  });

  it('returns null for non-Twitter URLs', () => {
    expect(deriveTwitterHandle('https://linkedin.com/in/someone')).toBeNull();
    expect(deriveTwitterHandle('https://example.com')).toBeNull();
    expect(deriveTwitterHandle('some random text')).toBeNull();
  });

  it('returns null for bare text that is not an @handle', () => {
    expect(deriveTwitterHandle('John Smith')).toBeNull();
    expect(deriveTwitterHandle('expert@company.com')).toBeNull();
  });
});

describe('getLearningStreamContext native fallback (FR5)', () => {
  let nativeBrainliftId: number;
  let importedBrainliftId: number;

  beforeAll(async () => {
    // Create native brainlift with saved builder experts
    const result = await createNativeBrainlift({
      topic: 'Learning Stream Context Test',
      purpose: 'Testing the native fallback for learning stream',
      owner: 'LS Test Owner',
      userId: TEST_USER_ID,
    });
    nativeBrainliftId = result.brainlift.id;
    createdBrainliftIds.push(nativeBrainliftId);

    // Add builder experts (some saved, some not)
    await db.insert(builderExperts).values([
      {
        brainliftId: nativeBrainliftId,
        name: 'Saved Expert',
        who: 'AI researcher',
        where: '@savedexpert',
        origin: 'suggested' as const,
        status: 'saved' as const,
      },
      {
        brainliftId: nativeBrainliftId,
        name: 'URL Expert',
        who: 'Data scientist',
        where: 'https://twitter.com/urlexpert',
        origin: 'manual' as const,
        status: 'saved' as const,
      },
      {
        brainliftId: nativeBrainliftId,
        name: 'Non-Twitter Expert',
        who: 'Researcher',
        where: 'https://linkedin.com/in/researcher',
        origin: 'suggested' as const,
        status: 'saved' as const,
      },
      {
        brainliftId: nativeBrainliftId,
        name: 'Pending Expert',
        who: 'Should not appear',
        where: '@pending',
        origin: 'suggested' as const,
        status: 'pending' as const,
      },
      {
        brainliftId: nativeBrainliftId,
        name: 'Dismissed Expert',
        who: 'Should not appear',
        where: '@dismissed',
        origin: 'suggested' as const,
        status: 'dismissed' as const,
      },
    ]);

    // Create an imported brainlift with facts and ranked experts for comparison
    const defaultSummary = { totalFacts: 2, meanScore: '4', score5Count: 1, contradictionCount: 0 };
    const [imported] = await db.insert(brainlifts).values({
      slug: 'imported-ls-test-' + Date.now(),
      title: 'Imported LS Test',
      description: 'Imported brainlift for LS context test',
      sourceType: 'html',
      summary: defaultSummary,
    }).returning();
    importedBrainliftId = imported.id;
    createdBrainliftIds.push(importedBrainliftId);

    // Add facts to imported brainlift
    await db.insert(facts).values([
      { brainliftId: importedBrainliftId, originalId: '1.1', category: 'Test', fact: 'A high score fact', score: 5, isGradeable: true },
      { brainliftId: importedBrainliftId, originalId: '1.2', category: 'Test', fact: 'A low score fact', score: 1, isGradeable: true },
    ]);

    // Add ranked experts to imported brainlift
    await db.insert(experts).values([
      { brainliftId: importedBrainliftId, name: 'Ranked Expert', rankScore: 8, source: 'listed', isFollowing: true },
    ]);
  });

  it('falls back to saved builder experts for native brainlift with no facts', async () => {
    const context = await getLearningStreamContext(nativeBrainliftId);

    expect(context).not.toBeNull();
    expect(context!.title).toBe('Learning Stream Context Test');
    expect(context!.description).toBe('Testing the native fallback for learning stream');
    expect(context!.facts).toHaveLength(0); // native brainlift has no facts

    // Should have 3 saved builder experts (not pending/dismissed)
    expect(context!.experts).toHaveLength(3);

    // Check Twitter handle derivation
    const savedExpert = context!.experts.find(e => e.name === 'Saved Expert');
    expect(savedExpert).toBeDefined();
    expect(savedExpert!.twitterHandle).toBe('savedexpert');
    expect(savedExpert!.rankScore).toBeNull();

    const urlExpert = context!.experts.find(e => e.name === 'URL Expert');
    expect(urlExpert).toBeDefined();
    expect(urlExpert!.twitterHandle).toBe('urlexpert');

    const nonTwitterExpert = context!.experts.find(e => e.name === 'Non-Twitter Expert');
    expect(nonTwitterExpert).toBeDefined();
    expect(nonTwitterExpert!.twitterHandle).toBeNull();
  });

  it('does not include pending or dismissed experts in fallback', async () => {
    const context = await getLearningStreamContext(nativeBrainliftId);
    const expertNames = context!.experts.map(e => e.name);

    expect(expertNames).not.toContain('Pending Expert');
    expect(expertNames).not.toContain('Dismissed Expert');
  });

  it('returns normal facts and ranked experts for imported brainlifts', async () => {
    const context = await getLearningStreamContext(importedBrainliftId);

    expect(context).not.toBeNull();
    // Should have the high-score fact only (score >= 3)
    expect(context!.facts.length).toBeGreaterThanOrEqual(1);
    expect(context!.facts.some(f => f.fact === 'A high score fact')).toBe(true);

    // Should have the ranked expert
    expect(context!.experts).toHaveLength(1);
    expect(context!.experts[0].name).toBe('Ranked Expert');
    expect(context!.experts[0].rankScore).toBe(8);
  });
});
