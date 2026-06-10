// Storage facade - combines all domain modules into a unified storage object
// This maintains backward compatibility with `import { storage } from "../storage"`

import * as brainliftsStorage from './brainlifts';
import * as expertsStorage from './experts';
import * as verificationsStorage from './verifications';
import * as redundancyStorage from './redundancy';
import * as analyticsStorage from './analytics';
import * as dok2Storage from './dok2';
import * as sharesStorage from './shares';
import * as learningStreamStorage from './learning-stream';
import * as dok3Storage from './dok3';
import * as dok4Storage from './dok4';
import * as analyticsDashboardStorage from './analytics-dashboard';
import * as chatStorage from './chat';
import * as qaBatchesStorage from './qa-batches';
import * as graderMonitoringStorage from './grader-monitoring';
import * as knowledgeCheckStorage from './knowledge-check';
import * as nativeBrainliftsStorage from './native-brainlifts';
import * as builderExpertsStorage from './builder-experts';
import * as knowledgeTreeStorage from './knowledge-tree';
import * as apiKeysStorage from './api-keys';
import * as internalStorage from './internal';
import * as versionsStorage from './versions';
import * as staleStorage from './stale';
import * as dok1CrudStorage from './dok1-crud';
import * as dok2CrudStorage from './dok2-crud';
import * as dok3CrudStorage from './dok3-crud';
import * as dok4CrudStorage from './dok4-crud';
import * as sprintsStorage from './sprints';
import * as skillsStorage from './skills';
import * as secondBrainStorage from './second-brain';
import * as usersStorage from './users';
import * as modelPricesStorage from './model-prices';
import { pangramAssessmentsStorage } from './pangramAssessments';
import * as readabilityMetricsStorage from './readabilityMetrics';

// Re-export types from base
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster,
  BrainliftVersion, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  AuthContext,
  ChatConversation, ChatMessage, StoredChatMessage, ChatUserContext,
  NativeBrainliftDetails, InsertNativeBrainliftDetails,
  BuilderExpert, InsertBuilderExpert,
  NativePhaseProgress, BuilderPhaseStatus, BuilderSuggestionStatus,
  Category, InsertCategory, CategorySuggestionState,
  Skill, InsertSkill,
  SkillResource, InsertSkillResource,
  SkillShare, InsertSkillShare,
  SkillUserDisabled, InsertSkillUserDisabled,
  SkillVisibility,
  SprintPlan, InsertSprintPlan,
  SprintTask, InsertSprintTask,
  Deliverable, InsertDeliverable,
  PlatformConfig, InsertPlatformConfig,
} from './base';

export type {
  Source,
  InsertSource,
  Note,
  InsertNote,
} from '@shared/schema';

export type {
  DeletedSkillListItem,
  SaveSkillInput,
  SkillDetail,
  SkillListItem,
  SkillReferenceInput,
  SkillReferenceItem,
  SkillShareListItem,
} from './skills';

/**
 * Unified storage object that combines all domain-specific storage functions.
 * This object provides the same interface as the original DatabaseStorage class.
 */
