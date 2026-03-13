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
import * as importAgentStorage from './import-agent';
import * as brainliftSourcesStorage from './brainlift-sources';
import * as knowledgeCheckStorage from './knowledge-check';

// Re-export types from base
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster,
  BrainliftVersion, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  AuthContext
} from './base';

/**
 * Unified storage object that combines all domain-specific storage functions.
 * This object provides the same interface as the original DatabaseStorage class.
 */
export const storage = {
  // Brainlifts
  getBrainliftBySlug: brainliftsStorage.getBrainliftBySlug,
  getBrainliftById: brainliftsStorage.getBrainliftById,
  getBrainliftDataById: brainliftsStorage.getBrainliftDataById,
  getBrainliftsByOwnerId: brainliftsStorage.getBrainliftsByOwnerId,
  createBrainlift: brainliftsStorage.createBrainlift,
  updateBrainlift: brainliftsStorage.updateBrainlift,
  deleteBrainlift: brainliftsStorage.deleteBrainlift,
  updateBrainliftFields: brainliftsStorage.updateBrainliftFields,
  updateBrainliftCoverImage: brainliftsStorage.updateBrainliftCoverImage,
  getVersionsByBrainliftId: brainliftsStorage.getVersionsByBrainliftId,
  getBrainliftsForUserPaginated: brainliftsStorage.getBrainliftsForUserPaginated,
  getAllBrainliftsPaginated: brainliftsStorage.getAllBrainliftsPaginated,
  canAccessBrainlift: brainliftsStorage.canAccessBrainlift,
  canModifyBrainlift: brainliftsStorage.canModifyBrainlift,
  isOwner: brainliftsStorage.isOwner,
  getImageGenerationContext: brainliftsStorage.getImageGenerationContext,
  getLearningStreamContext: brainliftsStorage.getLearningStreamContext,

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

  // Experts
  getExpertsByBrainliftId: expertsStorage.getExpertsByBrainliftId,
  saveExperts: expertsStorage.saveExperts,
  getFollowedExperts: expertsStorage.getFollowedExperts,
  updateExpertFollowingForBrainlift: expertsStorage.updateExpertFollowingForBrainlift,
  deleteExpertForBrainlift: expertsStorage.deleteExpertForBrainlift,

  // Verifications
  getFactsForBrainlift: verificationsStorage.getFactsForBrainlift,
  getFactsWithVerifications: verificationsStorage.getFactsWithVerifications,
  createFactVerification: verificationsStorage.createFactVerification,
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

  // DOK2 Summaries
  saveDOK2Summaries: dok2Storage.saveDOK2Summaries,
  saveSingleDOK2Summary: dok2Storage.saveSingleDOK2Summary,
  getDOK2Summaries: dok2Storage.getDOK2Summaries,
  deleteDOK2Summaries: dok2Storage.deleteDOK2Summaries,
  getDOK2MeanScore: dok2Storage.getDOK2MeanScore,
  updateDOK2Grading: dok2Storage.updateDOK2Grading,

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
  cacheExtractedContent: learningStreamStorage.cacheExtractedContent,
  clearExtractedContent: learningStreamStorage.clearExtractedContent,
  getSwarmUsageToday: learningStreamStorage.getSwarmUsageToday,
  recordSwarmUsage: learningStreamStorage.recordSwarmUsage,

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

  // Import Agent
  getImportConversation: importAgentStorage.getImportConversation,
  saveImportConversation: importAgentStorage.saveImportConversation,
  deleteImportConversation: importAgentStorage.deleteImportConversation,
  updateImportStatus: importAgentStorage.updateImportStatus,

  // Brainlift Sources
  saveBrainliftSources: brainliftSourcesStorage.saveBrainliftSources,
  getBrainliftSources: brainliftSourcesStorage.getBrainliftSources,
  deleteBrainliftSources: brainliftSourcesStorage.deleteBrainliftSources,

  // Knowledge Check
  getQuizByItemId: knowledgeCheckStorage.getQuizByItemId,
  createQuiz: knowledgeCheckStorage.createQuiz,
  submitQuizAnswers: knowledgeCheckStorage.submitQuizAnswers,
  hasQuizJobPending: knowledgeCheckStorage.hasQuizJobPending,
};

// Export individual modules for direct access if needed
export { brainliftsStorage, expertsStorage, verificationsStorage, redundancyStorage, analyticsStorage, dok2Storage, sharesStorage, learningStreamStorage, dok3Storage, dok4Storage, importAgentStorage, brainliftSourcesStorage, knowledgeCheckStorage };
