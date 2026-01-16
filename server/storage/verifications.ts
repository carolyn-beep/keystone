import {
  db, eq, and, sql,
  facts, factVerifications, factModelScores, llmFeedback, modelAccuracyStats, LLM_MODELS,
  type Fact, type FactVerification, type InsertFactVerification, type FactModelScore,
  type FactWithVerification, type LLMModel, type LlmFeedback, type ModelAccuracyStats
} from './base';
import { NotFoundError } from '../middleware/error-handler';

export async function getFactById(factId: number): Promise<Fact | null> {
  const [fact] = await db.select().from(facts).where(eq(facts.id, factId));
  return fact || null;
}

export async function getFactsForBrainlift(brainliftId: number): Promise<Fact[]> {
  return await db.select().from(facts).where(eq(facts.brainliftId, brainliftId));
}

export async function getFactVerification(factId: number): Promise<(FactVerification & { modelScores: FactModelScore[] }) | null> {
  const [verification] = await db.select().from(factVerifications).where(eq(factVerifications.factId, factId));
  if (!verification) return null;

  const scores = await db.select().from(factModelScores).where(eq(factModelScores.verificationId, verification.id));
  return { ...verification, modelScores: scores };
}

export async function getFactsWithVerifications(brainliftId: number): Promise<FactWithVerification[]> {
  // Fetch all facts for this brainlift
  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainliftId));

  if (brainliftFacts.length === 0) {
    return [];
  }

  // Get all fact IDs
  const factIds = brainliftFacts.map(f => f.id);

  // Fetch all verifications for these facts in a single query
  const verifications = await db.select().from(factVerifications)
    .where(sql`${factVerifications.factId} IN (${sql.join(factIds.map(id => sql`${id}`), sql`, `)})`);

  // Get all verification IDs
  const verificationIds = verifications.map(v => v.id);

  // Fetch all model scores for these verifications in a single query
  let scores: FactModelScore[] = [];
  if (verificationIds.length > 0) {
    scores = await db.select().from(factModelScores)
      .where(sql`${factModelScores.verificationId} IN (${sql.join(verificationIds.map(id => sql`${id}`), sql`, `)})`);
  }

  // Build a map of verificationId -> scores
  const scoresByVerificationId = new Map<number, FactModelScore[]>();
  for (const score of scores) {
    const existing = scoresByVerificationId.get(score.verificationId) || [];
    existing.push(score);
    scoresByVerificationId.set(score.verificationId, existing);
  }

  // Build a map of factId -> verification with scores
  const verificationByFactId = new Map<number, FactVerification & { modelScores: FactModelScore[] }>();
  for (const v of verifications) {
    verificationByFactId.set(v.factId, {
      ...v,
      modelScores: scoresByVerificationId.get(v.id) || [],
    });
  }

  // Combine facts with their verifications
  return brainliftFacts.map(fact => ({
    ...fact,
    verification: verificationByFactId.get(fact.id) || undefined,
  }));
}

export async function createFactVerification(factId: number): Promise<FactVerification> {
  const existing = await db.select().from(factVerifications).where(eq(factVerifications.factId, factId));
  if (existing.length > 0) {
    return existing[0];
  }

  const [verification] = await db.insert(factVerifications).values({
    factId,
    status: 'pending',
  }).returning();
  return verification;
}

export async function updateFactVerification(verificationId: number, data: Partial<InsertFactVerification>): Promise<FactVerification> {
  const updateData: any = { ...data, updatedAt: new Date() };
  const [updated] = await db.update(factVerifications)
    .set(updateData)
    .where(eq(factVerifications.id, verificationId))
    .returning();
  return updated;
}

