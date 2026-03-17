// Re-export the shared db instance
export { db } from "../db";

// Re-export commonly used types
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster,
  BrainliftVersion, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  LearningStreamItem, NewLearningStreamItem,
  KnowledgeCheckQuiz, QuizQuestion, QuizAnswer,
  ExtractedContent, AuthContext,
  ImportAgentConversation, InsertImportAgentConversation,
  BrainliftSource, InsertBrainliftSource,
  ImportPhase, ImportStatus, SourceStatus,
  NativeBrainliftDetails, InsertNativeBrainliftDetails,
  BuilderExpert, InsertBuilderExpert,
  NativePhaseProgress, BuilderPhaseStatus, BuilderSuggestionStatus,
} from "@shared/schema";

export {
  brainlifts, facts, contradictionClusters,
  brainliftVersions, experts, factVerifications, factModelScores,
  llmFeedback, modelAccuracyStats, factRedundancyGroups,
  dok2Summaries, dok2Points, dok2FactRelations, learningStreamItems, swarmUsage, knowledgeCheckQuizzes,
  dok3Insights, dok3InsightLinks,
  dok4Spovs, dok4Dok3Links,
  importAgentConversations, brainliftSources,
  nativeBrainliftDetails, builderExperts,
} from "@shared/schema";

export { eq, inArray, desc, and, sql, isNull, or } from "drizzle-orm";
