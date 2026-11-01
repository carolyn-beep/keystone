/**
 * Tests for FR4: Service Auth Middleware
 *
 * Unit tests with mocked storage and rate limiter.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Hoist mock functions so they're available in vi.mock factory
const { mockCheck } = vi.hoisted(() => ({
  mockCheck: vi.fn().mockReturnValue({ allowed: true }),
}));

// Mock the storage module before importing the middleware
vi.mock('../../storage/api-keys', () => ({
  validateApiKey: vi.fn(),
  findOrCreateUserByEmail: vi.fn(),
  findUserByEmail: vi.fn(),
}));

// Mock the rate limiter module with a proper class
vi.mock('../rate-limiter', () => {
  return {
    RateLimiter: class MockRateLimiter {
      check = mockCheck;
      reset = vi.fn();
    },
  };
});

import { requireServiceAuth } from '../service-auth';
import { validateApiKey, findOrCreateUserByEmail, findUserByEmail } from '../../storage/api-keys';

const mockedValidateApiKey = vi.mocked(validateApiKey);
const mockedFindOrCreate = vi.mocked(findOrCreateUserByEmail);
const mockedFindUser = vi.mocked(findUserByEmail);

function createMockReq(headers: Record<string, string> = {}): Partial<Request> {
  return {
    headers: Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
    ),
    get: function (name: string) {
      return (this as any).headers[name.toLowerCase()];
    } as any,
  };
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireServiceAuth', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();

    // Default: rate limit OK
    mockCheck.mockReturnValue({ allowed: true });

    // Default: valid key, existing user
    mockedValidateApiKey.mockResolvedValue({
      id: 1,
      key: 'test-key-abc',
      name: 'test-service',
      rateLimit: 60,
      isActive: true,
      scopes: ['*'],
      createdAt: new Date(),
      revokedAt: null,
    });
    mockedFindOrCreate.mockResolvedValue({
      userId: 'user-123',
      isNew: false,
      role: 'user' as const,
    });
    mockedFindUser.mockResolvedValue({
      userId: 'user-123',
      role: 'user' as const,
    });
  });

  it('sets authContext and serviceAuth for valid key + email and calls next()', async () => {
    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'test@example.com',
      'x-user-name': 'Test User',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).authContext).toEqual({
      userId: 'user-123',
      role: 'user',
      isAdmin: false,
    });
    expect((req as any).serviceAuth).toEqual({
      apiKeyId: 1,
      apiKeyName: 'test-service',
      scopes: ['*'],
    });
  });

  it('returns 401 when X-Service-Key header is missing', async () => {
    const req = createMockReq({
      'x-user-email': 'test@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('service key') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is invalid', async () => {
    mockedValidateApiKey.mockResolvedValue(null);

    const req = createMockReq({
      'x-service-key': 'invalid-key',
      'x-user-email': 'test@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when X-User-Email header is missing', async () => {
    const req = createMockReq({
      'x-service-key': 'test-key-abc',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('user email') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After when rate limited', async () => {
    mockCheck.mockReturnValue({ allowed: false, retryAfter: 30 });

    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'test@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', '30');
    expect(next).not.toHaveBeenCalled();
  });

  it('creates new user and proceeds when email is unknown', async () => {
    mockedFindOrCreate.mockResolvedValue({
      userId: 'new-user-456',
      isNew: true,
      role: 'user' as const,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'newuser@example.com',
      'x-user-name': 'New User',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(mockedFindOrCreate).toHaveBeenCalledWith('newuser@example.com', 'New User');
    expect(next).toHaveBeenCalled();
    expect((req as any).authContext.userId).toBe('new-user-456');
  });

  it('uses email prefix as fallback when X-User-Name is missing', async () => {
    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'johndoe@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(mockedFindOrCreate).toHaveBeenCalledWith('johndoe@example.com', 'johndoe');
    expect(next).toHaveBeenCalled();
  });

  it('propagates admin role in authContext for downstream ACL middleware', async () => {
    mockedFindOrCreate.mockResolvedValue({
      userId: 'admin-user-1',
      isNew: false,
      role: 'admin' as const,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'admin@example.com',
      'x-user-name': 'Admin User',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect((req as any).authContext).toEqual({
      userId: 'admin-user-1',
      role: 'admin',
      isAdmin: true,
    });
    expect(next).toHaveBeenCalled();
  });

  it('sets serviceAuth with apiKeyId and apiKeyName', async () => {
    mockedValidateApiKey.mockResolvedValue({
      id: 42,
      key: 'test-key-abc',
      name: 'brainlift-mcp-prod',
      rateLimit: 60,
      isActive: true,
      scopes: ['*'],
      createdAt: new Date(),
      revokedAt: null,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'test@example.com',
      'x-user-name': 'Test',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect((req as any).serviceAuth).toEqual({
      apiKeyId: 42,
      apiKeyName: 'brainlift-mcp-prod',
      scopes: ['*'],
    });
  });

  it('attaches scoped key scopes to serviceAuth', async () => {
    mockedValidateApiKey.mockResolvedValue({
      id: 43,
      key: 'test-key-scoped',
      name: 'brainlift-partner',
      rateLimit: 60,
      isActive: true,
      scopes: ['brainlifts:list', 'brainlifts:read'],
      createdAt: new Date(),
      revokedAt: null,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-scoped',
      'x-user-email': 'test@example.com',
      'x-user-name': 'Test',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect((req as any).serviceAuth).toEqual({
      apiKeyId: 43,
      apiKeyName: 'brainlift-partner',
      scopes: ['brainlifts:list', 'brainlifts:read'],
    });
  });

  it('returns 404 and does NOT auto-provision when scoped key sees an unknown email', async () => {
    mockedValidateApiKey.mockResolvedValue({
      id: 99,
      key: 'partner-key',
      name: 'christian-slack-integration',
      rateLimit: 150,
      isActive: true,
      scopes: ['brainlifts:list', 'brainlifts:read'],
      createdAt: new Date(),
      revokedAt: null,
    });
    mockedFindUser.mockResolvedValue(null);

    const req = createMockReq({
      'x-service-key': 'partner-key',
      'x-user-email': 'unknown@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(mockedFindUser).toHaveBeenCalledWith('unknown@example.com');
    expect(mockedFindOrCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Unknown user') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('uses lookup-only resolution for scoped key with known email', async () => {
    mockedValidateApiKey.mockResolvedValue({
      id: 99,
      key: 'partner-key',
      name: 'partner-service',
      rateLimit: 60,
      isActive: true,
      scopes: ['brainlifts:read'],
      createdAt: new Date(),
      revokedAt: null,
    });
    mockedFindUser.mockResolvedValue({ userId: 'known-user-1', role: 'user' });

    const req = createMockReq({
      'x-service-key': 'partner-key',
      'x-user-email': 'known@example.com',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(mockedFindUser).toHaveBeenCalledWith('known@example.com');
    expect(mockedFindOrCreate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect((req as any).authContext.userId).toBe('known-user-1');
  });

  it('wildcard key still auto-provisions and never calls findUserByEmail', async () => {
    mockedFindOrCreate.mockResolvedValue({
      userId: 'new-via-mcp',
      isNew: true,
      role: 'user' as const,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-abc',
      'x-user-email': 'brandnew@example.com',
      'x-user-name': 'Brand New',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect(mockedFindOrCreate).toHaveBeenCalledWith('brandnew@example.com', 'Brand New');
    expect(mockedFindUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect((req as any).authContext.userId).toBe('new-via-mcp');
  });

  it('falls back to wildcard scope when a legacy key has no scopes value', async () => {
    mockedValidateApiKey.mockResolvedValue({
      id: 44,
      key: 'test-key-legacy',
      name: 'legacy-service',
      rateLimit: 60,
      isActive: true,
      scopes: null as any,
      createdAt: new Date(),
      revokedAt: null,
    });

    const req = createMockReq({
      'x-service-key': 'test-key-legacy',
      'x-user-email': 'test@example.com',
      'x-user-name': 'Test',
    });
    const res = createMockRes();

    await requireServiceAuth(req as Request, res as Response, next);

    expect((req as any).serviceAuth).toEqual({
      apiKeyId: 44,
      apiKeyName: 'legacy-service',
      scopes: ['*'],
    });
    // Legacy null-scope keys must take the wildcard provisioning path —
    // not lookup-only — or we'd silently break the first-party MCP if its
    // row ever loses its scopes value.
    expect(mockedFindOrCreate).toHaveBeenCalledWith('test@example.com', 'Test');
    expect(mockedFindUser).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
