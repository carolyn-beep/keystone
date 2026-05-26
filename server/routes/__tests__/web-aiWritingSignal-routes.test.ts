/**
 * Spec 02 (web-ui) -- web GET routes attach aiWritingSignal to each item.
 *
 * Covers:
 *   - GET /api/brainlifts/:slug (the dok2Summaries field on the brainlift detail response)
 *   - GET /api/brainlifts/:slug/dok3-insights
 *   - GET /api/brainlifts/:slug/dok4-spovs
 *   - GET /api/brainlifts/:slug/dok4-spovs/:id/evaluation
 *
 * Strategy: mount each router into a minimal Express app, mock storage +
 * the aiWritingSignal service, and assert the response shape via Node's
 * http client. Avoids supertest (not a project dep).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { AiWritingSignalPayload } from '@shared/schema';

// ── Hoisted mocks ──

const {
  mockStorage,
  mockAttachAiWritingSignal,
} = vi.hoisted(() => ({
  mockStorage: {
    getDOK2Summaries: vi.fn(),
    getDOK3Insights: vi.fn(),
    getDOK4Spovs: vi.fn(),
    getFactsForBrainlift: vi.fn(),
    getContradictionClustersByBrainliftId: vi.fn(),
    getExpertsByBrainliftId: vi.fn(),
    isOwner: vi.fn(),
    getUserSharePermission: vi.fn(),
  },
  mockAttachAiWritingSignal: vi.fn(),
}));

vi.mock('../../storage', () => ({ storage: mockStorage }));
vi.mock('../../services/aiWritingSignal', () => ({
  attachAiWritingSignal: mockAttachAiWritingSignal,
}));

vi.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.authContext = { userId: 'u1', isAdmin: false };
    next();
  },
}));

vi.mock('../../middleware/brainlift-auth', () => ({
  requireBrainliftAccess: (req: any, _res: any, next: any) => {
    req.brainlift = {
      id: 42,
      slug: req.params.slug ?? 'test-bl',
      createdByUserId: 'u1',
      improperlyFormatted: false,
    };
    next();
  },
  requireBrainliftModify: (req: any, _res: any, next: any) => {
    req.brainlift = {
      id: 42,
      slug: req.params.slug ?? 'test-bl',
      createdByUserId: 'u1',
    };
    next();
  },
  requireBrainliftModifyById: (req: any, _res: any, next: any) => {
    req.brainlift = {
      id: 42,
      slug: req.params.slug ?? 'test-bl',
      createdByUserId: 'u1',
    };
    next();
  },
}));

// withJob + emitters are imported at module load by the routers; mock to no-op.
vi.mock('../../utils/withJob', () => ({
  withJob: () => ({ forPayload: () => ({ queue: vi.fn().mockResolvedValue(undefined) }) }),
}));
vi.mock('../../events/dok3GradingEmitter', () => ({
  dok3GradingEmitter: { isGradingActive: () => false, subscribe: () => () => {} },
}));
vi.mock('../../events/dok4GradingEmitter', () => ({
  dok4GradingEmitter: { isGradingActive: () => false, subscribe: () => () => {} },
}));
vi.mock('../../storage/versions', () => ({
  createVersion: vi.fn(),
  pruneVersions: vi.fn(),
}));
vi.mock('../../storage/stale', () => ({
  propagateStaleFlags: vi.fn(),
}));
vi.mock('../../services/brainlift', () => ({
  recomputeBrainliftScore: vi.fn(),
}));

// ── Sample payloads ──

const donePayload: AiWritingSignalPayload = {
  status: 'done',
  label: 'ai-assisted',
  version: '3.0',
  fractions: { ai: 0.1, aiAssisted: 0.7, human: 0.2 },
  headline: 'Likely AI-Assisted',
  confidence: 'High',
  errorMessage: null,
  analyzedAt: '2026-05-26T00:00:00.000Z',
};

const analyzingPayload: AiWritingSignalPayload = {
  status: 'analyzing',
  label: null,
  version: null,
  fractions: null,
  headline: null,
  confidence: null,
  errorMessage: null,
  analyzedAt: null,
};

// ── Helpers ──

async function makeRequest(app: express.Express, path: string): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: passthrough -- attach { aiWritingSignal: null } to every item.
  mockAttachAiWritingSignal.mockImplementation(async (items: any[]) =>
    items.map((i) => ({ ...i, aiWritingSignal: null })),
  );
});

// ── Tests: DOK3 ──

describe('GET /api/brainlifts/:slug/dok3-insights -- attaches aiWritingSignal', () => {
  it('returns each insight with an aiWritingSignal field via attachAiWritingSignal(items, "dok3_insight")', async () => {
    const { dok3Router } = await import('../dok3');
    const insights = [
      { id: 100, text: 'i1' },
      { id: 101, text: 'i2' },
    ];
    mockStorage.getDOK3Insights.mockResolvedValueOnce(insights);
    mockAttachAiWritingSignal.mockResolvedValueOnce([
      { id: 100, text: 'i1', aiWritingSignal: donePayload },
      { id: 101, text: 'i2', aiWritingSignal: null },
    ]);

    const app = express();
    app.use(dok3Router);
    const { status, body } = await makeRequest(app, '/api/brainlifts/test-bl/dok3-insights');

    expect(status).toBe(200);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledTimes(1);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledWith(insights, 'dok3_insight');
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ id: 100, aiWritingSignal: { status: 'done', label: 'ai-assisted' } });
    expect(body[1]).toMatchObject({ id: 101, aiWritingSignal: null });
  });

  it('every item carries an aiWritingSignal key, even when null', async () => {
    const { dok3Router } = await import('../dok3');
    mockStorage.getDOK3Insights.mockResolvedValueOnce([
      { id: 200, text: 'a' },
      { id: 201, text: 'b' },
      { id: 202, text: 'c' },
    ]);

    const app = express();
    app.use(dok3Router);
    const { body } = await makeRequest(app, '/api/brainlifts/test-bl/dok3-insights');

    for (const item of body) {
      expect(item).toHaveProperty('aiWritingSignal');
    }
  });
});

// ── Tests: DOK4 ──

describe('GET /api/brainlifts/:slug/dok4-spovs -- attaches aiWritingSignal', () => {
  it('attaches via attachAiWritingSignal(items, "dok4_spov") and returns each item with the field', async () => {
    const { dok4Router } = await import('../dok4');
    const spovs = [
      { id: 300, text: 's1' },
      { id: 301, text: 's2' },
    ];
    mockStorage.getDOK4Spovs.mockResolvedValueOnce(spovs);
    mockAttachAiWritingSignal.mockResolvedValueOnce([
      { id: 300, text: 's1', aiWritingSignal: analyzingPayload },
      { id: 301, text: 's2', aiWritingSignal: null },
    ]);

    const app = express();
    app.use(dok4Router);
    const { status, body } = await makeRequest(app, '/api/brainlifts/test-bl/dok4-spovs');

    expect(status).toBe(200);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledWith(spovs, 'dok4_spov');
    expect(body[0]).toMatchObject({ id: 300, aiWritingSignal: { status: 'analyzing' } });
    expect(body[1]).toMatchObject({ id: 301, aiWritingSignal: null });
  });
});

describe('GET /api/brainlifts/:slug/dok4-spovs/:id/evaluation -- attaches aiWritingSignal', () => {
  it('returns the single SPOV with an aiWritingSignal field', async () => {
    const { dok4Router } = await import('../dok4');
    const spovs = [
      { id: 400, text: 'evaluated' },
      { id: 401, text: 'other' },
    ];
    mockStorage.getDOK4Spovs.mockResolvedValueOnce(spovs);
    // attach helper is called with the single matched spov.
    mockAttachAiWritingSignal.mockResolvedValueOnce([
      { id: 400, text: 'evaluated', aiWritingSignal: donePayload },
    ]);

    const app = express();
    app.use(dok4Router);
    const { status, body } = await makeRequest(
      app,
      '/api/brainlifts/test-bl/dok4-spovs/400/evaluation',
    );

    expect(status).toBe(200);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledTimes(1);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledWith(
      [{ id: 400, text: 'evaluated' }],
      'dok4_spov',
    );
    expect(body).toMatchObject({ id: 400, aiWritingSignal: { status: 'done' } });
  });
});

// ── Tests: DOK2 read path (brainlifts.ts GET /api/brainlifts/:slug) ──

describe('GET /api/brainlifts/:slug -- attaches aiWritingSignal to dok2Summaries', () => {
  it('attaches via attachAiWritingSignal(dok2, "dok2_summary") on the dok2Summaries field', async () => {
    // We bypass the full brainlift router complexity by setting up the bare
    // minimum mocks. Need to also mock the api routes object the brainlifts
    // router imports.
    vi.doMock('../../../shared/routes', async () => {
      const actual = await vi.importActual<any>('../../../shared/routes');
      return actual;
    });

    // Configure storage mocks for the GET path
    mockStorage.getFactsForBrainlift.mockResolvedValueOnce([]);
    mockStorage.getContradictionClustersByBrainliftId.mockResolvedValueOnce([]);
    mockStorage.getExpertsByBrainliftId.mockResolvedValueOnce([]);
    mockStorage.isOwner.mockReturnValueOnce(true);

    const dok2Summaries = [
      { id: 500, sourceName: 'Src 1' },
      { id: 501, sourceName: 'Src 2' },
    ];
    mockStorage.getDOK2Summaries.mockResolvedValueOnce(dok2Summaries);
    mockAttachAiWritingSignal.mockResolvedValueOnce([
      { id: 500, sourceName: 'Src 1', aiWritingSignal: donePayload },
      { id: 501, sourceName: 'Src 2', aiWritingSignal: null },
    ]);

    const { brainliftsRouter } = await import('../brainlifts');
    const app = express();
    app.use(brainliftsRouter);
    const { status, body } = await makeRequest(app, '/api/brainlifts/test-bl');

    expect(status).toBe(200);
    expect(mockAttachAiWritingSignal).toHaveBeenCalledWith(dok2Summaries, 'dok2_summary');
    expect(body.dok2Summaries).toHaveLength(2);
    expect(body.dok2Summaries[0]).toMatchObject({ id: 500, aiWritingSignal: { status: 'done' } });
    expect(body.dok2Summaries[1]).toMatchObject({ id: 501, aiWritingSignal: null });
  });
});

// ── No-N+1 guard ──

describe('No N+1', () => {
  it('DOK3 list endpoint issues exactly one attachAiWritingSignal call regardless of item count', async () => {
    const { dok3Router } = await import('../dok3');
    mockStorage.getDOK3Insights.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({ id: 1000 + i, text: `t${i}` })),
    );

    const app = express();
    app.use(dok3Router);
    await makeRequest(app, '/api/brainlifts/test-bl/dok3-insights');

    expect(mockAttachAiWritingSignal).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});
