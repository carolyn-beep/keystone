import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  mockRequireAdmin,
  mockGetProviderBreaker,
  mockGetFailoverCount,
  mockGetRecentFailoverEvents,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn((_req: any, _res: any, next: any) => next()),
  mockGetProviderBreaker: vi.fn(),
  mockGetFailoverCount: vi.fn(),
  mockGetRecentFailoverEvents: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock('../../middleware/error-handler', () => ({
  asyncHandler: (fn: any) => fn,
}));

vi.mock('../../ai/client/circuit-breaker', () => ({
  getProviderBreaker: mockGetProviderBreaker,
}));

vi.mock('../../ai/client/provider-events', () => ({
  getFailoverCount: mockGetFailoverCount,
  getRecentFailoverEvents: mockGetRecentFailoverEvents,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function createReq(): any {
  return { query: {}, params: {}, body: {}, authContext: { isAdmin: true } };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('admin providers route', () => {
  it('mounts the admin providers endpoint behind requireAdmin', async () => {
    const { adminRouter } = await import('../admin');
    const paths = adminRouter.stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);

    expect(paths).toContain('/api/admin/providers');

    for (const layer of adminRouter.stack.filter((entry: any) => entry.route)) {
      expect(layer.route.stack.some((mw: any) => mw.handle === mockRequireAdmin)).toBe(true);
    }
  });

  it('returns provider snapshots and recent failovers', async () => {
    const { adminRouter } = await import('../admin');

    const providerStates: Record<string, 'closed' | 'open' | 'half-open'> = {
      openrouter: 'closed',
      fireworks: 'half-open',
    };

    mockGetProviderBreaker.mockImplementation((provider: string) => ({
      getState: () => providerStates[provider] ?? 'closed',
    }));
    mockGetFailoverCount.mockImplementation((provider: string) => (
      provider === 'anthropic' ? 3 : 0
    ));
    mockGetRecentFailoverEvents.mockReturnValue([
      {
        timestamp: new Date('2026-04-14T12:00:00Z'),
        caller: 'quizGenerator.questionGeneration',
        originalModel: 'anthropic/claude-sonnet-4.6',
        actualModel: 'accounts/fireworks/models/glm-4p7',
        failedProvider: 'openrouter',
        failoverProvider: 'fireworks',
        reason: 'retry_exhausted',
      },
    ]);

    const layer = adminRouter.stack.find((entry: any) => entry.route?.path === '/api/admin/providers');
    const handler = layer.route.stack.find((mw: any) => mw.handle !== mockRequireAdmin).handle;
    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      providers: [
        expect.objectContaining({ provider: 'openrouter', state: 'closed', failoversLast24h: 0 }),
        expect.objectContaining({ provider: 'fireworks', state: 'half-open', failoversLast24h: 0 }),
      ],
      recentFailovers: [
        expect.objectContaining({
          caller: 'quizGenerator.questionGeneration',
          failedProvider: 'openrouter',
          failoverProvider: 'fireworks',
          reason: 'retry_exhausted',
          timestamp: '2026-04-14T12:00:00.000Z',
        }),
      ],
    }));
  });
});
