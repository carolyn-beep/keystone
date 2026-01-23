// Re-export the shared db instance
export { db } from "../db";

// Re-export commonly used types
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster, ReadingListItem, ReadingListGrade, InsertReadingListGrade,
  BrainliftVersion, SourceFeedback, InsertSourceFeedback, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LLMModel, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  AuthContext
} from "@shared/schema";

export {
  brainlifts, facts, contradictionClusters, readingListItems, readingListGrades,
  brainliftVersions, sourceFeedback, experts, factVerifications, factModelScores,
  llmFeedback, modelAccuracyStats, factRedundancyGroups, LLM_MODELS,
  dok2Summaries, dok2Points, dok2FactRelations
} from "@shared/schema";

export { eq, inArray, desc, and, sql, isNull, or } from "drizzle-orm";
