import { describe, expect, it, vi } from 'vitest';

const {
  mockVerifyFactWithAllModels,
  mockGradeDOK2Summary,
} = vi.hoisted(() => ({
  mockVerifyFactWithAllModels: vi.fn(),
  mockGradeDOK2Summary: vi.fn(),
}));

vi.mock('../../storage/qa-batches', () => ({
  completeQABatch: vi.fn(),
  failQABatch: vi.fn(),
  getLatestBaselineQABatch: vi.fn(),
  getLatestPendingQABatch: vi.fn(),
  getVerificationTruthRowsForBatch: vi.fn(),
  setQABatchRunning: vi.fn(),
  updateQABatch: vi.fn(),
}));

vi.mock('../../ai/factVerifier', () => ({
  verifyFactWithAllModels: mockVerifyFactWithAllModels,
}));

vi.mock('../../ai/dok2Grader', () => ({
  gradeDOK2Summary: mockGradeDOK2Summary,
}));

vi.mock('../../utils/withJob', () => ({
  withJob: vi.fn(),
}));

describe('analytics QA job helpers', () => {
  it('computes verification stability and agreement buckets', async () => {
    const { buildVerificationMetricsForTest } = await import('../run-verification-batch');

    const metrics = buildVerificationMetricsForTest(
      [
        {
          assetKey: 'a',
          dokLevel: 1,
          stableKey: '1',
          aiScore: 3,
          humanScore: 3,
          metadata: { humanJudgment: 'agree' },
        },
        {
          assetKey: 'b',
          dokLevel: 1,
          stableKey: '2',
          aiScore: 2,
          humanScore: 3,
          metadata: { humanJudgment: 'borderline' },
        },
        {
          assetKey: 'c',
          dokLevel: 2,
          stableKey: '3',
          aiScore: 1,
          humanScore: 5,
          metadata: { humanJudgment: 'disagree' },
        },
      ] as any[],
      [
        {
          assetKey: 'a',
          dokLevel: 1,
          stableKey: '1',
          aiScore: 3,
          humanScore: 3,
          metadata: {},
        },
        {
          assetKey: 'b',
          dokLevel: 1,
          stableKey: '2',
          aiScore: 1,
          humanScore: 3,
          metadata: {},
        },
      ] as any[],
    );

    expect(metrics).toEqual({
      scoreStabilityRate: 0.333,
      changedCount: 2,
      agreeChangedCount: 0,
      borderlineChangedCount: 1,
      disagreeChangedCount: 1,
      weightedAgreement: 0.583,
      totalItems: 3,
    });
  });

  it('derives live verification scores from frozen context', async () => {
    mockVerifyFactWithAllModels.mockResolvedValue({
      consensus: { consensusScore: 4 },
    });
    mockGradeDOK2Summary.mockResolvedValue({
      score: 2,
    });

    const { deriveVerificationScoresForTest } = await import('../run-verification-batch');
    const scored = await deriveVerificationScoresForTest([
      {
        assetKey: 'a',
        dokLevel: 1,
        stableKey: '1',
        aiScore: 1,
        humanScore: 2,
        frozenContext: { dokLevel: 1, fact: 'Fact text', source: 'https://example.com' },
        metadata: { humanJudgment: 'agree' },
      },
      {
        assetKey: 'b',
        dokLevel: 2,
        stableKey: '2',
        aiScore: 2,
        humanScore: 3,
        frozenContext: {
          dokLevel: 2,
          points: ['Point A', 'Point B'],
          sourceName: 'Source',
          sourceUrl: 'https://example.com',
          relatedFacts: [{ fact: 'Related fact', source: null }],
          purpose: 'Test purpose',
        },
        metadata: { humanJudgment: 'borderline' },
      },
    ] as any[]);

    expect(scored[0].aiScore).toBe(4);
    expect(scored[0].metadata).toEqual(expect.objectContaining({
      reviewedAiScore: 1,
      currentAiScore: 4,
      currentScoringMode: 'fact-verifier',
    }));
    expect(scored[1].aiScore).toBe(2);
    expect(scored[1].metadata).toEqual(expect.objectContaining({
      reviewedAiScore: 2,
      currentAiScore: 2,
      currentScoringMode: 'dok2-grader',
    }));
  });

  it('parses verification import formats', async () => {
    const { parseCsv, parseTruthSetRecord } = await import('../../../scripts/import-verification-truth-set');

    expect(parseCsv('assetKey,dokLevel,aiScore,humanScore,metadata\nx,1,4,5,"truth, set"'))
      .toEqual([
        {
          assetKey: 'x',
          dokLevel: '1',
          aiScore: '4',
          humanScore: '5',
          metadata: 'truth, set',
        },
      ]);

    expect(parseTruthSetRecord({
      assetKey: '',
      dokLevel: '2',
      points: 'Point A|Point B',
      aiScore: '3',
      humanScore: '4',
      metadata: '{"source":"truth"}',
      humanJudgment: 'agree',
      reviewedBy: 'Carolyn',
      active: 'false',
      sourceItemId: '17',
      brainliftId: '9',
      itemId: '42',
    })).toEqual(expect.objectContaining({
      assetKey: '17',
      dokLevel: 2,
      aiScore: 3,
      humanScore: 4,
      frozenContext: expect.objectContaining({
        dokLevel: 2,
        points: ['Point A', 'Point B'],
      }),
      metadata: expect.objectContaining({
        sourceItemId: 17,
        brainliftId: 9,
        itemId: 42,
        humanJudgment: 'agree',
        reviewedBy: 'Carolyn',
        active: false,
      }),
    }));
  });
});
