/**
 * Tests for FR5: GET /api/internal/template endpoint
 *
 * Unit tests for the internal router's template handler logic.
 * Mocks: fs, requireServiceAuth middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock functions
const { mockReadFileSync, mockExistsSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockExistsSync: vi.fn(),
}));

// Mock fs module
vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));

// Mock the service auth middleware to pass through
vi.mock('../../middleware/service-auth', () => ({
  requireServiceAuth: vi.fn((_req: any, _res: any, next: any) => next()),
}));

// Mock asyncHandler to just pass through
vi.mock('../../middleware/error-handler', () => ({
  asyncHandler: (fn: any) => fn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function createMockReq(): any {
  return {};
}

function createMockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('GET /api/internal/template', () => {
  it('returns 200 with template content for valid request', async () => {
    const templateContent = '# Brainlift Template\n\nSome template content here.';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(templateContent);

    const { getTemplateHandler } = await import('../internal');
    const req = createMockReq();
    const res = createMockRes();

    await getTemplateHandler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      template: templateContent,
      format: 'markdown',
    });
  });

  it('returns template field as a string', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('# Template');

    const { getTemplateHandler } = await import('../internal');
    const req = createMockReq();
    const res = createMockRes();

    await getTemplateHandler(req, res);

    const responseData = res.json.mock.calls[0][0];
    expect(typeof responseData.template).toBe('string');
    expect(responseData.format).toBe('markdown');
  });

  it('returns 500 when template file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const { getTemplateHandler } = await import('../internal');
    const req = createMockReq();
    const res = createMockRes();

    await getTemplateHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('returns 500 when file read throws an error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    const { getTemplateHandler } = await import('../internal');
    const req = createMockReq();
    const res = createMockRes();

    await getTemplateHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('exports an internalRouter', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('# Template');

    const { internalRouter } = await import('../internal');

    expect(internalRouter).toBeDefined();
  });
});
