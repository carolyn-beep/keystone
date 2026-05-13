import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    createBlankBrainlift: vi.fn(),
    setBrainliftPhase: vi.fn(),
  },
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

vi.mock('../../ai/brainliftExtractor', () => ({
  extractBrainlift: vi.fn(),
}));

vi.mock('../../utils/content-extractor', () => ({
  extractContent: vi.fn(),
  validateContent: vi.fn(),
}));

vi.mock('../../services/brainlift', () => ({
  analyzeBrainliftRedundancy: vi.fn(),
  extractBrainliftExperts: vi.fn(),
  queueBrainliftAssetJobs: vi.fn(),
  saveBrainliftFromAI: vi.fn(),
}));

vi.mock('../../services/brainlift-preformat', () => ({
  preformatHierarchy: vi.fn(),
}));

vi.mock('../../ai/preformat/evaluator', () => ({
  evaluateNeedsPreformat: vi.fn(),
}));

function createReq(overrides: Record<string, unknown> = {}): any {
  return {
    params: { slug: 'research-project' },
    body: {},
    brainlift: { id: 11, slug: 'research-project', phase: 'research' },
    authContext: {
      userId: 'user-1',
      isAdmin: false,
    },
    ...overrides,
  };
}

function createRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('brainlift research-first API handlers', () => {
  it('createBlankBrainliftHandler creates a research-phase blank project', async () => {
    const { createBlankBrainliftHandler } = await import('../brainlifts');
    const req = createReq({
      body: { title: 'Battery Chemistry', description: 'Research notes' },
    });
    const res = createRes();

    mockStorage.createBlankBrainlift.mockResolvedValue({
      id: 99,
      title: 'Battery Chemistry',
      description: 'Research notes',
      phase: 'research',
      summary: {
        totalFacts: 0,
        meanScore: '0',
        score5Count: 0,
        contradictionCount: 0,
      },
    });

    await createBlankBrainliftHandler(req, res);

    expect(mockStorage.createBlankBrainlift).toHaveBeenCalledWith({
      userId: 'user-1',
      title: 'Battery Chemistry',
      description: 'Research notes',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ phase: 'research' }));
  });

  it('createBlankBrainliftHandler requires a non-empty title', async () => {
    const { createBlankBrainliftHandler } = await import('../brainlifts');

    await expect(createBlankBrainliftHandler(createReq({ body: { title: '  ' } }), createRes()))
      .rejects.toThrow('Title is required');
    expect(mockStorage.createBlankBrainlift).not.toHaveBeenCalled();
  });

  it('setBrainliftPhaseHandler rejects non-admin users', async () => {
    const { setBrainliftPhaseHandler } = await import('../brainlifts');

    await expect(setBrainliftPhaseHandler(
      createReq({ body: { phase: 'authoring' }, authContext: { userId: 'user-1', isAdmin: false } }),
      createRes(),
    )).rejects.toThrow('Admin access required');

    expect(mockStorage.setBrainliftPhase).not.toHaveBeenCalled();
  });

  it('setBrainliftPhaseHandler validates and updates phase for admins', async () => {
    const { setBrainliftPhaseHandler } = await import('../brainlifts');
    const req = createReq({
      body: { phase: 'authoring' },
      authContext: { userId: 'admin-1', isAdmin: true },
    });
    const res = createRes();

    mockStorage.setBrainliftPhase.mockResolvedValue({
      id: 11,
      phase: 'authoring',
    });

    await setBrainliftPhaseHandler(req, res);

    expect(mockStorage.setBrainliftPhase).toHaveBeenCalledWith(11, 'authoring');
    expect(res.json).toHaveBeenCalledWith({ id: 11, phase: 'authoring' });
  });

  it('setBrainliftPhaseHandler rejects invalid phase values', async () => {
    const { setBrainliftPhaseHandler } = await import('../brainlifts');

    await expect(setBrainliftPhaseHandler(
      createReq({
        body: { phase: 'drafting' },
        authContext: { userId: 'admin-1', isAdmin: true },
      }),
      createRes(),
    )).rejects.toThrow('Invalid phase');
  });
});
