import {
  db, eq, and,
  facts, factVerifications, factModelScores, llmFeedback, modelAccuracyStats, LLM_MODELS,
  type Fact, type FactVerification, type InsertFactVerification, type FactModelScore,
  type FactWithVerification, type LLMModel, type LlmFeedback, type ModelAccuracyStats
} from './base';

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
  const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainliftId));

  const factsWithVerifications: FactWithVerification[] = [];

  for (const fact of brainliftFacts) {
    const verification = await getFactVerification(fact.id);
    factsWithVerifications.push({
      ...fact,
      verification: verification || undefined,
    });
  }

  return factsWithVerifications;
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
