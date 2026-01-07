import { db } from "./db";
import { 
  brainlifts, facts, contradictionClusters, readingListItems, readingListGrades, brainliftVersions, sourceFeedback, experts,
  factVerifications, factModelScores, llmFeedback, modelAccuracyStats, factRedundancyGroups, LLM_MODELS,
  type Brainlift, type BrainliftData, type InsertBrainlift,
  type Fact, type ContradictionCluster, type ReadingListItem, type ReadingListGrade, type InsertReadingListGrade,
  type BrainliftVersion, type SourceFeedback, type InsertSourceFeedback, type Expert, type InsertExpert,
  type FactVerification, type InsertFactVerification, type FactModelScore, type InsertFactModelScore,
  type FactWithVerification, type LLMModel, type LlmFeedback, type ModelAccuracyStats,
  type FactRedundancyGroup, type InsertFactRedundancyGroup, type RedundancyStatus
} from "@shared/schema";
import { eq, inArray, desc, and } from "drizzle-orm";

export interface IStorage {
  getAllBrainlifts(): Promise<Brainlift[]>;
  getBrainliftsByUser(userId: string): Promise<Brainlift[]>;
  getPublicBrainlifts(): Promise<Brainlift[]>;
  getBrainliftBySlug(slug: string): Promise<BrainliftData | undefined>;
  createBrainlift(
    data: InsertBrainlift,
    factsData: any[],
    clustersData: any[],
    readingData: any[],
    userId?: string
  ): Promise<BrainliftData>;
  updateBrainlift(
    slug: string,
    data: InsertBrainlift,
    factsData: any[],
    clustersData: any[],
    readingData: any[]
  ): Promise<BrainliftData>;
  deleteBrainlift(id: number): Promise<void>;
  getGradesByBrainliftId(brainliftId: number): Promise<ReadingListGrade[]>;
  saveGrade(data: InsertReadingListGrade): Promise<ReadingListGrade>;
  getVersionsByBrainliftId(brainliftId: number): Promise<BrainliftVersion[]>;
  addReadingListItem(brainliftId: number, item: {
    type: string;
    author: string;
    topic: string;
    time: string;
    facts: string;
    url: string;
  }): Promise<ReadingListItem>;
  
  getSourceFeedback(brainliftId: number, sourceType?: string): Promise<SourceFeedback[]>;
  saveSourceFeedback(data: InsertSourceFeedback): Promise<SourceFeedback>;
  getGradedReadingList(brainliftId: number): Promise<Array<ReadingListItem & { quality: number | null; aligns: string | null }>>;
  
  getExpertsByBrainliftId(brainliftId: number): Promise<Expert[]>;
  saveExperts(brainliftId: number, expertsData: InsertExpert[]): Promise<Expert[]>;
  updateExpertFollowing(expertId: number, isFollowing: boolean): Promise<Expert>;
  getFollowedExperts(brainliftId: number): Promise<Expert[]>;
  deleteExpert(expertId: number): Promise<void>;
  updateBrainliftFields(id: number, fields: { originalContent?: string | null; sourceType?: string | null }): Promise<void>;
  
  getFactVerification(factId: number): Promise<(FactVerification & { modelScores: FactModelScore[] }) | null>;
  getFactsWithVerifications(brainliftId: number): Promise<FactWithVerification[]>;
  createFactVerification(factId: number): Promise<FactVerification>;
  updateFactVerification(verificationId: number, data: Partial<InsertFactVerification>): Promise<FactVerification>;
  saveModelScore(verificationId: number, data: { model: LLMModel; score: number | null; rationale: string | null; status: string; error: string | null }): Promise<FactModelScore>;
  setHumanOverride(verificationId: number, score: number, notes: string): Promise<FactVerification>;
  
  // LLM Feedback and Accuracy Stats
  getModelAccuracyStats(): Promise<ModelAccuracyStats[]>;
  getLlmFeedbackHistory(limit?: number): Promise<LlmFeedback[]>;
  
  // Redundancy Groups
  getRedundancyGroups(brainliftId: number): Promise<FactRedundancyGroup[]>;
  saveRedundancyGroups(brainliftId: number, groups: Omit<InsertFactRedundancyGroup, 'brainliftId'>[]): Promise<FactRedundancyGroup[]>;
  updateRedundancyGroupStatus(groupId: number, status: RedundancyStatus): Promise<FactRedundancyGroup>;
  deleteRedundancyGroups(brainliftId: number): Promise<void>;
  getFactsForBrainlift(brainliftId: number): Promise<Fact[]>;
}

