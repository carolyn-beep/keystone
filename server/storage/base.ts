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
  BrainliftScoreLog, BrainliftScoreSummary, QABatch, VerificationTruthSet,
  GraderMonitoringSet, InsertGraderMonitoringSet,
  GraderMonitoringBrainlift, InsertGraderMonitoringBrainlift,
  GraderMonitoringRun, InsertGraderMonitoringRun,
  GraderMonitoringPassResult, InsertGraderMonitoringPassResult,
  LearningStreamItem, NewLearningStreamItem,
  KnowledgeCheckQuiz, QuizQuestion, QuizAnswer,
  ExtractedContent, AuthContext,
  ImportAgentConversation, InsertImportAgentConversation,
  BrainliftSource, InsertBrainliftSource,
  ImportPhase, ImportStatus, SourceStatus,
  ChatConversation, ChatMessage, StoredChatMessage, ChatUserContext,
  ChatActivePlanSnapshot, ChatActivePlanTask,
  NativeBrainliftDetails, InsertNativeBrainliftDetails,
  BuilderExpert, InsertBuilderExpert,
  NativePhaseProgress, BuilderPhaseStatus, BuilderSuggestionStatus,
  Category, InsertCategory, CategorySuggestionState,
  SprintPlan, InsertSprintPlan, SprintPlanStatus,
  SprintTask, InsertSprintTask, SprintTaskMilestone,
  Deliverable, InsertDeliverable, DeliverableSourceSurface,
  PlatformConfig, InsertPlatformConfig,
  ApiKey,
} from "@shared/schema";

export {
  user,
  brainlifts, brainliftShares, facts, contradictionClusters,
  brainliftVersions, experts, factVerifications, factModelScores,
  llmFeedback, modelAccuracyStats, factRedundancyGroups,
  brainliftScoreLog, brainliftScoreSummary,
  qaBatches, verificationTruthSet,
  graderMonitoringSets, graderMonitoringBrainlifts, graderMonitoringRuns, graderMonitoringPassResults,
  dok2Summaries, dok2Points, dok2FactRelations, learningStreamItems, swarmUsage, knowledgeCheckQuizzes,
  dok3Insights, dok3InsightLinks,
  dok4Spovs, dok4Dok3Links,
  importAgentConversations, brainliftSources,
  chatConversations, chatMessages,
  nativeBrainliftDetails, builderExperts,
  categories,
  plans, tasks, deliverables, platformConfig,
  apiKeys,
} from "@shared/schema";

export { eq, inArray, desc, asc, and, sql, isNull, or } from "drizzle-orm";
