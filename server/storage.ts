// Re-export storage facade from new modular structure
// This file maintains backward compatibility for imports like:
//   import { storage } from "../storage"

export { storage } from "./storage/index";

// Re-export types for backward compatibility
export type {
  Brainlift, BrainliftData, InsertBrainlift,
  Fact, ContradictionCluster, ReadingListItem, ReadingListGrade, InsertReadingListGrade,
  BrainliftVersion, SourceFeedback, InsertSourceFeedback, Expert, InsertExpert,
  FactVerification, InsertFactVerification, FactModelScore, InsertFactModelScore,
  FactWithVerification, LlmFeedback, ModelAccuracyStats,
  FactRedundancyGroup, InsertFactRedundancyGroup, RedundancyStatus,
  AuthContext
} from "./storage/index";