import { isNull, or } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  async getAllBrainlifts(): Promise<Brainlift[]> {
    return await db.select().from(brainlifts);
  }

  async getBrainliftsByUser(userId: string): Promise<Brainlift[]> {
    return await db.select().from(brainlifts).where(eq(brainlifts.createdByUserId, userId));
  }

  async getPublicBrainlifts(): Promise<Brainlift[]> {
    // Public brainlifts are those with no owner (legacy/seeded data)
    return await db.select().from(brainlifts).where(isNull(brainlifts.createdByUserId));
  }

  async getBrainliftBySlug(slug: string): Promise<BrainliftData | undefined> {
    const [brainlift] = await db.select().from(brainlifts).where(eq(brainlifts.slug, slug));
    
    if (!brainlift) return undefined;

    const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainlift.id));
    const clusters = await db.select().from(contradictionClusters).where(eq(contradictionClusters.brainliftId, brainlift.id));
    const readingList = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainlift.id));
    const brainliftExperts = await db.select().from(experts).where(eq(experts.brainliftId, brainlift.id));

    return {
      ...brainlift,
      improperlyFormatted: brainlift.improperlyFormatted ?? false,
      facts: brainliftFacts,
      contradictionClusters: clusters,
      readingList: readingList,
      experts: brainliftExperts.sort((a, b) => b.rankScore - a.rankScore)
    };
  }

  async createBrainlift(
    brainliftData: InsertBrainlift,
    factsData: any[],
    clustersData: any[],
    readingData: any[],
    userId?: string
  ): Promise<BrainliftData> {
    // Transaction-like insertion
    const dataWithUser = userId ? { ...brainliftData, createdByUserId: userId } : brainliftData;
    const [brainlift] = await db.insert(brainlifts).values(dataWithUser).returning();

    if (factsData.length > 0) {
      await db.insert(facts).values(factsData.map(f => ({ 
        brainliftId: brainlift.id,
        originalId: f.originalId,
        category: f.category,
        source: f.source,
        fact: f.fact,
        score: f.score,
        contradicts: f.contradicts,
        note: f.note,
        flags: f.flags || []
      })));
    }

    if (clustersData.length > 0) {
      await db.insert(contradictionClusters).values(clustersData.map(c => ({ ...c, brainliftId: brainlift.id })));
    }

    if (readingData.length > 0) {
      await db.insert(readingListItems).values(readingData.map(r => ({ ...r, brainliftId: brainlift.id })));
    }

    return this.getBrainliftBySlug(brainlift.slug) as Promise<BrainliftData>;
  }

  async deleteBrainlift(id: number): Promise<void> {
    // Get reading list items to delete their grades first
    const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, id));
    const itemIds = items.map(i => i.id);
    
    if (itemIds.length > 0) {
      await db.delete(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
    }
    
    // Delete related data
    await db.delete(readingListItems).where(eq(readingListItems.brainliftId, id));
    await db.delete(contradictionClusters).where(eq(contradictionClusters.brainliftId, id));
    await db.delete(facts).where(eq(facts.brainliftId, id));
    await db.delete(brainlifts).where(eq(brainlifts.id, id));
  }

  async getGradesByBrainliftId(brainliftId: number): Promise<ReadingListGrade[]> {
    const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainliftId));
    const itemIds = items.map(i => i.id);
    if (itemIds.length === 0) return [];
    
    return await db.select().from(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
  }

  async saveGrade(data: InsertReadingListGrade): Promise<ReadingListGrade> {
    const [existing] = await db.select().from(readingListGrades).where(eq(readingListGrades.readingListItemId, data.readingListItemId));
    
    if (existing) {
      const [updated] = await db.update(readingListGrades)
        .set({ aligns: data.aligns, contradicts: data.contradicts, newInfo: data.newInfo, quality: data.quality })
        .where(eq(readingListGrades.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(readingListGrades).values(data).returning();
      return created;
    }
  }

  async updateBrainlift(
    slug: string,
    brainliftData: InsertBrainlift,
    factsData: any[],
    clustersData: any[],
    readingData: any[]
  ): Promise<BrainliftData> {
    const existing = await this.getBrainliftBySlug(slug);
    if (!existing) {
      throw new Error(`Brainlift with slug "${slug}" not found`);
    }

    const grades = await this.getGradesByBrainliftId(existing.id);
    
    const versions = await db.select().from(brainliftVersions)
      .where(eq(brainliftVersions.brainliftId, existing.id))
      .orderBy(desc(brainliftVersions.versionNumber));
    const nextVersionNumber = versions.length > 0 ? versions[0].versionNumber + 1 : 1;

    const gradesWithTopics = existing.readingList.map(item => {
      const grade = grades.find(g => g.readingListItemId === item.id);
      return {
        readingListTopic: item.topic,
        aligns: grade?.aligns || null,
        contradicts: grade?.contradicts || null,
        newInfo: grade?.newInfo || null,
        quality: grade?.quality || null,
      };
    });

    const snapshot = {
      title: existing.title,
      description: existing.description,
      author: existing.author,
      summary: existing.summary,
      facts: existing.facts.map(f => ({
        originalId: f.originalId,
        category: f.category,
        source: f.source,
        fact: f.fact,
        score: f.score,
        contradicts: f.contradicts,
        note: f.note,
      })),
      contradictionClusters: existing.contradictionClusters.map(c => ({
        name: c.name,
        tension: c.tension,
        status: c.status,
        factIds: c.factIds as string[],
        claims: c.claims as string[],
      })),
      readingList: existing.readingList.map(r => ({
        type: r.type,
        author: r.author,
        topic: r.topic,
        time: r.time,
        facts: r.facts,
        url: r.url,
      })),
      grades: gradesWithTopics,
    };

    await db.insert(brainliftVersions).values({
      brainliftId: existing.id,
      versionNumber: nextVersionNumber,
      sourceType: brainliftData.sourceType || 'unknown',
      snapshot,
    });

    const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, existing.id));
    const itemIds = items.map(i => i.id);
    if (itemIds.length > 0) {
      await db.delete(readingListGrades).where(inArray(readingListGrades.readingListItemId, itemIds));
    }
    await db.delete(readingListItems).where(eq(readingListItems.brainliftId, existing.id));
    await db.delete(contradictionClusters).where(eq(contradictionClusters.brainliftId, existing.id));
    await db.delete(facts).where(eq(facts.brainliftId, existing.id));

    await db.update(brainlifts)
      .set({
        title: brainliftData.title,
        description: brainliftData.description,
        author: brainliftData.author,
        summary: brainliftData.summary,
        classification: brainliftData.classification as any,
        rejectionReason: brainliftData.rejectionReason,
        rejectionSubtype: brainliftData.rejectionSubtype,
        rejectionRecommendation: brainliftData.rejectionRecommendation,
        originalContent: brainliftData.originalContent,
        sourceType: brainliftData.sourceType,
      })
      .where(eq(brainlifts.id, existing.id));

    console.log(`Inserting ${factsData.length} facts, ${clustersData.length} clusters, ${readingData.length} reading items`);
    
    if (factsData.length > 0) {
      try {
        const factsToInsert = factsData.map(f => ({ ...f, brainliftId: existing.id }));
        console.log('First fact to insert:', JSON.stringify(factsToInsert[0]));
        await db.insert(facts).values(factsToInsert);
        console.log('Facts inserted successfully');
      } catch (err) {
        console.error('Error inserting facts:', err);
        throw err;
      }
    }
    if (clustersData.length > 0) {
      try {
        await db.insert(contradictionClusters).values(clustersData.map(c => ({ ...c, brainliftId: existing.id })));
        console.log('Clusters inserted successfully');
      } catch (err) {
        console.error('Error inserting clusters:', err);
        throw err;
      }
    }
    if (readingData.length > 0) {
      try {
        await db.insert(readingListItems).values(readingData.map(r => ({ ...r, brainliftId: existing.id })));
        console.log('Reading items inserted successfully');
      } catch (err) {
        console.error('Error inserting reading items:', err);
        throw err;
      }
    }

    return this.getBrainliftBySlug(slug) as Promise<BrainliftData>;
  }

  async getVersionsByBrainliftId(brainliftId: number): Promise<BrainliftVersion[]> {
    return await db.select().from(brainliftVersions)
      .where(eq(brainliftVersions.brainliftId, brainliftId))
      .orderBy(desc(brainliftVersions.versionNumber));
  }

  async addReadingListItem(brainliftId: number, item: {
    type: string;
    author: string;
    topic: string;
    time: string;
    facts: string;
    url: string;
  }): Promise<ReadingListItem> {
    const [newItem] = await db.insert(readingListItems).values({
      brainliftId,
      type: item.type,
      author: item.author,
      topic: item.topic,
      time: item.time,
      facts: item.facts,
      url: item.url,
    }).returning();
    return newItem;
  }

  async getSourceFeedback(brainliftId: number, sourceType?: string): Promise<SourceFeedback[]> {
    if (sourceType) {
      return await db.select().from(sourceFeedback)
        .where(and(
          eq(sourceFeedback.brainliftId, brainliftId),
          eq(sourceFeedback.sourceType, sourceType)
        ));
    }
    return await db.select().from(sourceFeedback)
      .where(eq(sourceFeedback.brainliftId, brainliftId));
  }

  async saveSourceFeedback(data: InsertSourceFeedback): Promise<SourceFeedback> {
    const [existing] = await db.select().from(sourceFeedback)
      .where(and(
        eq(sourceFeedback.brainliftId, data.brainliftId),
        eq(sourceFeedback.sourceId, data.sourceId)
      ));
    
    if (existing) {
      const [updated] = await db.update(sourceFeedback)
        .set({ decision: data.decision })
        .where(eq(sourceFeedback.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(sourceFeedback).values(data).returning();
      return created;
    }
  }

  async getGradedReadingList(brainliftId: number): Promise<Array<ReadingListItem & { quality: number | null; aligns: string | null }>> {
    const items = await db.select().from(readingListItems).where(eq(readingListItems.brainliftId, brainliftId));
    const grades = await this.getGradesByBrainliftId(brainliftId);
    
    return items.map(item => {
      const grade = grades.find(g => g.readingListItemId === item.id);
      return {
        ...item,
        quality: grade?.quality || null,
        aligns: grade?.aligns || null,
      };
    });
  }

  async getExpertsByBrainliftId(brainliftId: number): Promise<Expert[]> {
    return await db.select().from(experts)
      .where(eq(experts.brainliftId, brainliftId))
      .orderBy(desc(experts.rankScore));
  }

  async saveExperts(brainliftId: number, expertsData: InsertExpert[]): Promise<Expert[]> {
    await db.delete(experts).where(eq(experts.brainliftId, brainliftId));
    
    if (expertsData.length === 0) return [];
    
    const inserted = await db.insert(experts).values(expertsData).returning();
    return inserted.sort((a, b) => b.rankScore - a.rankScore);
  }

  async updateExpertFollowing(expertId: number, isFollowing: boolean): Promise<Expert> {
    const [updated] = await db.update(experts)
      .set({ isFollowing })
      .where(eq(experts.id, expertId))
      .returning();
    return updated;
  }

  async getFollowedExperts(brainliftId: number): Promise<Expert[]> {
    return await db.select().from(experts)
      .where(and(
        eq(experts.brainliftId, brainliftId),
        eq(experts.isFollowing, true)
      ))
      .orderBy(desc(experts.rankScore));
  }

  async deleteExpert(expertId: number): Promise<void> {
    await db.delete(experts).where(eq(experts.id, expertId));
  }

  async updateBrainliftFields(id: number, fields: { originalContent?: string | null; sourceType?: string | null }): Promise<void> {
    await db.update(brainlifts)
      .set(fields)
      .where(eq(brainlifts.id, id));
  }

  async getFactById(factId: number): Promise<Fact | null> {
    const [fact] = await db.select().from(facts).where(eq(facts.id, factId));
    return fact || null;
  }

  async getFactVerification(factId: number): Promise<(FactVerification & { modelScores: FactModelScore[] }) | null> {
    const [verification] = await db.select().from(factVerifications).where(eq(factVerifications.factId, factId));
    if (!verification) return null;
    
    const modelScores = await db.select().from(factModelScores).where(eq(factModelScores.verificationId, verification.id));
    return { ...verification, modelScores };
  }

  async getFactsWithVerifications(brainliftId: number): Promise<FactWithVerification[]> {
    const brainliftFacts = await db.select().from(facts).where(eq(facts.brainliftId, brainliftId));
    
    const factsWithVerifications: FactWithVerification[] = [];
    
    for (const fact of brainliftFacts) {
      const verification = await this.getFactVerification(fact.id);
      factsWithVerifications.push({
        ...fact,
        verification: verification || undefined,
      });
    }
    
    return factsWithVerifications;
  }

  async createFactVerification(factId: number): Promise<FactVerification> {
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

  async updateFactVerification(verificationId: number, data: Partial<InsertFactVerification>): Promise<FactVerification> {
    const updateData: any = { ...data, updatedAt: new Date() };
    const [updated] = await db.update(factVerifications)
      .set(updateData)
      .where(eq(factVerifications.id, verificationId))
      .returning();
    return updated;
  }

  async saveModelScore(
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

  async setHumanOverride(verificationId: number, score: number, notes: string): Promise<FactVerification> {
    // Get the verification and its model scores before updating
    const [verification] = await db.select().from(factVerifications)
      .where(eq(factVerifications.id, verificationId));
    
    if (!verification) {
      throw new Error('Verification not found');
    }
    
    const modelScores = await db.select().from(factModelScores)
      .where(eq(factModelScores.verificationId, verificationId));
    
    // Log feedback for each model that provided a score
    for (const modelScore of modelScores) {
      if (modelScore.score !== null && modelScore.status === 'completed') {
        const scoreDiff = Math.abs(modelScore.score - score);
        
        // Insert feedback record
        await db.insert(llmFeedback).values({
          verificationId,
          factId: verification.factId,
          llmModel: modelScore.model,
          llmScore: modelScore.score,
          humanScore: score,
          scoreDifference: scoreDiff,
        });
        
        // Update model accuracy stats
        await this.updateModelAccuracyStats(modelScore.model, scoreDiff);
      }
    }
    
    // Human override replaces AI consensus - update ALL fields including consensusScore
    const [updated] = await db.update(factVerifications)
      .set({
        humanOverrideScore: score,
        humanOverrideNotes: notes,
        humanOverrideAt: new Date(),
        consensusScore: score, // Replace AI consensus with human score
        needsReview: false,
        confidenceLevel: 'high', // Human review = high confidence
        verificationNotes: `Human override: ${score}/5. ${notes || 'No additional notes.'}`,
        updatedAt: new Date(),
      })
      .where(eq(factVerifications.id, verificationId))
      .returning();
    return updated;
  }
  
  // Update model accuracy stats with new feedback
  private async updateModelAccuracyStats(model: LLMModel, scoreDifference: number): Promise<void> {
    const [existing] = await db.select().from(modelAccuracyStats)
      .where(eq(modelAccuracyStats.model, model));
    
    if (existing) {
      const newTotalSamples = existing.totalSamples + 1;
      const newTotalError = existing.totalAbsoluteError + scoreDifference;
      const newMAE = newTotalSamples > 0 ? (newTotalError / newTotalSamples) : 0;
      // Weight = 1 / (MAE + 0.5), clamped between 0.5 and 2.0
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
      // First feedback for this model
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
  
  async getModelAccuracyStats(): Promise<ModelAccuracyStats[]> {
    // Get all model stats, ensuring all 5 models are represented
    const stats = await db.select().from(modelAccuracyStats);
    const existingModels = new Set(stats.map(s => s.model));
    
    // Add default entries for models without stats
    const allModels = Object.values(LLM_MODELS);
    const result: ModelAccuracyStats[] = [...stats];
    
    for (const model of allModels) {
      if (!existingModels.has(model)) {
        result.push({
          id: 0,
          model,
          totalSamples: 0,
          totalAbsoluteError: 0,
          meanAbsoluteError: '0',
          weight: '1',
          lastUpdated: new Date(),
        });
      }
    }
    
    return result;
  }
  
  async getLlmFeedbackHistory(limit: number = 100): Promise<LlmFeedback[]> {
    return await db.select().from(llmFeedback)
      .orderBy(desc(llmFeedback.createdAt))
      .limit(limit);
  }
  
  // Redundancy Groups
  async getRedundancyGroups(brainliftId: number): Promise<FactRedundancyGroup[]> {
    return await db.select().from(factRedundancyGroups)
      .where(eq(factRedundancyGroups.brainliftId, brainliftId));
  }
  
  async saveRedundancyGroups(brainliftId: number, groups: Omit<InsertFactRedundancyGroup, 'brainliftId'>[]): Promise<FactRedundancyGroup[]> {
    if (groups.length === 0) return [];
    
    await db.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, brainliftId));
    
    const inserted = await db.insert(factRedundancyGroups)
      .values(groups.map(g => ({ ...g, brainliftId })))
      .returning();
    
    return inserted;
  }
  
  async updateRedundancyGroupStatus(groupId: number, status: RedundancyStatus): Promise<FactRedundancyGroup> {
    const [updated] = await db.update(factRedundancyGroups)
      .set({ status })
      .where(eq(factRedundancyGroups.id, groupId))
      .returning();
    return updated;
  }
  
  async deleteRedundancyGroups(brainliftId: number): Promise<void> {
    await db.delete(factRedundancyGroups).where(eq(factRedundancyGroups.brainliftId, brainliftId));
  }
  
  async getFactsForBrainlift(brainliftId: number): Promise<Fact[]> {
    return await db.select().from(facts).where(eq(facts.brainliftId, brainliftId));
  }
}

export const storage = new DatabaseStorage();
