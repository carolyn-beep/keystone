import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { BadRequestError, ForbiddenError, NotFoundError } from '../error-handler';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getBrainliftRecordBySlug: vi.fn(),
    getBrainliftBySlug: vi.fn(),
    getBrainliftById: vi.fn(),
    canAccessBrainlift: vi.fn(),
    canModifyBrainlift: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

import { requireBrainliftAccess, requireBrainliftModify } from '../brainlift-auth';

const authContext = {
  userId: 'user-123',
  role: 'user' as const,
  isAdmin: false,
};

const brainliftRecord = {
  id: 42,
  slug: 'lightweight-record',
  title: 'Lightweight Record',
  description: 'A row-only brainlift record',
  displayPurpose: 'Testing auth',
  author: 'Middleware Test',
  createdByUserId: authContext.userId,
  classification: 'brainlift' as const,
  rejectionReason: null,
  rejectionSubtype: null,
  rejectionRecommendation: null,
  flags: null,
  improperlyFormatted: false,
  originalContent: null,
  sourceType: 'test',
  origin: null,
  coverImageUrl: null,
  gdriveRootFolderId: null,
  expertDiagnostics: null,
  summary: {
    totalFacts: 0,
    meanScore: '0',
    score5Count: 0,
    contradictionCount: 0,
  },
  importStatus: 'complete' as const,
  importHierarchy: null,
  createdAt: new Date('2026-05-11T00:00:00Z'),
};

function createReq(slug?: string): Request {
  return {
    params: slug === undefined ? {} : { slug },
    authContext,
  } as unknown as Request;
}

function createRes(): Response {
  return {} as Response;
}

describe('requireBrainliftAccess', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(brainliftRecord);
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      ...brainliftRecord,
      facts: [],
      experts: [],
      contradictionClusters: [],
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockStorage.canModifyBrainlift.mockResolvedValue(true);
  });

  it('uses the lightweight slug lookup, checks access, attaches the row, and calls next (FR2)', async () => {
    const req = createReq(brainliftRecord.slug);

    await requireBrainliftAccess(req, createRes(), next);

    expect(mockStorage.getBrainliftRecordBySlug).toHaveBeenCalledWith(brainliftRecord.slug);
    expect(mockStorage.getBrainliftBySlug).not.toHaveBeenCalled();
    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(brainliftRecord, authContext);
    expect(req.brainlift).toBe(brainliftRecord);
    expect(next).toHaveBeenCalledWith();
  });

  it('yields BadRequestError when slug is missing (FR2)', async () => {
    const req = createReq();

    await requireBrainliftAccess(req, createRes(), next);

    expect(mockStorage.getBrainliftRecordBySlug).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    expect((next as any).mock.calls[0][0].message).toBe('Brainlift slug is required');
  });

  it('yields NotFoundError when no brainlift exists for the slug (FR2)', async () => {
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(undefined);

    await requireBrainliftAccess(createReq('missing'), createRes(), next);

    expect(mockStorage.canAccessBrainlift).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect((next as any).mock.calls[0][0].message).toBe('Brainlift not found');
  });

  it('yields ForbiddenError when read access is denied (FR2)', async () => {
    mockStorage.canAccessBrainlift.mockResolvedValue(false);

    await requireBrainliftAccess(createReq(brainliftRecord.slug), createRes(), next);

    expect(mockStorage.canAccessBrainlift).toHaveBeenCalledWith(brainliftRecord, authContext);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect((next as any).mock.calls[0][0].message).toBe('Access denied');
  });
});

describe('requireBrainliftModify', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(brainliftRecord);
    mockStorage.getBrainliftBySlug.mockResolvedValue({
      ...brainliftRecord,
      facts: [],
      experts: [],
      contradictionClusters: [],
    });
    mockStorage.canAccessBrainlift.mockResolvedValue(true);
    mockStorage.canModifyBrainlift.mockResolvedValue(true);
  });

  it('uses the lightweight slug lookup, checks modify access, attaches the row, and calls next (FR2)', async () => {
    const req = createReq(brainliftRecord.slug);

    await requireBrainliftModify(req, createRes(), next);

    expect(mockStorage.getBrainliftRecordBySlug).toHaveBeenCalledWith(brainliftRecord.slug);
    expect(mockStorage.getBrainliftBySlug).not.toHaveBeenCalled();
    expect(mockStorage.canModifyBrainlift).toHaveBeenCalledWith(brainliftRecord, authContext);
    expect(req.brainlift).toBe(brainliftRecord);
    expect(next).toHaveBeenCalledWith();
  });

  it('yields NotFoundError when no brainlift exists for the slug (FR2)', async () => {
    mockStorage.getBrainliftRecordBySlug.mockResolvedValue(undefined);

    await requireBrainliftModify(createReq('missing'), createRes(), next);

    expect(mockStorage.canModifyBrainlift).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    expect((next as any).mock.calls[0][0].message).toBe('Brainlift not found');
  });

  it('yields ForbiddenError when modify access is denied (FR2)', async () => {
    mockStorage.canModifyBrainlift.mockResolvedValue(false);

    await requireBrainliftModify(createReq(brainliftRecord.slug), createRes(), next);

    expect(mockStorage.canModifyBrainlift).toHaveBeenCalledWith(brainliftRecord, authContext);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect((next as any).mock.calls[0][0].message).toBe('Access denied');
  });
});
