/**
 * Tests for 06-expert-discovery FR3: POST /api/brainlifts/:slug/experts.
 *
 * The REST create endpoint validates the body with `createExpertsInput`
 * (1-10 experts; name + where required non-empty trimmed; who/why/focus
 * optional) and wraps `createBrainliftExperts` with `source: 'onboarding'`.
 * Auth/IDOR are enforced by route middleware (requireBrainliftModify).
 *
 * The curation service is mocked; the route handler logic is simulated
 * without Express (matching the onboarding-route test convention).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createExpertsInput } from '@shared/routes';
import type { Brainlift } from '@shared/schema';

const mockCreateBrainliftExperts = vi.fn();

vi.mock('../../services/brainlift-curation', () => ({
  createBrainliftExperts: (...args: unknown[]) => mockCreateBrainliftExperts(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const authContext = { userId: 'user-1', role: 'user' as const, isAdmin: false };

function makeBrainlift(overrides: Partial<Brainlift> = {}): Brainlift {
  return { id: 42, slug: 'marine-biology', ...overrides } as unknown as Brainlift;
}

/** POST /api/brainlifts/:slug/experts */
async function simulateCreate(params: {
  authenticated: boolean;
  brainlift: Brainlift | null; // null = foreign/missing slug (middleware 404)
  body: unknown;
}) {
  if (!params.authenticated) {
    return { status: 401, body: { message: 'Unauthorized' } };
  }
  if (params.brainlift === null) {
    return { status: 404, body: { message: 'Brainlift not found' } };
  }
  const parsed = createExpertsInput.safeParse(params.body);
  if (!parsed.success) {
    return { status: 400, body: { message: 'Invalid experts payload' } };
  }
  const result = await mockCreateBrainliftExperts(authContext, {
    slug: params.brainlift.slug,
    experts: parsed.data.experts,
    source: 'onboarding',
  });
  return { status: 201, body: { experts: result.createdExperts } };
}

// ─── Schema ─────────────────────────────────────────────────────────────────

describe('FR3: createExpertsInput schema', () => {
  it('accepts a minimal { name, where } expert', () => {
    const parsed = createExpertsInput.parse({ experts: [{ name: 'Jane', where: '@jane' }] });
    expect(parsed.experts[0]).toEqual({ name: 'Jane', where: '@jane' });
  });

  it('trims name and where', () => {
    const parsed = createExpertsInput.parse({ experts: [{ name: '  Jane  ', where: '  @jane  ' }] });
    expect(parsed.experts[0].name).toBe('Jane');
    expect(parsed.experts[0].where).toBe('@jane');
  });

  it('accepts optional who/why/focus', () => {
    const parsed = createExpertsInput.parse({
      experts: [{ name: 'Jane', where: '@jane', who: 'Ecologist', why: 'Cited', focus: 'Reefs' }],
    });
    expect(parsed.experts[0]).toEqual({
      name: 'Jane',
      where: '@jane',
      who: 'Ecologist',
      why: 'Cited',
      focus: 'Reefs',
    });
  });

  it('rejects an empty experts array', () => {
    expect(createExpertsInput.safeParse({ experts: [] }).success).toBe(false);
  });

  it('rejects more than 10 experts', () => {
    const experts = Array.from({ length: 11 }, (_, i) => ({ name: `E${i}`, where: `@e${i}` }));
    expect(createExpertsInput.safeParse({ experts }).success).toBe(false);
  });

  it('rejects a missing or empty name', () => {
    expect(createExpertsInput.safeParse({ experts: [{ where: '@x' }] }).success).toBe(false);
    expect(createExpertsInput.safeParse({ experts: [{ name: '   ', where: '@x' }] }).success).toBe(false);
  });

  it('rejects a missing or empty where', () => {
    expect(createExpertsInput.safeParse({ experts: [{ name: 'Jane' }] }).success).toBe(false);
    expect(createExpertsInput.safeParse({ experts: [{ name: 'Jane', where: '  ' }] }).success).toBe(false);
  });
});

// ─── Endpoint behaviour ───────────────────────────────────────────────────────

