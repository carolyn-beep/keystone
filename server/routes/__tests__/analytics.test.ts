import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockStorage,
  mockRequireAdmin,
  mockGetModelDisplayName,
  mockCreateQABatch,
  mockFreezeGraderMonitoringSet,
  mockWithJob,
} = vi.hoisted(() => ({
  mockStorage: {
    getModelAccuracyStats: vi.fn(),
    getLlmFeedbackHistory: vi.fn(),
    getVolumeAnalytics: vi.fn(),
    getHumanVerificationAnalytics: vi.fn(),
    getVanillaComparisonAnalytics: vi.fn(),
    getDokCliffAnalytics: vi.fn(),
    getScoreDistributionAnalytics: vi.fn(),
    getSpovDistributionAnalytics: vi.fn(),
    getScoreImprovementAnalytics: vi.fn(),
    getBrainliftScoreHistoryAnalytics: vi.fn(),
    getLeaderboardAnalytics: vi.fn(),
    getGraderConsistencyAnalytics: vi.fn(),
    getModelDriftAnalytics: vi.fn(),
  },
  mockRequireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
  mockGetModelDisplayName: vi.fn((model: string) => model),
  mockCreateQABatch: vi.fn(),
  mockFreezeGraderMonitoringSet: vi.fn(),
  mockWithJob: vi.fn((taskName: string) => ({
    forPayload: vi.fn((payload: unknown) => ({
      queue: vi.fn().mockResolvedValue(`job-${taskName}:${JSON.stringify(payload)}`),
    })),
  })),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../middleware/auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('../../middleware/error-handler', () => ({
  asyncHandler: (fn: any) => fn,
  BadRequestError: class BadRequestError extends Error {
    statusCode = 400;
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

vi.mock('../../ai/client/registry', () => ({
  getModelDisplayName: mockGetModelDisplayName,
}));

vi.mock('../../storage/qa-batches', () => ({
  createQABatch: mockCreateQABatch,
}));

vi.mock('../../services/freeze-grader-monitoring-set', () => ({
  freezeGraderMonitoringSet: mockFreezeGraderMonitoringSet,
}));

vi.mock('../../utils/withJob', () => ({
  withJob: mockWithJob,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createReq(query: Record<string, unknown> = {}, body: Record<string, unknown> = {}): any {
  return { query, params: {}, body, authContext: { isAdmin: true }, user: { id: 'admin-1' } };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('analytics router wiring', () => {
  it('mounts all fixed analytics endpoints behind requireAdmin', async () => {
    const { analyticsRouter } = await import('../analytics');
    const paths = analyticsRouter.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(paths).toEqual(expect.arrayContaining([
      '/api/analytics/model-accuracy',
      '/api/analytics/volume',
      '/api/analytics/human-verification',
      '/api/analytics/grader-consistency',
      '/api/analytics/model-drift',
      '/api/analytics/human-verification/run',
      '/api/analytics/grader-consistency/freeze',
      '/api/analytics/grader-consistency/run',
      '/api/analytics/vanilla-comparison',
      '/api/analytics/dok-cliff',
      '/api/analytics/score-distribution',
      '/api/analytics/spov-distribution',
      '/api/analytics/score-improvement',
      '/api/analytics/brainlift-score-history',
      '/api/analytics/leaderboard',
    ]));

    for (const layer of analyticsRouter.stack.filter((entry: any) => entry.route)) {
      expect(layer.route.stack.some((mw: any) => mw.handle === mockRequireAdmin)).toBe(true);
    }
  });
});

describe('analytics handlers', () => {
  it('keeps the legacy model-accuracy payload intact', async () => {
    mockStorage.getModelAccuracyStats.mockResolvedValue([
      { model: 'x', totalSamples: 2, meanAbsoluteError: '0.5', weight: '1.0' },
    ]);
    mockStorage.getLlmFeedbackHistory.mockResolvedValue([
      { llmModel: 'x', llmScore: 3, humanScore: 4, scoreDifference: 1 },
    ]);

    const { modelAccuracyHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await modelAccuracyHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      models: expect.arrayContaining([
        expect.objectContaining({ modelName: 'x', accuracyTier: 'excellent' }),
      ]),
      totalOverrides: 2,
      recentFeedback: expect.objectContaining({
        x: [{ llmScore: 3, humanScore: 4, diff: 1 }],
      }),
    }));
  });

  it('forwards parsed volume filters to storage', async () => {
    mockStorage.getVolumeAnalytics.mockResolvedValue({ totals: {}, series: [] });

    const { volumeHandler } = await import('../analytics');
    const req = createReq({
      from: '2026-04-01',
      to: '2026-04-08',
      userId: 'user-1',
      dokLevel: '2',
      origin: 'ui',
    });
    const res = createRes();

    await volumeHandler(req, res);

    expect(mockStorage.getVolumeAnalytics).toHaveBeenCalledWith({
      from: '2026-04-01',
      to: '2026-04-08',
      userId: 'user-1',
      dokLevel: 2,
      origin: 'ui',
    });
    expect(res.json).toHaveBeenCalledWith({ totals: {}, series: [] });
  });

  it('returns stable empty state for human verification', async () => {
    mockStorage.getHumanVerificationAnalytics.mockResolvedValue({
      hasData: false,
      baseline: null,
      latestBatch: null,
      trend: [],
    });

    const { humanVerificationHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await humanVerificationHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      hasData: false,
      baseline: null,
      latestBatch: null,
      trend: [],
    });
  });

  it('returns stable empty state for grader consistency', async () => {
    mockStorage.getGraderConsistencyAnalytics.mockResolvedValue({
      hasData: false,
      latestRun: null,
      trend: [],
    });

    const { graderConsistencyHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await graderConsistencyHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      hasData: false,
      latestRun: null,
      trend: [],
    });
  });

  it('returns stable empty state for model drift', async () => {
    mockStorage.getModelDriftAnalytics.mockResolvedValue({
      hasData: false,
      latestRun: null,
      trend: [],
    });

    const { modelDriftHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await modelDriftHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      hasData: false,
      latestRun: null,
      trend: [],
    });
  });

  it('creates and queues a verification batch on manual trigger', async () => {
    mockCreateQABatch.mockResolvedValue({ id: 202, type: 'verification' });

    const { verificationTriggerHandler } = await import('../analytics');
    const req = createReq({}, {
      artifactLabel: 'truth-set-1',
      sampleCount: 20,
    });
    const res = createRes();

    await verificationTriggerHandler(req, res);

    expect(mockCreateQABatch).toHaveBeenCalledWith({
      type: 'verification',
      status: 'pending',
      isBaseline: false,
      artifactLabel: 'truth-set-1',
      sampleCount: 20,
    });
    expect(mockWithJob).toHaveBeenCalledWith('analytics:run-verification-batch');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      batch: { id: 202, type: 'verification' },
      jobId: expect.stringContaining('analytics:run-verification-batch'),
    }));
  });

  it('freezes the weekly monitoring corpus from five slugs', async () => {
    mockFreezeGraderMonitoringSet.mockResolvedValue({
      set: {
        id: 11,
        monitoredSlugs: ['a', 'b', 'c', 'd', 'e'],
        scheduleTimezone: 'America/Sao_Paulo',
        driftRepresentative: 'pass1',
        snapshotVersion: 2,
        active: true,
        frozenAt: '2026-04-09T12:00:00.000Z',
        createdByUserId: 'admin-1',
        createdAt: '2026-04-09T12:00:00.000Z',
        updatedAt: '2026-04-09T12:00:00.000Z',
      },
      frozenBrainlifts: 5,
    });

    const { graderMonitoringFreezeHandler } = await import('../analytics');
    const req = createReq({}, { slugs: ['a', 'b', 'c', 'd', 'e'] });
    const res = createRes();

    await graderMonitoringFreezeHandler(req, res);

    expect(mockFreezeGraderMonitoringSet).toHaveBeenCalledWith({
      slugs: ['a', 'b', 'c', 'd', 'e'],
      createdByUserId: 'admin-1',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      frozenBrainlifts: 5,
    }));
  });

  it('queues the weekly consistency run manually', async () => {
    const { graderMonitoringRunTriggerHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await graderMonitoringRunTriggerHandler(req, res);

    expect(mockWithJob).toHaveBeenCalledWith('analytics:run-weekly-grader-consistency');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      jobId: expect.stringContaining('analytics:run-weekly-grader-consistency'),
    }));
  });

  it('returns representative vanilla-comparison items', async () => {
    mockStorage.getVanillaComparisonAnalytics.mockResolvedValue({
      hasData: true,
      items: [{ id: 1, brainliftId: 1, brainliftSlug: 'a', brainliftTitle: 'A', score: 4, scoreTier: 4, text: 'x', divergenceQuestion: null, divergenceVanillaResponse: null, gradedAt: '2026-04-08T00:00:00.000Z' }],
    });

    const { vanillaComparisonHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await vanillaComparisonHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      hasData: true,
      items: expect.arrayContaining([
        expect.objectContaining({ scoreTier: 4 }),
      ]),
    }));
  });

  it('returns DOK cliff rows', async () => {
    mockStorage.getDokCliffAnalytics.mockResolvedValue({
      hasData: true,
      rows: [
        { dokLevel: 1, label: 'DOK1', averageScore: 3.9, brainliftCount: 12 },
        { dokLevel: 2, label: 'DOK2', averageScore: 3.7, brainliftCount: 10 },
        { dokLevel: 3, label: 'DOK3', averageScore: 2.8, brainliftCount: 8 },
        { dokLevel: 4, label: 'DOK4', averageScore: 2.1, brainliftCount: 6 },
      ],
      summary: {
        totalBrainlifts: 14,
        dok1Average: 3.9,
        dok4Average: 2.1,
        cliffDrop: 1.8,
      },
    });

    const { dokCliffHandler } = await import('../analytics');
    const req = createReq({ from: '2026-04-01', to: '2026-04-08' });
    const res = createRes();

    await dokCliffHandler(req, res);

    expect(mockStorage.getDokCliffAnalytics).toHaveBeenCalledWith({
      from: '2026-04-01',
      to: '2026-04-08',
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      hasData: true,
      summary: expect.objectContaining({ cliffDrop: 1.8 }),
    }));
  });

  it('returns score distribution buckets', async () => {
    mockStorage.getScoreDistributionAnalytics.mockResolvedValue({
      hasData: true,
      buckets: [
        { score: 1, label: '1', count: 2, share: 0.05 },
        { score: 2, label: '2', count: 8, share: 0.2 },
        { score: 3, label: '3', count: 14, share: 0.35 },
        { score: 4, label: '4', count: 12, share: 0.3 },
        { score: 5, label: '5', count: 4, share: 0.1 },
      ],
      totals: {
        totalScoredItems: 40,
        averageScore: 3.25,
        modalScore: 3,
        distinctScores: 5,
      },
    });

    const { scoreDistributionHandler } = await import('../analytics');
    const req = createReq({ from: '2026-04-01', to: '2026-04-08', dokLevel: '3' });
    const res = createRes();

    await scoreDistributionHandler(req, res);

    expect(mockStorage.getScoreDistributionAnalytics).toHaveBeenCalledWith({
      from: '2026-04-01',
      to: '2026-04-08',
      dokLevel: 3,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      hasData: true,
      totals: expect.objectContaining({ modalScore: 3, totalScoredItems: 40 }),
    }));
  });

  it('returns score improvement rows', async () => {
    mockStorage.getScoreImprovementAnalytics.mockResolvedValue({
      hasData: true,
      rows: [{ brainliftId: 1, brainliftSlug: 'a', brainliftTitle: 'A', ownerUserId: 'u1', ownerName: 'User', ownerEmail: 'user@example.com', origin: 'ui', firstScore: 1, latestScore: 4, delta: 3, totalEvents: 2, totalWindows: 1, latestRecordedAt: '2026-04-08T00:00:00.000Z' }],
      summary: { totalBrainlifts: 1, improving: 1, declining: 0, averageDelta: 3 },
    });

    const { scoreImprovementHandler } = await import('../analytics');
    const req = createReq();
    const res = createRes();

    await scoreImprovementHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      hasData: true,
      rows: expect.arrayContaining([
        expect.objectContaining({ delta: 3 }),
      ]),
    }));
  });

  it('returns brainlift score history points', async () => {
    mockStorage.getBrainliftScoreHistoryAnalytics.mockResolvedValue({
      hasData: true,
      points: [
        { recordedAt: '2026-04-08T09:00:00.000Z', score: 2.77, kind: 'baseline' },
        { recordedAt: '2026-04-08T10:05:00.000Z', score: 3.73, kind: 'window_end' },
      ],
    });

    const { brainliftScoreHistoryHandler } = await import('../analytics');
    const req = createReq({ from: '2026-04-01', to: '2026-04-08', brainliftId: '708' });
    const res = createRes();

    await brainliftScoreHistoryHandler(req, res);

    expect(mockStorage.getBrainliftScoreHistoryAnalytics).toHaveBeenCalledWith({
      from: '2026-04-01',
      to: '2026-04-08',
      brainliftId: 708,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      hasData: true,
      points: expect.arrayContaining([
        expect.objectContaining({ score: 3.73 }),
      ]),
    }));
  });

  it('returns leaderboard rows for valid rankBy values', async () => {
    mockStorage.getLeaderboardAnalytics.mockResolvedValue({
      rankBy: 'dok1',
      rows: [{ userId: 'u1', userName: 'User', userEmail: 'user@example.com', value: 2, secondaryValue: 1 }],
    });

    const { leaderboardHandler } = await import('../analytics');
    const req = createReq({ rankBy: 'dok1' });
    const res = createRes();

    await leaderboardHandler(req, res);

    expect(mockStorage.getLeaderboardAnalytics).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      rankBy: 'dok1',
      limit: undefined,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      rankBy: 'dok1',
      rows: expect.arrayContaining([
        expect.objectContaining({ userId: 'u1', value: 2 }),
      ]),
    }));
  });

  it('rejects invalid rankBy values', async () => {
    const { leaderboardHandler } = await import('../analytics');
    const req = createReq({ rankBy: 'bad-value' });
    const res = createRes();

    await expect(leaderboardHandler(req, res)).rejects.toMatchObject({
      name: 'BadRequestError',
    });
  });
});
