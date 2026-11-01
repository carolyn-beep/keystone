/**
 * FR3 routes: GET /api/users/me/preferences + PATCH /api/users/me/seen-explainer.
 *
 * Mount the router into a minimal Express app with mocked auth + storage and
 * exercise each endpoint via Node's built-in fetch. Mirrors the pattern used
 * in `web-aiWritingSignal-routes.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';

// ── Hoisted mocks ──

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getUserPreferences: vi.fn(),
    markExplainerSeen: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({ storage: mockStorage }));

vi.mock('../../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.authContext = { userId: 'test-user-1', isAdmin: false, role: 'user' };
    next();
  },
}));

// ── Helpers ──

async function makeRequest(
  app: express.Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function makeApp(): Promise<express.Express> {
  const { usersRouter } = await import('../users');
  const { errorHandler } = await import('../../middleware/error-handler');
  const app = express();
  app.use(express.json());
  app.use(usersRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/users/me/preferences', () => {
  it('returns the user preferences from storage', async () => {
    mockStorage.getUserPreferences.mockResolvedValue({ seenExplainers: ['dok1'] });
    const app = await makeApp();
    const res = await makeRequest(app, 'GET', '/api/users/me/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seenExplainers: ['dok1'] });
    expect(mockStorage.getUserPreferences).toHaveBeenCalledWith('test-user-1');
  });

  it('returns empty array for new user', async () => {
    mockStorage.getUserPreferences.mockResolvedValue({ seenExplainers: [] });
    const app = await makeApp();
    const res = await makeRequest(app, 'GET', '/api/users/me/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seenExplainers: [] });
  });
});

describe('PATCH /api/users/me/seen-explainer', () => {
  it('marks a key seen and returns the updated array', async () => {
    mockStorage.markExplainerSeen.mockResolvedValue(['dok1']);
    const app = await makeApp();
    const res = await makeRequest(
      app,
      'PATCH',
      '/api/users/me/seen-explainer',
      { key: 'dok1' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ seenExplainers: ['dok1'] });
    expect(mockStorage.markExplainerSeen).toHaveBeenCalledWith('test-user-1', 'dok1');
  });

  it('rejects empty key (400)', async () => {
    const app = await makeApp();
    const res = await makeRequest(
      app,
      'PATCH',
      '/api/users/me/seen-explainer',
      { key: '' },
    );
    expect(res.status).toBe(400);
    expect(mockStorage.markExplainerSeen).not.toHaveBeenCalled();
  });

  it('rejects missing key (400)', async () => {
    const app = await makeApp();
    const res = await makeRequest(
      app,
      'PATCH',
      '/api/users/me/seen-explainer',
      {},
    );
    expect(res.status).toBe(400);
    expect(mockStorage.markExplainerSeen).not.toHaveBeenCalled();
  });

  it('rejects non-string key (400)', async () => {
    const app = await makeApp();
    const res = await makeRequest(
      app,
      'PATCH',
      '/api/users/me/seen-explainer',
      { key: 123 },
    );
    expect(res.status).toBe(400);
    expect(mockStorage.markExplainerSeen).not.toHaveBeenCalled();
  });

  it('rejects key > 64 chars (400)', async () => {
    const app = await makeApp();
    const res = await makeRequest(
      app,
      'PATCH',
      '/api/users/me/seen-explainer',
      { key: 'x'.repeat(65) },
    );
    expect(res.status).toBe(400);
    expect(mockStorage.markExplainerSeen).not.toHaveBeenCalled();
  });
});
