/**
 * Tests for POST /api/brainlifts/:slug/learning-stream/launch (FR4)
 * and removal of POST /refresh (FR5).
 *
 * Uses the handler-style direct-invocation pattern (no supertest, matching the
 * existing pattern in learning-stream-second-brain.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunSpec } from '@shared/research-stream';

const FIXED_RUN_SPEC: RunSpec = {
  agents: [
    { type: 'Podcast', focus: 'systems podcasts' },
    { type: 'Podcast', focus: 'AI podcasts' },
    { type: 'AcademicPaper', focus: 'recent ML papers' },
    { type: 'AcademicPaper', focus: 'compiler papers' },
    { type: 'Video', focus: 'conference talks' },
  ],
};

const { mockStorage, mockOrchestrate, mockRunResearchSwarm, mockEstimateRunCostUsd, mockSwarmEmitter } = vi.hoisted(() => {
  return {
    mockStorage: {
      hasResearchJobPending: vi.fn(async () => false),
      getSwarmUsageToday: vi.fn(async () => ({ used: 0, limit: 3, remaining: 3 })),
      recordSwarmUsage: vi.fn(async () => 987),
      updateSwarmUsageEstimatedUsd: vi.fn(async () => undefined),
      getActiveRunIdForBrainlift: vi.fn(async () => 555),
      // Unrelated functions referenced by route module — stub to keep imports happy.
      getLearningStreamItems: vi.fn(async () => []),
      getLearningStreamStats: vi.fn(async () => ({
        total: 0, pending: 0, bookmarked: 0, graded: 0, discarded: 0,
      })),
      updateLearningStreamItemStatus: vi.fn(),
      gradeLearningStreamItem: vi.fn(),
      getLearningStreamItemById: vi.fn(),
      clearExtractedContent: vi.fn(),
    },
    mockOrchestrate: vi.fn(async () => ({
      runSpec: FIXED_RUN_SPEC,
      modelUsed: 'anthropic/claude-opus-4.7',
      usedDefault: false,
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: 1234,
    })),
    mockRunResearchSwarm: vi.fn(async () => ({
      success: true,
      totalSaved: 5,
      duplicatesSkipped: 0,
      failedCount: 0,
      errors: [],
      durationMs: 1000,
      slotUsages: [],
    })),
    mockEstimateRunCostUsd: vi.fn(() => 0.1234),
    mockSwarmEmitter: {
      isSwarmActive: vi.fn(() => false),
      subscribe: vi.fn(),
      endSwarm: vi.fn(),
    },
  };
});

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/learning-stream-swarm-v2/orchestrator', () => ({
  orchestrate: mockOrchestrate,
}));

vi.mock('../../ai/learning-stream-swarm-v2/run', () => ({
  runResearchSwarm: mockRunResearchSwarm,
}));

vi.mock('../../ai/learning-stream-swarm-v2/cost', () => ({
  estimateRunCostUsd: mockEstimateRunCostUsd,
}));

vi.mock('../../ai/learning-stream-swarm-v2/event-emitter', () => ({
  swarmEmitter: mockSwarmEmitter,
}));

vi.mock('../../db', () => ({
  db: { transaction: vi.fn() },
  pool: { query: vi.fn() },
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'research-project' },
    body: {},
    brainlift: { id: 42, slug: 'research-project', phase: 'research' },
    authContext: { userId: 'user-1', isAdmin: false },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  // `mockReset` (not just clearAllMocks) drops the once-queue from any prior
  // mockResolvedValueOnce calls so test order can't leak state.
  mockStorage.hasResearchJobPending.mockReset().mockResolvedValue(false);
  mockStorage.getSwarmUsageToday.mockReset().mockResolvedValue({ used: 0, limit: 3, remaining: 3 });
  mockStorage.recordSwarmUsage.mockReset().mockResolvedValue(987);
  mockStorage.updateSwarmUsageEstimatedUsd.mockReset().mockResolvedValue(undefined);
  mockStorage.getActiveRunIdForBrainlift.mockReset().mockResolvedValue(555);
  mockOrchestrate.mockReset().mockResolvedValue({
    runSpec: FIXED_RUN_SPEC,
    modelUsed: 'anthropic/claude-opus-4.7',
    usedDefault: false,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 1234,
  });
  mockRunResearchSwarm.mockReset().mockResolvedValue({
    success: true,
    totalSaved: 5,
    duplicatesSkipped: 0,
    failedCount: 0,
    errors: [],
    durationMs: 1000,
    slotUsages: [],
  });
  mockEstimateRunCostUsd.mockReset().mockReturnValue(0.1234);
  mockSwarmEmitter.isSwarmActive.mockReset().mockReturnValue(false);
  mockSwarmEmitter.subscribe.mockReset();
  mockSwarmEmitter.endSwarm.mockReset();
});

describe('POST /launch - happy path', () => {
  it('returns 200 with { runId } for an empty body (Path B)', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const req = createReq();
    const res = createRes();

    await launchResearchStreamHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ runId: 987 });
    expect(mockOrchestrate).toHaveBeenCalledWith(42, {});
  });

  it('returns 200 for a full RunRequest body (Path C); orchestrate receives parsed body', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const body = {
      topic: 'Carmack on systems',
      slotOverrides: [{ type: 'Podcast', focus: 'lectures' }],
      notes: 'lean recent',
    };
    const req = createReq({ body });
    const res = createRes();

    await launchResearchStreamHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ runId: 987 });
    expect(mockOrchestrate).toHaveBeenCalledWith(42, body);
  });

  it('records swarm usage with the orchestrated RunSpec', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    await launchResearchStreamHandler(createReq(), createRes());

    expect(mockStorage.recordSwarmUsage).toHaveBeenCalledWith('user-1', 42, FIXED_RUN_SPEC);
  });

  it('starts the interactive v2 swarm in-process so SSE sees telemetry', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    await launchResearchStreamHandler(createReq(), createRes());

    expect(mockRunResearchSwarm).toHaveBeenCalledWith(42, FIXED_RUN_SPEC, 987);
  });

  it('runs orchestrate BEFORE recordSwarmUsage and recordSwarmUsage BEFORE in-process swarm start', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const callOrder: string[] = [];
    mockOrchestrate.mockImplementation(async () => {
      callOrder.push('orchestrate');
      return {
        runSpec: FIXED_RUN_SPEC,
        modelUsed: 'anthropic/claude-opus-4.7',
        usedDefault: false,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 1,
      };
    });
    mockStorage.recordSwarmUsage.mockImplementation(async () => {
      callOrder.push('record');
      return 987;
    });
    mockRunResearchSwarm.mockImplementation(async () => {
      callOrder.push('run');
      return {
        success: true,
        totalSaved: 1,
        duplicatesSkipped: 0,
        failedCount: 0,
        errors: [],
        durationMs: 1,
        slotUsages: [],
      };
    });

    await launchResearchStreamHandler(createReq(), createRes());

    expect(callOrder).toEqual(['orchestrate', 'record', 'run']);
  });

  it('emits a launch log line with runId, brainliftId, userId, and slot summary', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await launchResearchStreamHandler(createReq(), createRes());

    const logLines = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logLines).toMatch(/runId=987/);
    expect(logLines).toMatch(/brainlift=42/);
    expect(logLines).toMatch(/user=user-1/);
    expect(logLines).toMatch(/Podcast/);
    logSpy.mockRestore();
  });

  it('logs a warn line when orchestrator used the deterministic default', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockOrchestrate.mockResolvedValueOnce({
      runSpec: FIXED_RUN_SPEC,
      modelUsed: 'deterministic-default',
      usedDefault: true,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs: 1,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await launchResearchStreamHandler(createReq(), createRes());

    const warnLines = warnSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(warnLines).toMatch(/used_default_runspec=true/);
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe('POST /launch - 400 invalid_run_request', () => {
  it('returns 400 when topic is whitespace-only', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const req = createReq({ body: { topic: '   ' } });
    const res = createRes();

    await expect(launchResearchStreamHandler(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_run_request',
    });
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(mockStorage.recordSwarmUsage).not.toHaveBeenCalled();
  });

  it('returns 400 when slotOverrides exceeds MAX_SLOTS (6 entries)', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const req = createReq({
      body: { slotOverrides: Array.from({ length: 6 }, () => ({ type: 'Podcast' })) },
    });
    const res = createRes();

    await expect(launchResearchStreamHandler(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_run_request',
    });
    expect(mockOrchestrate).not.toHaveBeenCalled();
  });

  it('returns 400 when slotOverrides has invalid enum value', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    const req = createReq({
      body: { slotOverrides: [{ type: 'BogusType' }] },
    });
    const res = createRes();

    await expect(launchResearchStreamHandler(req, res)).rejects.toMatchObject({
      statusCode: 400,
      code: 'invalid_run_request',
    });
  });
});

describe('POST /launch - 409 research_run_in_progress', () => {
  it('returns 409 when a pending research job exists', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockStorage.hasResearchJobPending.mockResolvedValueOnce(true);
    mockStorage.getActiveRunIdForBrainlift.mockResolvedValueOnce(555);

    const req = createReq();
    const res = createRes();

    await expect(launchResearchStreamHandler(req, res)).rejects.toMatchObject({
      statusCode: 409,
      code: 'research_run_in_progress',
    });
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(mockStorage.recordSwarmUsage).not.toHaveBeenCalled();
  });

  it('exposes existingRunId in the 409 error details', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockStorage.hasResearchJobPending.mockResolvedValueOnce(true);
    mockStorage.getActiveRunIdForBrainlift.mockResolvedValueOnce(555);

    let caught: any;
    try {
      await launchResearchStreamHandler(createReq(), createRes());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.statusCode).toBe(409);
    expect(caught.details).toEqual({ existingRunId: 555 });
  });

  it('returns 409 when an in-process SSE swarm is active', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockSwarmEmitter.isSwarmActive.mockReturnValueOnce(true);
    mockStorage.getActiveRunIdForBrainlift.mockResolvedValueOnce(777);

    await expect(launchResearchStreamHandler(createReq(), createRes())).rejects.toMatchObject({
      statusCode: 409,
      code: 'research_run_in_progress',
      details: { existingRunId: 777 },
    });
    expect(mockStorage.hasResearchJobPending).not.toHaveBeenCalled();
    expect(mockOrchestrate).not.toHaveBeenCalled();
  });
});

describe('POST /launch - 429 daily_limit_reached', () => {
  it('returns 429 when user is at daily limit (3/3)', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockStorage.getSwarmUsageToday.mockResolvedValueOnce({ used: 3, limit: 3, remaining: 0 });

    let caught: any;
    try {
      await launchResearchStreamHandler(createReq(), createRes());
    } catch (e) {
      caught = e;
    }
    expect(caught.statusCode).toBe(429);
    expect(caught.code).toBe('daily_limit_reached');
    expect(caught.details).toEqual({ limit: 3, used: 3 });
    expect(mockOrchestrate).not.toHaveBeenCalled();
    expect(mockStorage.recordSwarmUsage).not.toHaveBeenCalled();
  });

  it('admin user bypasses the daily limit and returns 200', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    // Set up: storage would say at-limit, but admin should skip the check.
    mockStorage.getSwarmUsageToday.mockResolvedValueOnce({ used: 3, limit: 3, remaining: 0 });
    const req = createReq({ authContext: { userId: 'admin-1', isAdmin: true } });
    const res = createRes();

    await launchResearchStreamHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockOrchestrate).toHaveBeenCalled();
  });
});

describe('POST /launch - orchestrator failure', () => {
  it('lets orchestrator errors propagate (handled by asyncHandler as 500); no usage recorded', async () => {
    const { launchResearchStreamHandler } = await import('../learning-stream');
    mockOrchestrate.mockRejectedValueOnce(new Error('LLM timeout'));

    await expect(launchResearchStreamHandler(createReq(), createRes())).rejects.toThrow('LLM timeout');
    expect(mockStorage.recordSwarmUsage).not.toHaveBeenCalled();
    expect(mockRunResearchSwarm).not.toHaveBeenCalled();
  });
});

describe('POST /refresh - removed', () => {
  it('does NOT export legacy maybeRefillStream', async () => {
    const mod = await import('../learning-stream');
    expect((mod as any).maybeRefillStream).toBeUndefined();
  });

  it('does NOT register a /refresh route on the learningStreamRouter', async () => {
    const { learningStreamRouter } = await import('../learning-stream');
    const refreshRoutes = (learningStreamRouter as any).stack
      .filter((layer: any) => layer.route)
      .filter((layer: any) => /\/refresh$/.test(layer.route.path));
    expect(refreshRoutes).toEqual([]);
  });

  it('registers the new /launch route on the learningStreamRouter', async () => {
    const { learningStreamRouter } = await import('../learning-stream');
    const launchRoutes = (learningStreamRouter as any).stack
      .filter((layer: any) => layer.route)
      .filter((layer: any) => /\/launch$/.test(layer.route.path));
    expect(launchRoutes.length).toBeGreaterThan(0);
    // Method should be POST.
    const layer = launchRoutes[0];
    expect(layer.route.methods.post).toBe(true);
  });
});

describe('FR5 - bookmark/discard/grade handlers do not auto-refill', () => {
  it('learning-stream.ts source no longer references maybeRefillStream', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../learning-stream.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/\bmaybeRefillStream\b/);
  });
});