export const storage = {
  // Brainlifts
  getBrainliftBySlug: brainliftsStorage.getBrainliftBySlug,
  getBrainliftRecordBySlug: brainliftsStorage.getBrainliftRecordBySlug,
  getContradictionClustersByBrainliftId: brainliftsStorage.getContradictionClustersByBrainliftId,
  getBrainliftById: brainliftsStorage.getBrainliftById,
  getBrainliftDetailById: brainliftsStorage.getBrainliftDetailById,
  getBrainliftDataById: brainliftsStorage.getBrainliftDataById,
  getBrainliftsByOwnerId: brainliftsStorage.getBrainliftsByOwnerId,
  createBrainlift: brainliftsStorage.createBrainlift,
  createBlankBrainlift: brainliftsStorage.createBlankBrainlift,
  setBrainliftPhase: brainliftsStorage.setBrainliftPhase,
  updateBrainliftScope: brainliftsStorage.updateBrainliftScope,
  updateOnboardingStep: brainliftsStorage.updateOnboardingStep,
  updateBrainlift: brainliftsStorage.updateBrainlift,
  deleteBrainlift: brainliftsStorage.deleteBrainlift,
  updateBrainliftFields: brainliftsStorage.updateBrainliftFields,
  updateImportStatus: brainliftsStorage.updateImportStatus,
  updateBrainliftCoverImage: brainliftsStorage.updateBrainliftCoverImage,
  getVersionsByBrainliftId: brainliftsStorage.getVersionsByBrainliftId,
  getBrainliftsForUserPaginated: brainliftsStorage.getBrainliftsForUserPaginated,
  getAllBrainliftsPaginated: brainliftsStorage.getAllBrainliftsPaginated,
  getBrainliftTitlesForUser: brainliftsStorage.getBrainliftTitlesForUser,
  canAccessBrainlift: brainliftsStorage.canAccessBrainlift,
  canModifyBrainlift: brainliftsStorage.canModifyBrainlift,
  isOwner: brainliftsStorage.isOwner,
  getImageGenerationContext: brainliftsStorage.getImageGenerationContext,
  getLearningStreamContext: brainliftsStorage.getLearningStreamContext,
  getSprintPlanContext: brainliftsStorage.getSprintPlanContext,

  // Shares
  getUserSharePermission: sharesStorage.getUserSharePermission,
  getBrainliftShares: sharesStorage.getBrainliftShares,
  createUserShare: sharesStorage.createUserShare,
  updateShare: sharesStorage.updateShare,
  deleteShare: sharesStorage.deleteShare,
  getOrCreateShareToken: sharesStorage.getOrCreateShareToken,
  getShareByToken: sharesStorage.getShareByToken,
  getUserByEmailOrUsername: sharesStorage.getUserByEmailOrUsername,
  getSharedBrainlifts: sharesStorage.getSharedBrainlifts,
  transferOwnershipToFirstEditor: sharesStorage.transferOwnershipToFirstEditor,

  // Runtime Skills
  listSkillsForUser: skillsStorage.listSkillsForUser,
  getSkillForUserByName: skillsStorage.getSkillForUserByName,
  createSkill: skillsStorage.createSkill,
  updateSkill: skillsStorage.updateSkill,
  softDeleteSkill: skillsStorage.softDeleteSkill,
  restoreSkill: skillsStorage.restoreSkill,
  listDeletedSkills: skillsStorage.listDeletedSkills,
  setSkillEnabledForUser: skillsStorage.setSkillEnabledForUser,
  grantSkillShare: skillsStorage.grantSkillShare,
  revokeSkillShare: skillsStorage.revokeSkillShare,
  hardDeleteExpiredDeletedSkills: skillsStorage.hardDeleteExpiredDeletedSkills,

  // Experts
  getExpertsByBrainliftId: expertsStorage.getExpertsByBrainliftId,
  saveExperts: expertsStorage.saveExperts,
  createExpertsForBrainlift: expertsStorage.createExpertsForBrainlift,
  updateExpertRankings: expertsStorage.updateExpertRankings,
  deleteExpertForBrainlift: expertsStorage.deleteExpertForBrainlift,

  // Verifications
  getFactsForBrainlift: verificationsStorage.getFactsForBrainlift,
  getFactsWithVerifications: verificationsStorage.getFactsWithVerifications,
  createFactVerification: verificationsStorage.createFactVerification,
  saveFactVerificationResult: verificationsStorage.saveFactVerificationResult,
  setHumanOverride: verificationsStorage.setHumanOverride,
  getFactByIdForBrainlift: verificationsStorage.getFactByIdForBrainlift,
  getFactVerificationForBrainlift: verificationsStorage.getFactVerificationForBrainlift,
  setHumanOverrideForBrainlift: verificationsStorage.setHumanOverrideForBrainlift,
  getDOK1MeanScore: verificationsStorage.getDOK1MeanScore,
  updateFactGrading: verificationsStorage.updateFactGrading,

  // Redundancy
  getRedundancyGroups: redundancyStorage.getRedundancyGroups,
  saveRedundancyGroups: redundancyStorage.saveRedundancyGroups,
  getRedundancyGroupForBrainlift: redundancyStorage.getRedundancyGroupForBrainlift,
  updateRedundancyGroupStatusForBrainlift: redundancyStorage.updateRedundancyGroupStatusForBrainlift,

  // Analytics
  getModelAccuracyStats: analyticsStorage.getModelAccuracyStats,
  getLlmFeedbackHistory: analyticsStorage.getLlmFeedbackHistory,
  getVolumeAnalytics: analyticsDashboardStorage.getVolumeAnalytics,
  getHumanVerificationAnalytics: analyticsDashboardStorage.getHumanVerificationAnalytics,
  getVanillaComparisonAnalytics: analyticsDashboardStorage.getVanillaComparisonAnalytics,
  getDokCliffAnalytics: analyticsDashboardStorage.getDokCliffAnalytics,
  getScoreDistributionAnalytics: analyticsDashboardStorage.getScoreDistributionAnalytics,
  getSpovDistributionAnalytics: analyticsDashboardStorage.getSpovDistributionAnalytics,
  getScoreImprovementAnalytics: analyticsDashboardStorage.getScoreImprovementAnalytics,
  getBrainliftScoreHistoryAnalytics: analyticsDashboardStorage.getBrainliftScoreHistoryAnalytics,
  getLeaderboardAnalytics: analyticsDashboardStorage.getLeaderboardAnalytics,
  getGraderConsistencyAnalytics: graderMonitoringStorage.getGraderConsistencyAnalytics,
  getModelDriftAnalytics: graderMonitoringStorage.getModelDriftAnalytics,

  // QA batches
  createQABatch: qaBatchesStorage.createQABatch,
  updateQABatch: qaBatchesStorage.updateQABatch,
  getQABatchById: qaBatchesStorage.getQABatchById,
  getLatestQABatchByType: qaBatchesStorage.getLatestQABatchByType,
  getLatestBaselineQABatch: qaBatchesStorage.getLatestBaselineQABatch,
  getLatestPendingQABatch: qaBatchesStorage.getLatestPendingQABatch,
  setQABatchRunning: qaBatchesStorage.setQABatchRunning,
  completeQABatch: qaBatchesStorage.completeQABatch,
  failQABatch: qaBatchesStorage.failQABatch,
  replaceVerificationTruthRows: qaBatchesStorage.replaceVerificationTruthRows,
  getVerificationTruthRowsForBatch: qaBatchesStorage.getVerificationTruthRowsForBatch,

  // Weekly grader monitoring
  getActiveGraderMonitoringSet: graderMonitoringStorage.getActiveGraderMonitoringSet,
  getFrozenSnapshotsForMonitoringSet: graderMonitoringStorage.getFrozenSnapshotsForMonitoringSet,
  createOrReuseWeeklyConsistencyRun: graderMonitoringStorage.createOrReuseWeeklyConsistencyRun,
  setWeeklyConsistencyRunRunning: graderMonitoringStorage.setWeeklyConsistencyRunRunning,
  replaceWeeklyConsistencyPassResults: graderMonitoringStorage.replaceWeeklyConsistencyPassResults,
  getWeeklyConsistencyPassResults: graderMonitoringStorage.getWeeklyConsistencyPassResults,
  getPreviousCompletedWeeklyConsistencyRun: graderMonitoringStorage.getPreviousCompletedWeeklyConsistencyRun,
  completeWeeklyConsistencyRun: graderMonitoringStorage.completeWeeklyConsistencyRun,
  failWeeklyConsistencyRun: graderMonitoringStorage.failWeeklyConsistencyRun,

  // DOK2 Summaries
  saveDOK2Summaries: dok2Storage.saveDOK2Summaries,
  saveSingleDOK2Summary: dok2Storage.saveSingleDOK2Summary,
  getDOK2Summaries: dok2Storage.getDOK2Summaries,
  deleteDOK2Summaries: dok2Storage.deleteDOK2Summaries,
  getDOK2MeanScore: dok2Storage.getDOK2MeanScore,
  updateDOK2Grading: dok2Storage.updateDOK2Grading,
  getDok2SummaryByIdForBrainlift: dok2Storage.getDok2SummaryByIdForBrainlift,
  getDok2PointsForSummary: dok2Storage.getDok2PointsForSummary,
  getRelatedDOK1sForSummary: dok2Storage.getRelatedDOK1sForSummary,

  // Learning Stream
  addLearningStreamItem: learningStreamStorage.addLearningStreamItem,
  getLearningStreamItems: learningStreamStorage.getLearningStreamItems,
  getLearningStreamItemById: learningStreamStorage.getLearningStreamItemById,
  getLearningStreamItemByUrl: learningStreamStorage.getLearningStreamItemByUrl,
  updateLearningStreamItemStatus: learningStreamStorage.updateLearningStreamItemStatus,
  gradeLearningStreamItem: learningStreamStorage.gradeLearningStreamItem,
  getLearningStreamStats: learningStreamStorage.getLearningStreamStats,
  hasResearchJobPending: learningStreamStorage.hasResearchJobPending,
  checkLearningStreamDuplicate: learningStreamStorage.checkLearningStreamDuplicate,
  getLearningStreamUrls: learningStreamStorage.getLearningStreamUrls,
  cacheExtractedContent: learningStreamStorage.cacheExtractedContent,
  clearExtractedContent: learningStreamStorage.clearExtractedContent,
  getSwarmUsageToday: learningStreamStorage.getSwarmUsageToday,
  recordSwarmUsage: learningStreamStorage.recordSwarmUsage,
  updateSwarmUsageEstimatedUsd: learningStreamStorage.updateSwarmUsageEstimatedUsd,
  getActiveRunIdForBrainlift: learningStreamStorage.getActiveRunIdForBrainlift,

  // Second Brain
  createSource: secondBrainStorage.createSource,
  getSourcesByBrainlift: secondBrainStorage.getSourcesByBrainlift,
  getSourceForBrainlift: secondBrainStorage.getSourceForBrainlift,
  updateSourceForBrainlift: secondBrainStorage.updateSourceForBrainlift,
  deleteSourceForBrainlift: secondBrainStorage.deleteSourceForBrainlift,
  bulkDeleteSources: secondBrainStorage.bulkDeleteSources,
  bulkUpdateSourceCategories: secondBrainStorage.bulkUpdateSourceCategories,
  createNote: secondBrainStorage.createNote,
  getNotesByBrainlift: secondBrainStorage.getNotesByBrainlift,
  getNoteForBrainlift: secondBrainStorage.getNoteForBrainlift,
  updateNoteForBrainlift: secondBrainStorage.updateNoteForBrainlift,
  deleteNoteForBrainlift: secondBrainStorage.deleteNoteForBrainlift,
  bulkDeleteNotes: secondBrainStorage.bulkDeleteNotes,
  bulkUpdateNoteCategories: secondBrainStorage.bulkUpdateNoteCategories,
  listSources: secondBrainStorage.listSources,
  listNotes: secondBrainStorage.listNotes,
  listCategories: secondBrainStorage.listCategories,
  getSecondBrainSummary: secondBrainStorage.getSecondBrainSummary,
  getCategoriesWithCountsForSecondBrain: secondBrainStorage.getCategoriesWithCountsForSecondBrain,
  reorderCategories: secondBrainStorage.reorderCategories,
  // Spec 01 (pedagogy/reader-notes): tx-aware helpers for the
  // POST /api/brainlifts/:slug/notes/from-reader endpoint.
  ensureCategoryByName: secondBrainStorage.ensureCategoryByName,
  ensureSourceFromLearningStreamItem: secondBrainStorage.ensureSourceFromLearningStreamItem,

  // DOK3 Insights
  saveDOK3Insights: dok3Storage.saveDOK3Insights,
  getDOK3Insights: dok3Storage.getDOK3Insights,
  getDOK3ScratchpadItems: dok3Storage.getDOK3ScratchpadItems,
  seedDOK3Insight: dok3Storage.seedDOK3Insight,
  deleteDOK3Data: dok3Storage.deleteDOK3Data,
  getDOK3InsightForBrainlift: dok3Storage.getDOK3InsightForBrainlift,
  validateMultiSourceLinks: dok3Storage.validateMultiSourceLinks,
  linkDOK3Insight: dok3Storage.linkDOK3Insight,
  scratchpadDOK3Insight: dok3Storage.scratchpadDOK3Insight,
  unscratchpadDOK3Insight: dok3Storage.unscratchpadDOK3Insight,
  checkFoundationGraded: dok3Storage.checkFoundationGraded,
  getInsightEvaluationContext: dok3Storage.getInsightEvaluationContext,
  saveDOK3GradeResult: dok3Storage.saveDOK3GradeResult,
  updateDOK3InsightStatus: dok3Storage.updateDOK3InsightStatus,
  updateDOK3SourceRankings: dok3Storage.updateDOK3SourceRankings,
  getDOK3MeanScore: dok3Storage.getDOK3MeanScore,
  setDOK3LinkingFlagged: dok3Storage.setDOK3LinkingFlagged,

  // DOK4 SPOVs
  saveDOK4Spovs: dok4Storage.saveDOK4Spovs,
  getDOK4Spovs: dok4Storage.getDOK4Spovs,
  linkDOK4Spov: dok4Storage.linkDOK4Spov,
  updateDOK4SpovStatus: dok4Storage.updateDOK4SpovStatus,
  saveDOK4Rejection: dok4Storage.saveDOK4Rejection,
  saveDOK4GradeResult: dok4Storage.saveDOK4GradeResult,
  getDOK4MeanScore: dok4Storage.getDOK4MeanScore,
  getSpovEvaluationContext: dok4Storage.getSpovEvaluationContext,
  triggerDependentDOK4Grading: dok4Storage.triggerDependentDOK4Grading,
  setDOK4InsightRankings: dok4Storage.setDOK4InsightRankings,

  // Native chat
  listChatConversations: chatStorage.listChatConversations,
  createChatConversation: chatStorage.createChatConversation,
  getChatConversation: chatStorage.getChatConversation,
  renameChatConversation: chatStorage.renameChatConversation,
  renameChatConversationIfTitle: chatStorage.renameChatConversationIfTitle,
  deleteChatConversation: chatStorage.deleteChatConversation,
  listChatMessages: chatStorage.listChatMessages,
  syncChatMessages: chatStorage.syncChatMessages,
  setConversationBrainlift: chatStorage.setConversationBrainlift,
  getConversationBrainlift: chatStorage.getConversationBrainlift,
  getChatUserContext: chatStorage.getChatUserContext,

  // Knowledge Check
  getQuizByItemId: knowledgeCheckStorage.getQuizByItemId,
  createQuiz: knowledgeCheckStorage.createQuiz,
  submitQuizAnswers: knowledgeCheckStorage.submitQuizAnswers,
  hasQuizJobPending: knowledgeCheckStorage.hasQuizJobPending,

  // Native Brainlifts
  createNativeBrainlift: nativeBrainliftsStorage.createNativeBrainlift,
  getNativeDetailsBySlug: nativeBrainliftsStorage.getNativeDetailsBySlug,
  updateNativeDetailsForBrainlift: nativeBrainliftsStorage.updateNativeDetailsForBrainlift,
  setBuilderSuggestionState: nativeBrainliftsStorage.setBuilderSuggestionState,
  celebratePhase3: nativeBrainliftsStorage.celebratePhase3,

  // Knowledge Tree (Phase 3)
  getKnowledgeTree: knowledgeTreeStorage.getKnowledgeTree,
  getItemDetail: knowledgeTreeStorage.getItemDetail,
  createManualSource: knowledgeTreeStorage.createManualSource,
  deleteExtractions: knowledgeTreeStorage.deleteExtractions,
  createCategory: knowledgeTreeStorage.createCategory,
  updateCategory: knowledgeTreeStorage.updateCategory,
  deleteCategory: knowledgeTreeStorage.deleteCategory,
  getCategoriesWithCounts: knowledgeTreeStorage.getCategoriesWithCounts,
  reassignItemCategory: knowledgeTreeStorage.reassignItemCategory,
  getExtractionCounts: knowledgeTreeStorage.getExtractionCounts,
  createManualFact: knowledgeTreeStorage.createManualFact,
  updateManualFact: knowledgeTreeStorage.updateManualFact,
  deleteManualFact: knowledgeTreeStorage.deleteManualFact,
  createManualSummary: knowledgeTreeStorage.createManualSummary,
  updateManualSummary: knowledgeTreeStorage.updateManualSummary,
  deleteManualSummary: knowledgeTreeStorage.deleteManualSummary,

  // Builder Experts
  getBuilderExpertsByBrainliftId: builderExpertsStorage.getBuilderExpertsByBrainliftId,
  createBuilderExpert: builderExpertsStorage.createBuilderExpert,
  insertSuggestedExperts: builderExpertsStorage.insertSuggestedExperts,
  updateBuilderExpertForBrainlift: builderExpertsStorage.updateBuilderExpertForBrainlift,
  dismissBuilderExpertForBrainlift: builderExpertsStorage.dismissBuilderExpertForBrainlift,
  deleteBuilderExpertForBrainlift: builderExpertsStorage.deleteBuilderExpertForBrainlift,
  countSavedBuilderExperts: builderExpertsStorage.countSavedBuilderExperts,
  clearPendingSuggestions: builderExpertsStorage.clearPendingSuggestions,

  // API Keys (service auth)
  validateApiKey: apiKeysStorage.validateApiKey,
  findOrCreateUserByEmail: apiKeysStorage.findOrCreateUserByEmail,

  // Internal API (MCP)
  getBrainliftProgress: internalStorage.getBrainliftProgress,
  getBrainliftScores: internalStorage.getBrainliftScores,
  getAssessmentDOK1: internalStorage.getAssessmentDOK1,
  getAssessmentDOK2: internalStorage.getAssessmentDOK2,
  getAssessmentDOK3: internalStorage.getAssessmentDOK3,
  getAssessmentDOK4: internalStorage.getAssessmentDOK4,

  // DOK Item Versioning
  createVersion: versionsStorage.createVersion,
  getVersionHistory: versionsStorage.getVersionHistory,
  pruneVersions: versionsStorage.pruneVersions,

  // Stale Flag Management
  propagateStaleFlags: staleStorage.propagateStaleFlags,
  dismissStaleFlag: staleStorage.dismissStaleFlag,
  getStaleItems: staleStorage.getStaleItems,

  // DOK CRUD (create, edit, delete, impact preview)
  createFact: dok1CrudStorage.createFact,
  editFact: dok1CrudStorage.editFact,
  deleteFact: dok1CrudStorage.deleteFact,
  getFactDeleteImpact: dok1CrudStorage.getFactDeleteImpact,
  createDok2Summary: dok2CrudStorage.createDok2Summary,
  editDok2Summary: dok2CrudStorage.editDok2Summary,
  deleteDok2Summary: dok2CrudStorage.deleteDok2Summary,
  getDok2DeleteImpact: dok2CrudStorage.getDok2DeleteImpact,
  createDok3Insight: dok3CrudStorage.createDok3Insight,
  editDok3Insight: dok3CrudStorage.editDok3Insight,
  deleteDok3Insight: dok3CrudStorage.deleteDok3Insight,
  getDok3DeleteImpact: dok3CrudStorage.getDok3DeleteImpact,
  addLinksToDok3Insight: dok3CrudStorage.addLinksToDok3Insight,
  createDok4Spov: dok4CrudStorage.createDok4Spov,
  editDok4Spov: dok4CrudStorage.editDok4Spov,
  deleteDok4Spov: dok4CrudStorage.deleteDok4Spov,
  getDok4DeleteImpact: dok4CrudStorage.getDok4DeleteImpact,
  addLinksToDok4Spov: dok4CrudStorage.addLinksToDok4Spov,

  // Sprint foundation
  getActivePlan: sprintsStorage.getActivePlan,
  getCurrentPlan: sprintsStorage.getCurrentPlan,
  listPlans: sprintsStorage.listPlans,
  createPlanWithTasks: sprintsStorage.createPlanWithTasks,
  createGeneratingPlan: sprintsStorage.createGeneratingPlan,
  finalizeGeneratingPlan: sprintsStorage.finalizeGeneratingPlan,
  markPlanGenerationFailed: sprintsStorage.markPlanGenerationFailed,
  reclaimStaleGeneratingPlans: sprintsStorage.reclaimStaleGeneratingPlans,
  deleteFailedPlans: sprintsStorage.deleteFailedPlans,
  listTasksForBrainlift: sprintsStorage.listTasksForBrainlift,
  listTasksForUser: sprintsStorage.listTasksForUser,
  getTaskForBrainlift: sprintsStorage.getTaskForBrainlift,
  getDeliverableByTaskId: sprintsStorage.getDeliverableByTaskId,
  getDeliverableByIdForBrainlift: sprintsStorage.getDeliverableByIdForBrainlift,
  createDeliverable: sprintsStorage.createDeliverable,
  listDeliverablesForBrainlift: sprintsStorage.listDeliverablesForBrainlift,
  listDocuments: sprintsStorage.listDocuments,
  markPlanCompleteIfAllDelivered: sprintsStorage.markPlanCompleteIfAllDelivered,
  setPlanGdriveFolder: sprintsStorage.setPlanGdriveFolder,
  setBrainliftGdriveRootFolder: sprintsStorage.setBrainliftGdriveRootFolder,
  getSprintSharingAudience: sprintsStorage.getSprintSharingAudience,

  // User Preferences (per-user explainer-seen flag etc.)
  getUserPreferences: usersStorage.getUserPreferences,
  markExplainerSeen: usersStorage.markExplainerSeen,

  // Model token pricing (cost estimation source of truth)
  getAllModelPrices: modelPricesStorage.getAllModelPrices,
  countModelPrices: modelPricesStorage.countModelPrices,
  upsertModelPrices: modelPricesStorage.upsertModelPrices,

  // Readability rewrite metrics (downstream rewrite analytics)
  recordRewriteMetric: readabilityMetricsStorage.recordRewriteMetric,
  getReadabilityAnalytics: readabilityMetricsStorage.getReadabilityAnalytics,
};

// Export individual modules for direct access if needed.
// One per line: keeps diffs minimal and avoids cross-branch merge conflicts.
export {
  brainliftsStorage,
  expertsStorage,
  verificationsStorage,
  redundancyStorage,
  analyticsStorage,
  dok2Storage,
  sharesStorage,
  learningStreamStorage,
  dok3Storage,
  dok4Storage,
  knowledgeCheckStorage,
  nativeBrainliftsStorage,
  builderExpertsStorage,
  knowledgeTreeStorage,
  apiKeysStorage,
  internalStorage,
  versionsStorage,
  staleStorage,
  dok1CrudStorage,
  dok2CrudStorage,
  dok3CrudStorage,
  dok4CrudStorage,
  sprintsStorage,
  pangramAssessmentsStorage,
  readabilityMetricsStorage,
  usersStorage,
  modelPricesStorage,
};
