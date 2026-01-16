// Storage facade - combines all domain modules into a unified storage object
// This maintains backward compatibility with `import { storage } from "../storage"`

import * as brainliftsStorage from './brainlifts';
import * as readingListStorage from './reading-list';
import * as expertsStorage from './experts';
import * as verificationsStorage from './verifications';
import * as redundancyStorage from './redundancy';
import * as analyticsStorage from './analytics';

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
  getAllBrainlifts: brainliftsStorage.getAllBrainlifts,
  getBrainliftsByUser: brainliftsStorage.getBrainliftsByUser,
  getPublicBrainlifts: brainliftsStorage.getPublicBrainlifts,
  getBrainliftBySlug: brainliftsStorage.getBrainliftBySlug,
  getBrainliftById: brainliftsStorage.getBrainliftById,
  createBrainlift: brainliftsStorage.createBrainlift,
  updateBrainlift: brainliftsStorage.updateBrainlift,
  deleteBrainlift: brainliftsStorage.deleteBrainlift,
  updateBrainliftFields: brainliftsStorage.updateBrainliftFields,
  getVersionsByBrainliftId: brainliftsStorage.getVersionsByBrainliftId,
  getBrainliftsForUser: brainliftsStorage.getBrainliftsForUser,
  getBrainliftsForUserPaginated: brainliftsStorage.getBrainliftsForUserPaginated,
  getAllBrainliftsPaginated: brainliftsStorage.getAllBrainliftsPaginated,
  canAccessBrainlift: brainliftsStorage.canAccessBrainlift,
  canModifyBrainlift: brainliftsStorage.canModifyBrainlift,

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
  updateExpertFollowing: expertsStorage.updateExpertFollowing,
  getFollowedExperts: expertsStorage.getFollowedExperts,
  deleteExpert: expertsStorage.deleteExpert,
  // Ownership-aware experts
  updateExpertFollowingForBrainlift: expertsStorage.updateExpertFollowingForBrainlift,
  deleteExpertForBrainlift: expertsStorage.deleteExpertForBrainlift,

  // Verifications
  getFactById: verificationsStorage.getFactById,
  getFactsForBrainlift: verificationsStorage.getFactsForBrainlift,
  getFactVerification: verificationsStorage.getFactVerification,
  getFactsWithVerifications: verificationsStorage.getFactsWithVerifications,
  createFactVerification: verificationsStorage.createFactVerification,
  updateFactVerification: verificationsStorage.updateFactVerification,
  saveModelScore: verificationsStorage.saveModelScore,
  setHumanOverride: verificationsStorage.setHumanOverride,
  // Ownership-aware verifications
  getFactByIdForBrainlift: verificationsStorage.getFactByIdForBrainlift,
  getFactVerificationForBrainlift: verificationsStorage.getFactVerificationForBrainlift,
  setHumanOverrideForBrainlift: verificationsStorage.setHumanOverrideForBrainlift,

  // Redundancy
  getRedundancyGroups: redundancyStorage.getRedundancyGroups,
  saveRedundancyGroups: redundancyStorage.saveRedundancyGroups,
  updateRedundancyGroupStatus: redundancyStorage.updateRedundancyGroupStatus,
  deleteRedundancyGroups: redundancyStorage.deleteRedundancyGroups,
  // Ownership-aware redundancy
  getRedundancyGroupForBrainlift: redundancyStorage.getRedundancyGroupForBrainlift,
  updateRedundancyGroupStatusForBrainlift: redundancyStorage.updateRedundancyGroupStatusForBrainlift,

  // Analytics
  getModelAccuracyStats: analyticsStorage.getModelAccuracyStats,
  getLlmFeedbackHistory: analyticsStorage.getLlmFeedbackHistory,
};

// Export individual modules for direct access if needed
export { brainliftsStorage, readingListStorage, expertsStorage, verificationsStorage, redundancyStorage, analyticsStorage };
