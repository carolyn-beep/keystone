// Storage facade - combines all domain modules into a unified storage object
// This maintains backward compatibility with `import { storage } from "../storage"`

import * as brainliftsStorage from './brainlifts';
import * as readingListStorage from './reading-list';
import * as expertsStorage from './experts';
import * as verificationsStorage from './verifications';
import * as redundancyStorage from './redundancy';
import * as analyticsStorage from './analytics';
import * as dok2Storage from './dok2';
import * as sharesStorage from './shares';
import * as learningStreamStorage from './learning-stream';

// Re-export types from base
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster, ReadingListItem, ReadingListGrade, InsertReadingListGrade,
  BrainliftVersion, SourceFeedback, InsertSourceFeedback, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LLMModel, LlmFeedback, ModelAccuracyStats,
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

  // Reading List
  getGradesByBrainliftId: readingListStorage.getGradesByBrainliftId,
  saveGrade: readingListStorage.saveGrade,
  addReadingListItem: readingListStorage.addReadingListItem,
  getSourceFeedback: readingListStorage.getSourceFeedback,
  saveSourceFeedback: readingListStorage.saveSourceFeedback,
  getGradedReadingList: readingListStorage.getGradedReadingList,

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
  getDOK2Summaries: dok2Storage.getDOK2Summaries,
  deleteDOK2Summaries: dok2Storage.deleteDOK2Summaries,

  // Learning Stream
  addLearningStreamItem: learningStreamStorage.addLearningStreamItem,
  getLearningStreamItems: learningStreamStorage.getLearningStreamItems,
  updateLearningStreamItemStatus: learningStreamStorage.updateLearningStreamItemStatus,
  gradeLearningStreamItem: learningStreamStorage.gradeLearningStreamItem,
  getLearningStreamStats: learningStreamStorage.getLearningStreamStats,
  hasResearchJobPending: learningStreamStorage.hasResearchJobPending,
  checkLearningStreamDuplicate: learningStreamStorage.checkLearningStreamDuplicate,
};

// Export individual modules for direct access if needed
export { brainliftsStorage, readingListStorage, expertsStorage, verificationsStorage, redundancyStorage, analyticsStorage, dok2Storage, sharesStorage, learningStreamStorage };
