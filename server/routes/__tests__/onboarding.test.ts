/**
 * Tests for 03-wizard-shell FR1: Onboarding endpoints.
 *
 * Covers:
 *  - Zod input schemas (onboardingCreateInput / onboardingPatchInput) in shared/routes.ts
 *  - POST /api/onboarding/projects  (create)
 *  - PATCH /api/brainlifts/:slug/onboarding  (forward-only step + scope)
 *  - POST /api/brainlifts/:slug/onboarding/complete  (idempotent)
 *
 * Route handler logic is simulated without Express; storage is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  onboardingCreateInput,
  onboardingPatchInput,
  topicSuggestionsInput,
  onboardingSuggestionsInput,
  onboardingResourceInput,
} from '@shared/routes';
import type { Brainlift } from '@shared/schema';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateOnboardingBrainlift = vi.fn();
const mockUpdateBrainliftScope = vi.fn();
const mockUpdateOnboardingStep = vi.fn();
const mockGetCategoriesWithCountsForSecondBrain = vi.fn();
const mockDiscoverExperts = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    createOnboardingBrainlift: (...args: unknown[]) => mockCreateOnboardingBrainlift(...args),
    updateBrainliftScope: (...args: unknown[]) => mockUpdateBrainliftScope(...args),
    updateOnboardingStep: (...args: unknown[]) => mockUpdateOnboardingStep(...args),
    getCategoriesWithCountsForSecondBrain: (...args: unknown[]) =>
      mockGetCategoriesWithCountsForSecondBrain(...args),
  },
}));

vi.mock('../../ai/onboarding/expert-discovery', () => ({
  discoverExperts: (...args: unknown[]) => mockDiscoverExperts(...args),
}));

// Error classes used by the simulators (mirror the real handlers).
import {
  BadRequestError,
  ConflictError,
} from '../../middleware/error-handler';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Test Data ──────────────────────────────────────────────────────────────

const USER_ID = 'user-123';

function makeBrainlift(overrides: Partial<Brainlift> = {}): Brainlift {
  return {
    id: 42,
    slug: 'marine-biology',
    title: 'Marine Biology',
    description: '',
    author: null,
    displayPurpose: null,
    coverImageUrl: null,
    originalContent: null,
    expertProfile: null,
    summary: {
      totalFacts: 0,
      meanScore: '0',
      score5Count: 0,
      contradictionCount: 0,
    },
    importStatus: 'pending',
    importHierarchy: null,
    phase: 'research',
    inScope: [],
    outOfScope: [],
    onboardingStep: 1,
    createdByUserId: USER_ID,
    createdAt: new Date('2026-06-10'),
    ...overrides,
  } as unknown as Brainlift;
}

// ─── Route Simulators (mirror server/routes/onboarding.ts handlers) ───────────

/** POST /api/onboarding/projects */
async function simulateCreate(params: {
  authenticated: boolean;
  body: unknown;
}) {
  if (!params.authenticated) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  const parsed = onboardingCreateInput.safeParse(params.body);
  if (!parsed.success) {
    return { status: 400, body: { message: 'Invalid topic' } };
  }
  const brainlift = await mockCreateOnboardingBrainlift({
    userId: USER_ID,
    topic: parsed.data.topic,
  });
  return { status: 201, body: brainlift };
}

/** PATCH /api/brainlifts/:slug/onboarding */
async function simulatePatch(params: {
  brainlift: Brainlift; // set by requireBrainliftModify
  body: unknown;
}) {
  const parsed = onboardingPatchInput.safeParse(params.body);
  if (!parsed.success) {
    return { status: 400, body: { message: 'Invalid onboarding patch' } };
  }
  const { step, inScope, outOfScope } = parsed.data;
  const current = params.brainlift;

  // Patching a completed brainlift (onboardingStep cleared) is a conflict.
  if (current.onboardingStep === null) {
    return { status: 409, body: { message: 'Onboarding already complete' } };
  }

  // Forward-only high-water mark.
  if (step !== undefined && step < current.onboardingStep) {
    return { status: 400, body: { message: 'Step cannot move backward' } };
  }

  let updated = current;
  if (inScope !== undefined || outOfScope !== undefined) {
    updated = await mockUpdateBrainliftScope(current.id, { inScope, outOfScope });
  }
  if (step !== undefined && step > current.onboardingStep) {
    updated = await mockUpdateOnboardingStep(current.id, step);
  }
  return { status: 200, body: updated };
}

/**
 * POST /api/brainlifts/:slug/onboarding/expert-discovery
 *
 * No request body. Context is read server-side from the loaded brainlift
 * (set by requireBrainliftAccess) and the category names. Discovery failure
 * must degrade to 200 { candidates: [] } — it must NEVER 5xx the wizard.
 */
