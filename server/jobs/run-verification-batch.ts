import type { JobHelpers } from 'graphile-worker';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { gradeDOK2Summary } from '../ai/dok2Grader';
import {
  completeQABatch,
  failQABatch,
  getLatestBaselineQABatch,
  getLatestPendingQABatch,
  getVerificationTruthRowsForBatch,
  persistVerificationCurrentScores,
  setQABatchRunning,
  updateQABatch,
} from '../storage/qa-batches';

type TruthRow = Awaited<ReturnType<typeof getVerificationTruthRowsForBatch>>[number];
type TruthRowMetadata = Record<string, unknown> | null;

function toMetadata(row: TruthRow): Record<string, unknown> {
  return row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
}

function toFrozenContext(row: TruthRow): Record<string, unknown> {
  return row.frozenContext && typeof row.frozenContext === 'object'
    ? row.frozenContext as Record<string, unknown>
    : {};
}

function parseJudgment(row: TruthRow): 'agree' | 'borderline' | 'disagree' {
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};

  const judgment = metadata.humanJudgment;
  if (judgment === 'agree' || judgment === 'borderline' || judgment === 'disagree') {
    return judgment;
  }

  if (row.aiScore === null || row.humanScore === null) {
    return 'disagree';
  }

  const delta = Math.abs(row.aiScore - row.humanScore);
  if (delta === 0) return 'agree';
  if (delta === 1) return 'borderline';
  return 'disagree';
}

function weightedAgreement(rows: TruthRow[]): number {
  if (rows.length === 0) {
    return 0;
  }

  const total = rows.reduce((sum, row) => {
    if (row.aiScore === null || row.humanScore === null) {
      return sum;
    }

    const diff = Math.abs(row.aiScore - row.humanScore);
    return sum + Math.max(0, 1 - (diff / 4));
  }, 0);

  return Number((total / rows.length).toFixed(3));
}

function buildVerificationMetrics(currentRows: TruthRow[], baselineRows: TruthRow[]) {
  const baselineByKey = new Map(
    baselineRows.map((row) => [`${row.assetKey}:${row.dokLevel}:${row.stableKey}`, row]),
  );

  let changedCount = 0;
  let agreeChangedCount = 0;
  let borderlineChangedCount = 0;
  let disagreeChangedCount = 0;
  let identicalCount = 0;

  for (const row of currentRows) {
    const baseline = baselineByKey.get(`${row.assetKey}:${row.dokLevel}:${row.stableKey}`);
    if (!baseline) {
      changedCount += 1;
      disagreeChangedCount += 1;
      continue;
    }

    if (row.aiScore === baseline.aiScore) {
      identicalCount += 1;
      continue;
    }

    changedCount += 1;
    const judgment = parseJudgment(row);
    if (judgment === 'agree') agreeChangedCount += 1;
    else if (judgment === 'borderline') borderlineChangedCount += 1;
    else disagreeChangedCount += 1;
  }

  const totalItems = currentRows.length;
  const scoreStabilityRate = totalItems === 0
    ? 0
    : Number((identicalCount / totalItems).toFixed(3));

  return {
    scoreStabilityRate,
    changedCount,
    agreeChangedCount,
    borderlineChangedCount,
    disagreeChangedCount,
    weightedAgreement: Number(weightedAgreement(currentRows).toFixed(3)),
    totalItems,
  };
}

export function buildVerificationMetricsForTest(
  currentRows: TruthRow[],
  baselineRows: TruthRow[],
) {
  return buildVerificationMetrics(currentRows, baselineRows);
}

export async function deriveVerificationScoresForTest(rows: TruthRow[]) {
  return Promise.all(rows.map((row) => deriveVerificationCurrentScore(row)));
}

