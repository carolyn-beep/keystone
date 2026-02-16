// Re-export the shared db instance
export { db } from "../db";

// Re-export commonly used types
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster,
  BrainliftVersion, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LLMModel, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  LearningStreamItem, NewLearningStreamItem,
  ExtractedContent, AuthContext
} from "@shared/schema";

export {
  brainlifts, facts, contradictionClusters,
  brainliftVersions, experts, factVerifications, factModelScores,
  llmFeedback, modelAccuracyStats, factRedundancyGroups, LLM_MODELS,
  dok2Summaries, dok2Points, dok2FactRelations, learningStreamItems, swarmUsage
} from "@shared/schema";

export { eq, inArray, desc, and, sql, isNull, or } from "drizzle-orm";
