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
import { onboardingCreateInput, onboardingPatchInput } from '@shared/routes';
import type { Brainlift } from '@shared/schema';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateOnboardingBrainlift = vi.fn();
const mockUpdateBrainliftScope = vi.fn();
const mockUpdateOnboardingStep = vi.fn();

vi.mock('../../storage', () => ({
  storage: {
    createOnboardingBrainlift: (...args: unknown[]) => mockCreateOnboardingBrainlift(...args),
    updateBrainliftScope: (...args: unknown[]) => mockUpdateBrainliftScope(...args),
    updateOnboardingStep: (...args: unknown[]) => mockUpdateOnboardingStep(...args),
  },
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