async function deriveVerificationCurrentScore(row: TruthRow): Promise<{
  aiScore: number | null;
  metadata: TruthRowMetadata;
  scoringMode: string;
}> {
  const metadata = toMetadata(row);
  const frozenContext = toFrozenContext(row);

  if (row.dokLevel === 2) {
    const points = Array.isArray(frozenContext.points)
      ? frozenContext.points.filter((point): point is string => typeof point === 'string')
      : [];
    const relatedFacts = Array.isArray(frozenContext.relatedFacts)
      ? frozenContext.relatedFacts.filter((item) => item && typeof item === 'object').map((item) => ({
        fact: typeof (item as Record<string, unknown>).fact === 'string'
          ? String((item as Record<string, unknown>).fact)
          : '',
        source: typeof (item as Record<string, unknown>).source === 'string'
          ? String((item as Record<string, unknown>).source)
          : null,
      }))
      : [];

    const result = await gradeDOK2Summary(
      points,
      relatedFacts,
      typeof frozenContext.purpose === 'string' ? frozenContext.purpose : '',
      typeof frozenContext.sourceUrl === 'string' ? frozenContext.sourceUrl : null,
    );

    return {
      aiScore: result.score,
      scoringMode: 'dok2-grader',
      metadata: {
        ...metadata,
        reviewedAiScore: row.aiScore,
        currentAiScore: result.score,
        currentScoredAt: new Date().toISOString(),
        currentScoringMode: 'dok2-grader',
      },
    };
  }

  const fact = typeof frozenContext.fact === 'string' ? frozenContext.fact : '';
  const source = typeof frozenContext.source === 'string' ? frozenContext.source : '';
  const result = await verifyFactWithAllModels(fact, source, '', !source);

  return {
    aiScore: result.consensus.consensusScore,
    scoringMode: 'fact-verifier',
    metadata: {
      ...metadata,
      reviewedAiScore: row.aiScore,
      currentAiScore: result.consensus.consensusScore,
      currentScoredAt: new Date().toISOString(),
      currentScoringMode: 'fact-verifier',
    },
  };
}

export async function runVerificationBatchJob(
  payload: { batchType: 'verification' },
  helpers: JobHelpers,
): Promise<void> {
  const batch = await getLatestPendingQABatch(payload.batchType);
  if (!batch) {
    helpers.logger.info('[Analytics QA] No pending verification batch found');
    return;
  }

  const running = await setQABatchRunning(batch.id);
  const currentRows = await getVerificationTruthRowsForBatch(running.id);

  try {
    if (running.isBaseline) {
      await updateQABatch(running.id, { sampleCount: currentRows.length });
      const metrics = buildVerificationMetrics(currentRows, currentRows);
      await completeQABatch(running.id, metrics as unknown as Record<string, unknown>);
      return;
    }

    const scoredRows = await Promise.all(currentRows.map(async (row) => {
      const scored = await deriveVerificationCurrentScore(row);
      return {
        ...row,
        aiScore: scored.aiScore,
        metadata: scored.metadata,
      };
    }));

    await persistVerificationCurrentScores(running.id, scoredRows.map((row) => ({
      assetKey: row.assetKey,
      dokLevel: row.dokLevel,
      stableKey: row.stableKey,
      aiScore: row.aiScore,
      metadata: row.metadata,
    })));

    const baselineBatch = running.baselineBatchId
      ? await getLatestBaselineQABatch('verification')
      : await getLatestBaselineQABatch('verification');

    if (!baselineBatch) {
      await failQABatch(running.id, 'Missing baseline verification batch');
      return;
    }

    if (!running.baselineBatchId || running.baselineBatchId !== baselineBatch.id) {
      await updateQABatch(running.id, { baselineBatchId: baselineBatch.id });
    }

    const baselineRows = await getVerificationTruthRowsForBatch(baselineBatch.id);
    await updateQABatch(running.id, { sampleCount: scoredRows.length });
    const metrics = buildVerificationMetrics(scoredRows, baselineRows);

    await completeQABatch(running.id, metrics as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    helpers.logger.error('[Analytics QA] Verification batch failed', { error: message });
    await failQABatch(running.id, message);
  }
}