describe('FR3: POST /api/brainlifts/:slug/experts', () => {
  it('accepts two experts and returns 201 with source onboarding passed to the service', async () => {
    const bl = makeBrainlift();
    mockCreateBrainliftExperts.mockResolvedValue({
      slug: bl.slug,
      createdExperts: [{ id: 1, name: 'Jane' }, { id: 2, name: 'John' }],
      rerankQueued: true,
    });

    const res = await simulateCreate({
      authenticated: true,
      brainlift: bl,
      body: {
        experts: [
          { name: 'Jane', where: '@jane', who: 'Ecologist', why: 'Cited' },
          { name: 'John', where: 'https://example.com/john' },
        ],
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ experts: [{ id: 1, name: 'Jane' }, { id: 2, name: 'John' }] });
    expect(mockCreateBrainliftExperts).toHaveBeenCalledWith(authContext, {
      slug: bl.slug,
      source: 'onboarding',
      experts: [
        { name: 'Jane', where: '@jane', who: 'Ecologist', why: 'Cited' },
        { name: 'John', where: 'https://example.com/john' },
      ],
    });
  });

  it('accepts a minimal manual { name, where } add', async () => {
    const bl = makeBrainlift();
    mockCreateBrainliftExperts.mockResolvedValue({
      slug: bl.slug,
      createdExperts: [{ id: 3, name: 'Solo', who: null, why: null, focus: null }],
      rerankQueued: true,
    });

    const res = await simulateCreate({
      authenticated: true,
      brainlift: bl,
      body: { experts: [{ name: 'Solo', where: '@solo' }] },
    });

    expect(res.status).toBe(201);
    expect(res.body.experts[0]).toEqual(
      expect.objectContaining({ id: 3, who: null, why: null }),
    );
  });

  it('rejects an empty array with 400 and never touches the service', async () => {
    const res = await simulateCreate({ authenticated: true, brainlift: makeBrainlift(), body: { experts: [] } });
    expect(res.status).toBe(400);
    expect(mockCreateBrainliftExperts).not.toHaveBeenCalled();
  });

  it('rejects a missing name with 400', async () => {
    const res = await simulateCreate({
      authenticated: true,
      brainlift: makeBrainlift(),
      body: { experts: [{ where: '@x' }] },
    });
    expect(res.status).toBe(400);
    expect(mockCreateBrainliftExperts).not.toHaveBeenCalled();
  });

  it('rejects a missing where with 400', async () => {
    const res = await simulateCreate({
      authenticated: true,
      brainlift: makeBrainlift(),
      body: { experts: [{ name: 'Jane' }] },
    });
    expect(res.status).toBe(400);
    expect(mockCreateBrainliftExperts).not.toHaveBeenCalled();
  });

  it('rejects more than 10 experts with 400', async () => {
    const experts = Array.from({ length: 11 }, (_, i) => ({ name: `E${i}`, where: `@e${i}` }));
    const res = await simulateCreate({ authenticated: true, brainlift: makeBrainlift(), body: { experts } });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a foreign/missing slug (IDOR via middleware)', async () => {
    const res = await simulateCreate({
      authenticated: true,
      brainlift: null,
      body: { experts: [{ name: 'Jane', where: '@jane' }] },
    });
    expect(res.status).toBe(404);
    expect(mockCreateBrainliftExperts).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await simulateCreate({
      authenticated: false,
      brainlift: makeBrainlift(),
      body: { experts: [{ name: 'Jane', where: '@jane' }] },
    });
    expect(res.status).toBe(401);
  });

  it('wires the real route: create endpoint guarded by modify middleware, source onboarding', () => {
    const src = readFileSync(new URL('../experts.ts', import.meta.url), 'utf8');
    // A POST to the slug-scoped experts collection (not /refresh).
    expect(src).toMatch(/post\(\s*['"]\/api\/brainlifts\/:slug\/experts['"]/);
    expect(src).toMatch(/requireBrainliftModify/);
    expect(src).toMatch(/createExpertsInput/);
    expect(src).toMatch(/createBrainliftExperts/);
    expect(src).toMatch(/source:\s*['"]onboarding['"]/);
    // Native authoring builder must NOT be revived here.
    expect(src).not.toMatch(/suggest-experts/);
  });
});