export async function saveModelScore(
  verificationId: number,
  data: { model: LLMModel; score: number | null; rationale: string | null; status: string; error: string | null }
): Promise<FactModelScore> {
  const existing = await db.select().from(factModelScores)
    .where(and(
      eq(factModelScores.verificationId, verificationId),
      eq(factModelScores.model, data.model)
    ));

  if (existing.length > 0) {
    const [updated] = await db.update(factModelScores)
      .set({
        score: data.score,
        rationale: data.rationale,
        status: data.status as any,
        error: data.error,
        completedAt: data.status === 'completed' ? new Date() : null,
      })
      .where(eq(factModelScores.id, existing[0].id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(factModelScores).values({
    verificationId,
    model: data.model,
    score: data.score,
    rationale: data.rationale,
    status: data.status as any,
    error: data.error,
    completedAt: data.status === 'completed' ? new Date() : null,
  }).returning();
  return inserted;
}

async function updateModelAccuracyStatsInternal(model: LLMModel, scoreDifference: number): Promise<void> {
  const [existing] = await db.select().from(modelAccuracyStats)
    .where(eq(modelAccuracyStats.model, model));

  if (existing) {
    const newTotalSamples = existing.totalSamples + 1;
    const newTotalError = existing.totalAbsoluteError + scoreDifference;
    const newMAE = newTotalSamples > 0 ? (newTotalError / newTotalSamples) : 0;
    const newWeight = Math.min(2.0, Math.max(0.5, 1 / (newMAE + 0.5)));

    await db.update(modelAccuracyStats)
      .set({
        totalSamples: newTotalSamples,
        totalAbsoluteError: newTotalError,
        meanAbsoluteError: newMAE.toFixed(3),
        weight: newWeight.toFixed(3),
        lastUpdated: new Date(),
      })
      .where(eq(modelAccuracyStats.id, existing.id));
  } else {
    const mae = scoreDifference;
    const weight = Math.min(2.0, Math.max(0.5, 1 / (mae + 0.5)));

    await db.insert(modelAccuracyStats).values({
      model,
      totalSamples: 1,
      totalAbsoluteError: scoreDifference,
      meanAbsoluteError: mae.toFixed(3),
      weight: weight.toFixed(3),
    });
  }
}

export async function setHumanOverride(verificationId: number, score: number, notes: string): Promise<FactVerification> {
  const [verification] = await db.select().from(factVerifications)
    .where(eq(factVerifications.id, verificationId));

  if (!verification) {
    throw new Error('Verification not found');
  }

  const scores = await db.select().from(factModelScores)
    .where(eq(factModelScores.verificationId, verificationId));

  // Log feedback for each model that provided a score
  for (const modelScore of scores) {
    if (modelScore.score !== null && modelScore.status === 'completed') {
      const scoreDiff = Math.abs(modelScore.score - score);

      await db.insert(llmFeedback).values({
        verificationId,
        factId: verification.factId,
        llmModel: modelScore.model,
        llmScore: modelScore.score,
        humanScore: score,
        scoreDifference: scoreDiff,
      });

      await updateModelAccuracyStatsInternal(modelScore.model, scoreDiff);
    }
  }

  const [updated] = await db.update(factVerifications)
    .set({
      humanOverrideScore: score,
      humanOverrideNotes: notes,
      humanOverrideAt: new Date(),
      consensusScore: score,
      needsReview: false,
      confidenceLevel: 'high',
      verificationNotes: `Human override: ${score}/5. ${notes || 'No additional notes.'}`,
      updatedAt: new Date(),
    })
    .where(eq(factVerifications.id, verificationId))
    .returning();
  return updated;
}

/**
 * Get fact by ID with brainlift ownership verification.
 * Returns null if fact doesn't exist or doesn't belong to the brainlift.
 */
export async function getFactByIdForBrainlift(
  factId: number,
  brainliftId: number
): Promise<Fact | null> {
  const [fact] = await db.select().from(facts)
    .where(and(eq(facts.id, factId), eq(facts.brainliftId, brainliftId)));
  return fact || null;
}

/**
 * Get fact verification with brainlift ownership verification.
 * Returns null if fact doesn't exist or doesn't belong to the brainlift.
 */
export async function getFactVerificationForBrainlift(
  factId: number,
  brainliftId: number
): Promise<(FactVerification & { modelScores: FactModelScore[] }) | null> {
  const fact = await getFactByIdForBrainlift(factId, brainliftId);
  if (!fact) return null;
  return getFactVerification(factId);
}

/**
 * Set human override with brainlift ownership verification.
 * Throws NotFoundError if verification doesn't exist or its fact doesn't belong to the brainlift.
 */
export async function setHumanOverrideForBrainlift(
  verificationId: number,
  brainliftId: number,
  score: number,
  notes: string
): Promise<FactVerification> {
  // Join verification -> fact to verify brainlift ownership
  const [verification] = await db
    .select({ id: factVerifications.id })
    .from(factVerifications)
    .innerJoin(facts, eq(factVerifications.factId, facts.id))
    .where(and(
      eq(factVerifications.id, verificationId),
      eq(facts.brainliftId, brainliftId)
    ));

  if (!verification) {
    throw new NotFoundError('Verification not found');
  }

  return setHumanOverride(verificationId, score, notes);
}
