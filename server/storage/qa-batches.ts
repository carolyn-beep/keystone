import {
  db,
  and,
  asc,
  desc,
  eq,
  inArray,
  qaBatches,
  verificationTruthSet,
} from './base';
import type {
  QABatchRow,
  QABatchStatus,
  QABatchType,
  VerificationTruthImportRow,
} from '@shared/analytics-types';

export interface CreateQABatchInput {
  type: QABatchType;
  status?: QABatchStatus;
  isBaseline?: boolean;
  baselineBatchId?: number | null;
  sampleCount?: number;
  metrics?: Record<string, unknown> | null;
  artifactLabel?: string | null;
  error?: string | null;
}

export async function createQABatch(input: CreateQABatchInput): Promise<QABatchRow> {
  const [batch] = await db.insert(qaBatches).values({
    type: input.type,
    status: input.status ?? 'pending',
    isBaseline: input.isBaseline ?? false,
    baselineBatchId: input.baselineBatchId ?? null,
    sampleCount: input.sampleCount ?? 0,
    metrics: input.metrics ?? null,
    artifactLabel: input.artifactLabel ?? null,
    error: input.error ?? null,
    startedAt: input.status === 'running' ? new Date() : null,
  }).returning();

  return batch as QABatchRow;
}

export async function updateQABatch(
  batchId: number,
  values: Partial<CreateQABatchInput> & {
    status?: QABatchStatus;
    startedAt?: Date | null;
    completedAt?: Date | null;
    error?: string | null;
  },
): Promise<QABatchRow> {
  const [batch] = await db.update(qaBatches)
    .set(values as any)
    .where(eq(qaBatches.id, batchId))
    .returning();

  return batch as QABatchRow;
}

export async function getQABatchById(batchId: number): Promise<QABatchRow | null> {
  const [batch] = await db.select().from(qaBatches).where(eq(qaBatches.id, batchId));
  return batch ? (batch as QABatchRow) : null;
}

export async function getLatestQABatchByType(
  type: QABatchType,
  statuses: QABatchStatus[] = ['pending', 'running', 'completed', 'failed'],
): Promise<QABatchRow | null> {
  const rows = await db.select().from(qaBatches)
    .where(and(
      eq(qaBatches.type, type),
      inArray(qaBatches.status, statuses),
    ))
    .orderBy(desc(qaBatches.createdAt), desc(qaBatches.id))
    .limit(1);

  return rows[0] ? (rows[0] as QABatchRow) : null;
}

export async function getLatestBaselineQABatch(type: QABatchType): Promise<QABatchRow | null> {
  const rows = await db.select().from(qaBatches)
    .where(and(
      eq(qaBatches.type, type),
      eq(qaBatches.isBaseline, true),
      eq(qaBatches.status, 'completed'),
    ))
    .orderBy(desc(qaBatches.completedAt), desc(qaBatches.createdAt))
    .limit(1);

  return rows[0] ? (rows[0] as QABatchRow) : null;
}

export async function getLatestPendingQABatch(type: QABatchType): Promise<QABatchRow | null> {
  return getLatestQABatchByType(type, ['pending', 'running']);
}

export async function setQABatchRunning(batchId: number): Promise<QABatchRow> {
  const [batch] = await db.update(qaBatches)
    .set({
      status: 'running',
      startedAt: new Date(),
      error: null,
    })
    .where(eq(qaBatches.id, batchId))
    .returning();

  return batch as QABatchRow;
}

export async function completeQABatch(
  batchId: number,
  metrics: Record<string, unknown>,
): Promise<QABatchRow> {
  const [batch] = await db.update(qaBatches)
    .set({
      status: 'completed',
      metrics,
      completedAt: new Date(),
      error: null,
    })
    .where(eq(qaBatches.id, batchId))
    .returning();

  return batch as QABatchRow;
}

export async function failQABatch(batchId: number, error: string): Promise<QABatchRow> {
  const [batch] = await db.update(qaBatches)
    .set({
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    .where(eq(qaBatches.id, batchId))
    .returning();

  return batch as QABatchRow;
}

export async function replaceVerificationTruthRows(
  batchId: number,
  rows: VerificationTruthImportRow[],
): Promise<void> {
  await db.delete(verificationTruthSet).where(eq(verificationTruthSet.batchId, batchId));
  if (rows.length === 0) {
    return;
  }

  await db.insert(verificationTruthSet).values(rows.map((row) => ({
    batchId,
    assetKey: row.assetKey,
    dokLevel: row.dokLevel,
    stableKey: row.stableKey,
    frozenContext: row.frozenContext as unknown as Record<string, unknown>,
    aiScore: row.aiScore,
    humanScore: row.humanScore,
    metadata: row.metadata as Record<string, unknown> | null,
  })) as any);
}

export async function persistVerificationCurrentScores(
  batchId: number,
  items: Array<{
    assetKey: string;
    dokLevel: number;
    stableKey: string;
    aiScore: number | null;
    metadata: Record<string, unknown> | null;
  }>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const item of items) {
      await tx.update(verificationTruthSet)
        .set({
          aiScore: item.aiScore,
          metadata: item.metadata,
        })
        .where(and(
          eq(verificationTruthSet.batchId, batchId),
          eq(verificationTruthSet.assetKey, item.assetKey),
          eq(verificationTruthSet.dokLevel, item.dokLevel),
          eq(verificationTruthSet.stableKey, item.stableKey),
        ));
    }
  });
}

export async function getVerificationTruthRowsForBatch(batchId: number) {
  return db.select().from(verificationTruthSet)
    .where(eq(verificationTruthSet.batchId, batchId))
    .orderBy(asc(verificationTruthSet.assetKey), asc(verificationTruthSet.dokLevel), asc(verificationTruthSet.stableKey));
}