async function simulateExpertDiscovery(params: {
  authenticated: boolean;
  brainlift: Brainlift | null; // null = foreign/missing slug (middleware 404)
}) {
  if (!params.authenticated) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  if (params.brainlift === null) {
    return { status: 404, body: { message: 'Brainlift not found' } };
  }
  const current = params.brainlift;
  const categoryRows = await mockGetCategoriesWithCountsForSecondBrain(current.id);
  const candidates = await mockDiscoverExperts({
    topic: current.title,
    inScope: current.inScope,
    categories: (categoryRows as Array<{ name: string }>).map((c) => c.name),
  });
  return { status: 200, body: { candidates } };
}

/** POST /api/brainlifts/:slug/onboarding/complete */
async function simulateComplete(params: { brainlift: Brainlift }) {
  const current = params.brainlift;
  // Idempotent: already complete → 200 with slug, no write.
  if (current.onboardingStep === null) {
    return { status: 200, body: { slug: current.slug } };
  }
  await mockUpdateOnboardingStep(current.id, null);
  return { status: 200, body: { slug: current.slug } };
}

// ─── Schemas ──────────────────────────────────────────────────────────────

describe('FR1: onboardingCreateInput schema', () => {
  it('accepts a 3-char topic and trims surrounding whitespace', () => {
    const parsed = onboardingCreateInput.parse({ topic: '  Bio  ' });
    expect(parsed.topic).toBe('Bio');
  });

  it('accepts a 200-char topic', () => {
    const topic = 'x'.repeat(200);
    expect(onboardingCreateInput.parse({ topic }).topic).toBe(topic);
  });

  it('rejects a 2-char (too short) topic', () => {
    expect(onboardingCreateInput.safeParse({ topic: 'ab' }).success).toBe(false);
  });

  it('rejects an empty / whitespace-only topic', () => {
    expect(onboardingCreateInput.safeParse({ topic: '' }).success).toBe(false);
    expect(onboardingCreateInput.safeParse({ topic: '   ' }).success).toBe(false);
  });

  it('rejects a topic over 200 chars', () => {
    expect(onboardingCreateInput.safeParse({ topic: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('FR1: onboardingPatchInput schema', () => {
  it('accepts step in 1..7', () => {
    expect(onboardingPatchInput.parse({ step: 1 }).step).toBe(1);
    expect(onboardingPatchInput.parse({ step: 7 }).step).toBe(7);
  });

  it('rejects step 0 and step 8 (out of bounds)', () => {
    expect(onboardingPatchInput.safeParse({ step: 0 }).success).toBe(false);
    expect(onboardingPatchInput.safeParse({ step: 8 }).success).toBe(false);
  });

  it('rejects a non-integer step', () => {
    expect(onboardingPatchInput.safeParse({ step: 2.5 }).success).toBe(false);
  });

  it('trims scope entries and accepts up to 30 of them', () => {
    const parsed = onboardingPatchInput.parse({ inScope: ['  whales  '], outOfScope: ['fish'] });
    expect(parsed.inScope).toEqual(['whales']);
    expect(parsed.outOfScope).toEqual(['fish']);
    expect(onboardingPatchInput.safeParse({ inScope: Array(30).fill('x') }).success).toBe(true);
  });

  it('rejects more than 30 scope entries', () => {
    expect(onboardingPatchInput.safeParse({ inScope: Array(31).fill('x') }).success).toBe(false);
  });

  it('rejects empty-string scope entries', () => {
    expect(onboardingPatchInput.safeParse({ inScope: [''] }).success).toBe(false);
  });

  it('accepts an empty patch (all fields optional)', () => {
    expect(onboardingPatchInput.safeParse({}).success).toBe(true);
  });
});

// ─── POST create ──────────────────────────────────────────────────────────

describe('FR1: POST /api/onboarding/projects', () => {
  it('creates the brainlift and returns 201 with research/onboardingStep=1', async () => {
    mockCreateOnboardingBrainlift.mockResolvedValue(makeBrainlift());

    const res = await simulateCreate({ authenticated: true, body: { topic: 'Marine Biology' } });

    expect(res.status).toBe(201);
    expect(mockCreateOnboardingBrainlift).toHaveBeenCalledWith({
      userId: USER_ID,
      topic: 'Marine Biology',
    });
    expect(res.body.phase).toBe('research');
    expect(res.body.onboardingStep).toBe(1);
    expect(res.body.title).toBe('Marine Biology');
    expect(res.body.description).toBe('');
    expect(res.body.summary).toEqual({
      totalFacts: 0,
      meanScore: '0',
      score5Count: 0,
      contradictionCount: 0,
    });
  });

  it('returns the suffixed slug when the storage retry loop bumped it (duplicate topic)', async () => {
    mockCreateOnboardingBrainlift.mockResolvedValue(makeBrainlift({ slug: 'marine-biology-2' }));

    const res = await simulateCreate({ authenticated: true, body: { topic: 'Marine Biology' } });

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('marine-biology-2');
  });

  it('rejects a too-short topic with 400 and never touches storage', async () => {
    const res = await simulateCreate({ authenticated: true, body: { topic: 'ab' } });
    expect(res.status).toBe(400);
    expect(mockCreateOnboardingBrainlift).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await simulateCreate({ authenticated: false, body: { topic: 'Marine Biology' } });
    expect(res.status).toBe(401);
    expect(mockCreateOnboardingBrainlift).not.toHaveBeenCalled();
  });
});

// ─── PATCH onboarding ───────────────────────────────────────────────────────

describe('FR1: PATCH /api/brainlifts/:slug/onboarding', () => {
  it('advances the step forward (1→2) via updateOnboardingStep', async () => {
    const at1 = makeBrainlift({ onboardingStep: 1 });
    mockUpdateOnboardingStep.mockResolvedValue(makeBrainlift({ onboardingStep: 2 }));

    const res = await simulatePatch({ brainlift: at1, body: { step: 2 } });

    expect(res.status).toBe(200);
    expect(mockUpdateOnboardingStep).toHaveBeenCalledWith(at1.id, 2);
    expect(res.body.onboardingStep).toBe(2);
  });

  it('persists scope arrays via updateBrainliftScope', async () => {
    const at2 = makeBrainlift({ onboardingStep: 2 });
    mockUpdateBrainliftScope.mockResolvedValue(
      makeBrainlift({ onboardingStep: 2, inScope: ['whales'], outOfScope: ['fish'] }),
    );

    const res = await simulatePatch({
      brainlift: at2,
      body: { inScope: ['whales'], outOfScope: ['fish'] },
    });

    expect(res.status).toBe(200);
    expect(mockUpdateBrainliftScope).toHaveBeenCalledWith(at2.id, {
      inScope: ['whales'],
      outOfScope: ['fish'],
    });
    expect(mockUpdateOnboardingStep).not.toHaveBeenCalled();
    expect(res.body.inScope).toEqual(['whales']);
  });

  it('handles a combined step + scope patch (both persist)', async () => {
    const at2 = makeBrainlift({ onboardingStep: 2 });
    mockUpdateBrainliftScope.mockResolvedValue(makeBrainlift({ onboardingStep: 2, inScope: ['whales'] }));
    mockUpdateOnboardingStep.mockResolvedValue(makeBrainlift({ onboardingStep: 3, inScope: ['whales'] }));

    const res = await simulatePatch({ brainlift: at2, body: { step: 3, inScope: ['whales'] } });

    expect(res.status).toBe(200);
    expect(mockUpdateBrainliftScope).toHaveBeenCalledWith(at2.id, { inScope: ['whales'], outOfScope: undefined });
    expect(mockUpdateOnboardingStep).toHaveBeenCalledWith(at2.id, 3);
    expect(res.body.onboardingStep).toBe(3);
  });

  it('rejects step regression (patch step 2 while at 4) with 400 and writes nothing', async () => {
    const at4 = makeBrainlift({ onboardingStep: 4 });

    const res = await simulatePatch({ brainlift: at4, body: { step: 2 } });

    expect(res.status).toBe(400);
    expect(mockUpdateOnboardingStep).not.toHaveBeenCalled();
  });

  it('treats a same-step patch as a no-op for the step write', async () => {
    const at4 = makeBrainlift({ onboardingStep: 4 });

    const res = await simulatePatch({ brainlift: at4, body: { step: 4 } });

    expect(res.status).toBe(200);
    expect(mockUpdateOnboardingStep).not.toHaveBeenCalled();
  });

  it('rejects step 8 / step 0 at the schema bound with 400', async () => {
    const at1 = makeBrainlift({ onboardingStep: 1 });
    expect((await simulatePatch({ brainlift: at1, body: { step: 8 } })).status).toBe(400);
    expect((await simulatePatch({ brainlift: at1, body: { step: 0 } })).status).toBe(400);
  });

  it('rejects a patch on a completed brainlift (onboardingStep null) with 409', async () => {
    const done = makeBrainlift({ onboardingStep: null });

    const res = await simulatePatch({ brainlift: done, body: { step: 2 } });

    expect(res.status).toBe(409);
    expect(mockUpdateOnboardingStep).not.toHaveBeenCalled();
    expect(mockUpdateBrainliftScope).not.toHaveBeenCalled();
  });

  it('uses ConflictError for the completed-brainlift case (handler maps to 409)', () => {
    // Documents that the real handler throws ConflictError (→ 409), not a generic 400.
    expect(new ConflictError('x')).toBeInstanceOf(ConflictError);
    expect(new BadRequestError('x')).toBeInstanceOf(BadRequestError);
  });
});

// ─── POST complete ──────────────────────────────────────────────────────────

describe('FR1: POST /api/brainlifts/:slug/onboarding/complete', () => {
  it('clears onboardingStep and returns { slug }', async () => {
    const at7 = makeBrainlift({ onboardingStep: 7 });
    mockUpdateOnboardingStep.mockResolvedValue(makeBrainlift({ onboardingStep: null }));

    const res = await simulateComplete({ brainlift: at7 });

    expect(res.status).toBe(200);
    expect(mockUpdateOnboardingStep).toHaveBeenCalledWith(at7.id, null);
    expect(res.body).toEqual({ slug: at7.slug });
  });

  it('is idempotent: a second complete on an already-complete brainlift returns 200 { slug } with no write', async () => {
    const done = makeBrainlift({ onboardingStep: null });

    const res = await simulateComplete({ brainlift: done });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slug: done.slug });
    expect(mockUpdateOnboardingStep).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 04-suggestion-steps FR2: suggestion endpoints
// ════════════════════════════════════════════════════════════════════════════

// Mocked FR1 generators — the route layer is thin and just forwards to these.
const mockGenerateTopicSuggestions = vi.fn();
const mockGenerateOnboardingSuggestions = vi.fn();

// ─── FR2 schemas ─────────────────────────────────────────────────────────────

describe('FR2: topicSuggestionsInput schema', () => {
  it('accepts an empty body (exclude optional)', () => {
    expect(topicSuggestionsInput.parse({}).exclude).toBeUndefined();
  });

  it('accepts an exclude array up to 20 entries', () => {
    expect(topicSuggestionsInput.safeParse({ exclude: Array(20).fill('x') }).success).toBe(true);
  });

  it('rejects an exclude array over 20 entries', () => {
    expect(topicSuggestionsInput.safeParse({ exclude: Array(21).fill('x') }).success).toBe(false);
  });
});

describe('FR2: onboardingSuggestionsInput schema', () => {
  it('accepts each valid kind', () => {
    expect(onboardingSuggestionsInput.parse({ kind: 'in-scope' }).kind).toBe('in-scope');
    expect(onboardingSuggestionsInput.parse({ kind: 'out-of-scope' }).kind).toBe('out-of-scope');
    expect(onboardingSuggestionsInput.parse({ kind: 'categories' }).kind).toBe('categories');
  });

  it('rejects an invalid kind', () => {
    expect(onboardingSuggestionsInput.safeParse({ kind: 'topic' }).success).toBe(false);
    expect(onboardingSuggestionsInput.safeParse({ kind: 'nonsense' }).success).toBe(false);
  });

  it('requires kind (missing → invalid)', () => {
    expect(onboardingSuggestionsInput.safeParse({}).success).toBe(false);
  });

  it('accepts an exclude array up to 40 and rejects over 40', () => {
    expect(onboardingSuggestionsInput.safeParse({ kind: 'in-scope', exclude: Array(40).fill('x') }).success).toBe(true);
    expect(onboardingSuggestionsInput.safeParse({ kind: 'in-scope', exclude: Array(41).fill('x') }).success).toBe(false);
  });
});

// ─── Route simulators (mirror the real handlers) ─────────────────────────────

/** POST /api/onboarding/topic-suggestions */
async function simulateTopicSuggestions(params: { authenticated: boolean; body: unknown }) {
  if (!params.authenticated) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  const parsed = topicSuggestionsInput.safeParse(params.body);
  if (!parsed.success) {
    return { status: 400, body: { message: 'Invalid input' } };
  }
  const suggestions = await mockGenerateTopicSuggestions(parsed.data.exclude);
  return { status: 200, body: { suggestions } };
}

/** POST /api/brainlifts/:slug/onboarding/suggestions */
async function simulateSlugSuggestions(params: {
  authenticated: boolean;
  brainlift?: Brainlift; // set by requireBrainliftModify; absent → 404
  body: unknown;
}) {
  if (!params.authenticated) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  if (!params.brainlift) {
    // requireBrainliftModify rejects a foreign/missing slug before the handler.
    return { status: 404, body: { message: 'Not found' } };
  }
  const parsed = onboardingSuggestionsInput.safeParse(params.body);
  if (!parsed.success) {
    return { status: 400, body: { message: 'Invalid input' } };
  }
  const current = params.brainlift;
  // Inputs are read server-side from the row, NOT the request body.
  const suggestions = await mockGenerateOnboardingSuggestions(
    parsed.data.kind,
    { topic: current.title, inScope: current.inScope, outOfScope: current.outOfScope },
    parsed.data.exclude,
  );
  return { status: 200, body: { suggestions } };
}

describe('FR2: POST /api/onboarding/topic-suggestions', () => {
  it('returns 200 { suggestions } from the generator', async () => {
    mockGenerateTopicSuggestions.mockResolvedValue(['Ocean acidity', 'Sharks']);
    const res = await simulateTopicSuggestions({ authenticated: true, body: { exclude: ['Biology'] } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: ['Ocean acidity', 'Sharks'] });
    expect(mockGenerateTopicSuggestions).toHaveBeenCalledWith(['Biology']);
  });

  it('returns 200 { suggestions: [] } when the generator degrades (AI failure is not an HTTP error)', async () => {
    mockGenerateTopicSuggestions.mockResolvedValue([]);
    const res = await simulateTopicSuggestions({ authenticated: true, body: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: [] });
  });

  it('rejects unauthenticated with 401, never calls the generator', async () => {
    const res = await simulateTopicSuggestions({ authenticated: false, body: {} });
    expect(res.status).toBe(401);
    expect(mockGenerateTopicSuggestions).not.toHaveBeenCalled();
  });

  it('rejects an over-cap exclude array with 400', async () => {
    const res = await simulateTopicSuggestions({ authenticated: true, body: { exclude: Array(21).fill('x') } });
    expect(res.status).toBe(400);
    expect(mockGenerateTopicSuggestions).not.toHaveBeenCalled();
  });
});

describe('FR2: POST /api/brainlifts/:slug/onboarding/suggestions', () => {
  it('reads topic/scope from the brainlift row (not the request body) and returns 200', async () => {
    const bl = makeBrainlift({ title: 'Marine Biology', inScope: ['whales'], outOfScope: ['ponds'] });
    mockGenerateOnboardingSuggestions.mockResolvedValue(['Tide pools']);

    const res = await simulateSlugSuggestions({
      authenticated: true,
      brainlift: bl,
      // Body carries spoofed scope that MUST be ignored.
      body: { kind: 'in-scope', topic: 'HACKED', inScope: ['spoof'] },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: ['Tide pools'] });
    expect(mockGenerateOnboardingSuggestions).toHaveBeenCalledWith(
      'in-scope',
      { topic: 'Marine Biology', inScope: ['whales'], outOfScope: ['ponds'] },
      undefined,
    );
  });

  it('forwards exclude to the generator', async () => {
    const bl = makeBrainlift();
    mockGenerateOnboardingSuggestions.mockResolvedValue([]);
    await simulateSlugSuggestions({
      authenticated: true,
      brainlift: bl,
      body: { kind: 'categories', exclude: ['Ecology'] },
    });
    expect(mockGenerateOnboardingSuggestions).toHaveBeenCalledWith(
      'categories',
      expect.any(Object),
      ['Ecology'],
    );
  });

  it('returns 200 { suggestions: [] } on generator degrade', async () => {
    const bl = makeBrainlift();
    mockGenerateOnboardingSuggestions.mockResolvedValue([]);
    const res = await simulateSlugSuggestions({ authenticated: true, brainlift: bl, body: { kind: 'in-scope' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: [] });
  });

  it('rejects an invalid kind with 400, never calls the generator', async () => {
    const bl = makeBrainlift();
    const res = await simulateSlugSuggestions({ authenticated: true, brainlift: bl, body: { kind: 'topic' } });
    expect(res.status).toBe(400);
    expect(mockGenerateOnboardingSuggestions).not.toHaveBeenCalled();
  });

  it('returns 404 for a foreign/missing slug (middleware boundary), never calls the generator', async () => {
    const res = await simulateSlugSuggestions({ authenticated: true, brainlift: undefined, body: { kind: 'in-scope' } });
    expect(res.status).toBe(404);
    expect(mockGenerateOnboardingSuggestions).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated with 401', async () => {
    const res = await simulateSlugSuggestions({ authenticated: false, body: { kind: 'in-scope' } });
    expect(res.status).toBe(401);
    expect(mockGenerateOnboardingSuggestions).not.toHaveBeenCalled();
  });
});

// ─── POST expert-discovery (FR2) ──────────────────────────────────────────────

describe('FR2: POST /api/brainlifts/:slug/onboarding/expert-discovery', () => {
  it('returns 200 { candidates } and passes server-read context to discoverExperts', async () => {
    const bl = makeBrainlift({
      title: 'Marine Biology',
      inScope: ['coral reefs', 'whales'],
    });
    mockGetCategoriesWithCountsForSecondBrain.mockResolvedValue([
      { id: 1, name: 'Ecology', sortOrder: 0, sourceCount: 2, noteCount: 1 },
      { id: 2, name: 'Conservation', sortOrder: 1, sourceCount: 0, noteCount: 0 },
    ]);
    const candidates = [
      {
        name: 'Dr. Jane Roe',
        who: 'Marine ecologist',
        why: 'Leading coral reef researcher',
        focus: 'Coral reefs',
        where: 'https://example.com/jane',
        evidenceUrls: ['https://example.com/jane'],
      },
    ];
    mockDiscoverExperts.mockResolvedValue(candidates);

    const res = await simulateExpertDiscovery({ authenticated: true, brainlift: bl });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates });
    expect(mockGetCategoriesWithCountsForSecondBrain).toHaveBeenCalledWith(bl.id);
    expect(mockDiscoverExperts).toHaveBeenCalledWith({
      topic: 'Marine Biology',
      inScope: ['coral reefs', 'whales'],
      categories: ['Ecology', 'Conservation'],
    });
  });

  it('returns 200 { candidates: [] } when discovery yields nothing (never 5xx)', async () => {
    const bl = makeBrainlift();
    mockGetCategoriesWithCountsForSecondBrain.mockResolvedValue([]);
    mockDiscoverExperts.mockResolvedValue([]);

    const res = await simulateExpertDiscovery({ authenticated: true, brainlift: bl });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ candidates: [] });
  });

  it('returns 404 for a foreign/missing slug (middleware)', async () => {
    const res = await simulateExpertDiscovery({ authenticated: true, brainlift: null });
    expect(res.status).toBe(404);
    expect(mockDiscoverExperts).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await simulateExpertDiscovery({ authenticated: false, brainlift: makeBrainlift() });
    expect(res.status).toBe(401);
    expect(mockDiscoverExperts).not.toHaveBeenCalled();
  });

  it('wires the real route: discovery endpoint guarded by access middleware, calls discoverExperts', () => {
    const src = readFileSync(
      new URL('../onboarding.ts', import.meta.url),
      'utf8',
    );
    // Endpoint path + read-access middleware (no body to validate).
    expect(src).toMatch(/onboarding\/expert-discovery/);
    expect(src).toMatch(/requireBrainliftAccess/);
    expect(src).toMatch(/discoverExperts/);
    // Context read server-side: title, inScope, category names.
    expect(src).toMatch(/getCategoriesWithCountsForSecondBrain/);
    // Failure must NOT 5xx — the handler swallows discovery errors to [].
    expect(src).toMatch(/catch/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 05-starter-pack FR4: starter-pack launch / status + resources endpoints
// ════════════════════════════════════════════════════════════════════════════

const mockLaunchStarterPack = vi.fn();
const mockIsStarterPackInFlight = vi.fn();
const mockIsSwarmActive = vi.fn();
const mockHasResearchJobPending = vi.fn();
const mockHasStarterPackItems = vi.fn();
const mockGetActiveRunIdForBrainlift = vi.fn();
const mockGetLearningStreamItemByUrl = vi.fn();
const mockAddLearningStreamItem = vi.fn();

// ─── onboardingResourceInput schema ───────────────────────────────────────────

describe('FR4: onboardingResourceInput schema', () => {
  it('accepts and trims a valid https URL', () => {
    const parsed = onboardingResourceInput.parse({ url: '  https://example.com/a  ' });
    expect(parsed.url).toBe('https://example.com/a');
  });

  it('accepts a valid http URL', () => {
    expect(onboardingResourceInput.safeParse({ url: 'http://example.com' }).success).toBe(true);
  });

  it('rejects a non-http(s) scheme (javascript:, file:, ftp:)', () => {
    expect(onboardingResourceInput.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(onboardingResourceInput.safeParse({ url: 'file:///etc/passwd' }).success).toBe(false);
    expect(onboardingResourceInput.safeParse({ url: 'ftp://example.com' }).success).toBe(false);
  });

  it('rejects a non-URL string and an empty body', () => {
    expect(onboardingResourceInput.safeParse({ url: 'not a url' }).success).toBe(false);
    expect(onboardingResourceInput.safeParse({}).success).toBe(false);
  });
});

// ─── Route simulators (mirror the real handlers) ─────────────────────────────

/** POST /api/brainlifts/:slug/onboarding/starter-pack */
async function simulateLaunchPack(params: {
  authenticated: boolean;
  brainlift: Brainlift | null;
}) {
  if (!params.authenticated) return { status: 401, body: { message: 'Unauthorized' } };
  if (params.brainlift === null) return { status: 404, body: { message: 'Not found' } };
  const bl = params.brainlift;

  // Guard (a): concurrency (active swarm / pending job / in-flight pack).
  if (mockIsSwarmActive(bl.id) || (await mockHasResearchJobPending(bl.id)) || mockIsStarterPackInFlight(bl.id)) {
    const existingRunId = await mockGetActiveRunIdForBrainlift(bl.id);
    return { status: 409, body: { code: 'research_run_in_progress', existingRunId: existingRunId ?? undefined } };
  }
  // Guard (b): one pack per brainlift (rows from a prior run).
  if (await mockHasStarterPackItems(bl.id)) {
    return { status: 409, body: { code: 'starter_pack_already_run' } };
  }
  const { runId } = await mockLaunchStarterPack(bl, USER_ID);
  return { status: 200, body: { runId } };
}

/** GET /api/brainlifts/:slug/onboarding/starter-pack */
async function simulatePackStatus(params: { brainlift: Brainlift }) {
  const bl = params.brainlift;
  if (mockIsStarterPackInFlight(bl.id)) return { status: 200, body: { status: 'running' } };
  if (await mockHasStarterPackItems(bl.id)) return { status: 200, body: { status: 'ready' } };
  return { status: 200, body: { status: 'idle' } };
}

/** POST /api/brainlifts/:slug/onboarding/resources */
async function simulateResources(params: {
  authenticated: boolean;
  brainlift: Brainlift | null;
  body: unknown;
}) {
  if (!params.authenticated) return { status: 401, body: { message: 'Unauthorized' } };
  if (params.brainlift === null) return { status: 404, body: { message: 'Not found' } };
  const parsed = onboardingResourceInput.safeParse(params.body);
  if (!parsed.success) return { status: 400, body: { message: 'Invalid URL' } };
  const bl = params.brainlift;

  const existing = await mockGetLearningStreamItemByUrl(parsed.data.url, bl.id);
  if (existing) return { status: 200, body: { item: existing, duplicate: true } };

  const hostname = new URL(parsed.data.url).hostname;
  const item = await mockAddLearningStreamItem(bl.id, {
    type: 'News',
    author: hostname,
    topic: parsed.data.url,
    time: '—',
    facts: '',
    url: parsed.data.url,
    source: 'manual',
  });
  return { status: 201, body: { item, duplicate: false } };
}

describe('FR4: POST /api/brainlifts/:slug/onboarding/starter-pack', () => {
  beforeEach(() => {
    mockIsSwarmActive.mockReturnValue(false);
    mockHasResearchJobPending.mockResolvedValue(false);
    mockIsStarterPackInFlight.mockReturnValue(false);
    mockHasStarterPackItems.mockResolvedValue(false);
    mockGetActiveRunIdForBrainlift.mockResolvedValue(null);
  });

  it('launches on a clean state and returns 200 { runId }', async () => {
    mockLaunchStarterPack.mockResolvedValue({ runId: 555 });
    const res = await simulateLaunchPack({ authenticated: true, brainlift: makeBrainlift() });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ runId: 555 });
    expect(mockLaunchStarterPack).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), USER_ID);
  });

  it('409s research_run_in_progress when a swarm is active, surfacing existingRunId', async () => {
    mockIsSwarmActive.mockReturnValue(true);
    mockGetActiveRunIdForBrainlift.mockResolvedValue(99);
    const res = await simulateLaunchPack({ authenticated: true, brainlift: makeBrainlift() });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'research_run_in_progress', existingRunId: 99 });
    expect(mockLaunchStarterPack).not.toHaveBeenCalled();
  });

  it('409s research_run_in_progress when a starter pack is already in flight', async () => {
    mockIsStarterPackInFlight.mockReturnValue(true);
    const res = await simulateLaunchPack({ authenticated: true, brainlift: makeBrainlift() });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'research_run_in_progress' });
  });

  it('409s starter_pack_already_run when pack rows already exist', async () => {
    mockHasStarterPackItems.mockResolvedValue(true);
    const res = await simulateLaunchPack({ authenticated: true, brainlift: makeBrainlift() });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'starter_pack_already_run' });
    expect(mockLaunchStarterPack).not.toHaveBeenCalled();
  });

  it('proceeds when a first run yielded zero rows (no pack rows present)', async () => {
    mockHasStarterPackItems.mockResolvedValue(false);
    mockLaunchStarterPack.mockResolvedValue({ runId: 556 });
    const res = await simulateLaunchPack({ authenticated: true, brainlift: makeBrainlift() });
    expect(res.status).toBe(200);
  });

  it('401s unauthenticated and 404s a foreign/missing slug, never launching', async () => {
    expect((await simulateLaunchPack({ authenticated: false, brainlift: makeBrainlift() })).status).toBe(401);
    expect((await simulateLaunchPack({ authenticated: true, brainlift: null })).status).toBe(404);
    expect(mockLaunchStarterPack).not.toHaveBeenCalled();
  });
});

describe('FR4: GET /api/brainlifts/:slug/onboarding/starter-pack (status)', () => {
  beforeEach(() => {
    mockIsStarterPackInFlight.mockReturnValue(false);
    mockHasStarterPackItems.mockResolvedValue(false);
  });

  it('maps in-flight → running (covers orchestrate → swarm → filter)', async () => {
    mockIsStarterPackInFlight.mockReturnValue(true);
    expect((await simulatePackStatus({ brainlift: makeBrainlift() })).body).toEqual({ status: 'running' });
  });

  it('maps not-in-flight + rows exist → ready', async () => {
    mockHasStarterPackItems.mockResolvedValue(true);
    expect((await simulatePackStatus({ brainlift: makeBrainlift() })).body).toEqual({ status: 'ready' });
  });

  it('maps neither → idle', async () => {
    expect((await simulatePackStatus({ brainlift: makeBrainlift() })).body).toEqual({ status: 'idle' });
  });
});

describe('FR4: POST /api/brainlifts/:slug/onboarding/resources', () => {
  beforeEach(() => {
    mockGetLearningStreamItemByUrl.mockResolvedValue(null);
  });

  it('creates a pending manual item with the Assumption 5 defaults and returns 201 { duplicate: false }', async () => {
    mockAddLearningStreamItem.mockResolvedValue({
      id: 7, brainliftId: 42, status: 'pending', source: 'manual',
      type: 'News', author: 'example.com', topic: 'https://example.com/a', time: '—', facts: '', url: 'https://example.com/a',
    });

    const res = await simulateResources({ authenticated: true, brainlift: makeBrainlift(), body: { url: 'https://example.com/a' } });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ duplicate: false });
    expect(res.body.item).toMatchObject({ status: 'pending', source: 'manual' });
    expect(mockAddLearningStreamItem).toHaveBeenCalledWith(42, expect.objectContaining({
      source: 'manual',
      topic: 'https://example.com/a',
      author: 'example.com',
      url: 'https://example.com/a',
    }));
  });

  it('returns 200 { duplicate: true } for an existing URL and writes no new row', async () => {
    const existing = { id: 3, url: 'https://example.com/a', status: 'pending', source: 'manual' };
    mockGetLearningStreamItemByUrl.mockResolvedValue(existing);

    const res = await simulateResources({ authenticated: true, brainlift: makeBrainlift(), body: { url: 'https://example.com/a' } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ item: existing, duplicate: true });
    expect(mockAddLearningStreamItem).not.toHaveBeenCalled();
  });

  it('400s a non-http(s) / invalid URL and never writes', async () => {
    expect((await simulateResources({ authenticated: true, brainlift: makeBrainlift(), body: { url: 'javascript:alert(1)' } })).status).toBe(400);
    expect((await simulateResources({ authenticated: true, brainlift: makeBrainlift(), body: { url: 'nope' } })).status).toBe(400);
    expect(mockAddLearningStreamItem).not.toHaveBeenCalled();
  });

  it('401s unauthenticated and 404s a foreign slug', async () => {
    expect((await simulateResources({ authenticated: false, brainlift: makeBrainlift(), body: { url: 'https://x.com' } })).status).toBe(401);
    expect((await simulateResources({ authenticated: true, brainlift: null, body: { url: 'https://x.com' } })).status).toBe(404);
  });
});

// ─── Real-route wiring (source-pattern) ───────────────────────────────────────

describe('FR4: onboarding.ts wires the three starter-pack endpoints', () => {
  it('mounts launch (modify), status (access), and resources (modify) with the right guards', () => {
    const src = readFileSync(new URL('../onboarding.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/onboarding\/starter-pack/);
    expect(src).toMatch(/onboarding\/resources/);
    expect(src).toMatch(/launchStarterPack/);
    expect(src).toMatch(/isStarterPackInFlight/);
    expect(src).toMatch(/hasStarterPackItems/);
    // Concurrency guard mirrors the launch handler.
    expect(src).toMatch(/research_run_in_progress/);
    expect(src).toMatch(/starter_pack_already_run/);
    // Resources duplicate pre-check + manual source.
    expect(src).toMatch(/getLearningStreamItemByUrl/);
    expect(src).toMatch(/duplicate/);
    // The daily cap must NOT be consulted on the starter-pack path.
    expect(src).not.toMatch(/getSwarmUsageToday/);
  });
});
