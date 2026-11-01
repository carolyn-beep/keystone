import { describe, it, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireServiceScope } from '../service-scope';

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireServiceScope', () => {
  it('returns 401 when serviceAuth is missing', () => {
    const req = {} as Request;
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    requireServiceScope('brainlifts:read')(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing service authentication' });
    expect(next).not.toHaveBeenCalled();
  });

  it('allows wildcard scoped service keys', () => {
    const req = {
      serviceAuth: { apiKeyId: 1, apiKeyName: 'wildcard', scopes: ['*'] },
    } as Request;
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    requireServiceScope('brainlifts:read')(req, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows exact matching scope', () => {
    const req = {
      serviceAuth: { apiKeyId: 2, apiKeyName: 'reader', scopes: ['brainlifts:read'] },
      authContext: { userId: 'unchanged', role: 'user', isAdmin: false },
    } as Request;
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    requireServiceScope('brainlifts:read')(req, res as Response, next);

    expect((req as any).authContext).toEqual({ userId: 'unchanged', role: 'user', isAdmin: false });
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when authenticated key lacks the required scope', () => {
    const req = {
      serviceAuth: { apiKeyId: 3, apiKeyName: 'list-only', scopes: ['brainlifts:list'] },
    } as Request;
    const res = createMockRes();
    const next: NextFunction = vi.fn();

    requireServiceScope('brainlifts:read')(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient service key scope' });
    expect(next).not.toHaveBeenCalled();
  });
});
