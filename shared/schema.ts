import { pgTable, text, serial, integer, jsonb, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";


// === TABLE DEFINITIONS ===

// Classification enum values
export const CLASSIFICATION = {
  BRAINLIFT: 'brainlift',
  PARTIAL: 'partial',
  NOT_BRAINLIFT: 'not_brainlift'
} as const;

export type Classification = typeof CLASSIFICATION[keyof typeof CLASSIFICATION];

export const brainlifts = pgTable("brainlifts", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  author: text("author"),
  createdByUserId: varchar("created_by_user_id"), // Nullable for legacy/public brainlifts
  classification: text("classification").$type<Classification>().default('brainlift').notNull(),
  rejectionReason: text("rejection_reason"),
  rejectionSubtype: text("rejection_subtype"),
  rejectionRecommendation: text("rejection_recommendation"),
  flags: text("flags").array(),
  improperlyFormatted: boolean("improperly_formatted").default(false).notNull(),
  originalContent: text("original_content"),
  sourceType: text("source_type"),
  summary: jsonb("summary").$type<{
    totalFacts: number;
    meanScore: string;
    score5Count: number;
    contradictionCount: number;
  }>().notNull(),
});

export const facts = pgTable("facts", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  originalId: text("original_id").notNull(), // The string ID from JSON like "6.1"
  category: text("category").notNull(),
  source: text("source"), // Citation or source reference
  fact: text("fact").notNull(),
  summary: text("summary"), // 3-line max AI summary
  score: integer("score").notNull(),
  contradicts: text("contradicts"), // Cluster name or null
  note: text("note"), // Explanation for the score
  flags: text("flags").array(), // New column for flags like "Incomplete/Unverifiable"
  isGradeable: boolean("is_gradeable").default(true).notNull(),
});

export const contradictionClusters = pgTable("contradiction_clusters", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  name: text("name").notNull(),
  tension: text("tension").notNull(),
  status: text("status").notNull(),
  factIds: text("fact_ids").array().notNull(),
  claims: text("claims").array().notNull(),
});

export const readingListItems = pgTable("reading_list_items", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  type: text("type").notNull(), // Twitter, Substack, etc.
  author: text("author").notNull(),
  topic: text("topic").notNull(),
  time: text("time").notNull(),
  facts: text("facts").notNull(), // "What it covers"
  url: text("url").notNull(),
});

export const readingListGrades = pgTable("reading_list_grades", {
  id: serial("id").primaryKey(),
  readingListItemId: integer("reading_list_item_id").notNull().references(() => readingListItems.id),
  aligns: text("aligns"), // "yes", "no", "partial"
  contradicts: text("contradicts"), // "yes", "no"
  newInfo: text("new_info"), // "yes", "no"
  quality: integer("quality"), // 1-5
});

export const sourceFeedback = pgTable("source_feedback", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  sourceId: text("source_id").notNull(), // Unique ID: tweet ID or URL hash for research
  sourceType: text("source_type").notNull(), // "tweet" or "research"
  title: text("title").notNull(), // Author username for tweets, title for research
  snippet: text("snippet").notNull(), // Tweet text or research snippet
  url: text("url").notNull(),
  decision: text("decision").notNull(), // "accepted" or "rejected"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brainliftVersions = pgTable("brainlift_versions", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sourceType: text("source_type").notNull(), // "pdf", "docx", "text", "workflowy", "gdocs"
  snapshot: jsonb("snapshot").$type<{
    title: string;
    description: string;
    author: string | null;
    summary: { totalFacts: number; meanScore: string; score5Count: number; contradictionCount: number };
    facts: Array<{ originalId: string; category: string; source: string | null; fact: string; score: number; contradicts: string | null; note: string | null }>;
    contradictionClusters: Array<{ name: string; tension: string; status: string; factIds: string[]; claims: string[] }>;
    readingList: Array<{ type: string; author: string; topic: string; time: string; facts: string; url: string }>;
    grades: Array<{ readingListTopic: string; aligns: string | null; contradicts: string | null; newInfo: string | null; quality: number | null }>;
  }>().notNull(),
});

export const experts = pgTable("experts", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  name: text("name").notNull(),
  rankScore: integer("rank_score").notNull(), // 1-10 impact score
  rationale: text("rationale").notNull(), // One-line explanation for ranking
  source: text("source").notNull(), // "listed" (from brainlift) or "verification" (from fact notes)
  twitterHandle: text("twitter_handle"), // Optional X/Twitter handle
  isFollowing: boolean("is_following").notNull().default(true), // Auto-follow if rank > 5
});

// Multi-LLM Fact Verification System - 5 Models via OpenRouter
export const LLM_MODELS = {
  CLAUDE_OPUS: 'anthropic/claude-opus-4.5',
  GEMINI_PRO: 'google/gemini-2.5-pro',
  GPT: 'openai/gpt-5.2',
  QWEN: 'qwen/qwen3-max',
  DEEPSEEK: 'deepseek/deepseek-v3.2',
} as const;

export const LLM_MODEL_NAMES: Record<LLMModel, string> = {
  'anthropic/claude-opus-4.5': 'Claude Opus 4.5',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'openai/gpt-5.2': 'ChatGPT 5.2',
  'qwen/qwen3-max': 'Qwen3-Max',
  'deepseek/deepseek-v3.2': 'DeepSeek V3.2',
};

export type LLMModel = typeof LLM_MODELS[keyof typeof LLM_MODELS];

export const VERIFICATION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type VerificationStatus = typeof VERIFICATION_STATUS[keyof typeof VERIFICATION_STATUS];

// Stores the overall verification state and consensus for each fact
export const factVerifications = pgTable("fact_verifications", {
  id: serial("id").primaryKey(),
  factId: integer("fact_id").notNull().references(() => facts.id),
  status: text("status").$type<VerificationStatus>().notNull().default('pending'),
  
  // Evidence retrieved from cited source
  evidenceUrl: text("evidence_url"),
  evidenceContent: text("evidence_content"), // Actual content fetched from source
  evidenceFetchedAt: timestamp("evidence_fetched_at"),
  evidenceError: text("evidence_error"), // Error if fetch failed
  
  // Consensus results (after all models have graded)
  consensusScore: integer("consensus_score"), // 1-5 final grade
  confidenceLevel: text("confidence_level"), // "high", "medium", "low"
  needsReview: boolean("needs_review").notNull().default(false), // Flag for human review
  verificationNotes: text("verification_notes"), // Explanation of consensus
  
  // Human override
  humanOverrideScore: integer("human_override_score"), // If human overrides
  humanOverrideNotes: text("human_override_notes"),
  humanOverrideAt: timestamp("human_override_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Stores individual model scores for each fact
export const factModelScores = pgTable("fact_model_scores", {
  id: serial("id").primaryKey(),
  verificationId: integer("verification_id").notNull().references(() => factVerifications.id),
  model: text("model").$type<LLMModel>().notNull(), // Which LLM model
  score: integer("score"), // 1-5 grade from this model
  rationale: text("rationale"), // Model's explanation
  status: text("status").$type<VerificationStatus>().notNull().default('pending'),
  error: text("error"), // Error if model call failed
  completedAt: timestamp("completed_at"),
});

// === RELATIONS ===

export const brainliftsRelations = relations(brainlifts, ({ many }) => ({
  facts: many(facts),
  contradictionClusters: many(contradictionClusters),
  readingListItems: many(readingListItems),
  versions: many(brainliftVersions),
  sourceFeedback: many(sourceFeedback),
  experts: many(experts),
}));

export const expertsRelations = relations(experts, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [experts.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const sourceFeedbackRelations = relations(sourceFeedback, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [sourceFeedback.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const brainliftVersionsRelations = relations(brainliftVersions, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [brainliftVersions.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const factsRelations = relations(facts, ({ one, many }) => ({
  brainlift: one(brainlifts, {
    fields: [facts.brainliftId],
    references: [brainlifts.id],
  }),
  verification: one(factVerifications),
}));

export const factVerificationsRelations = relations(factVerifications, ({ one, many }) => ({
  fact: one(facts, {
    fields: [factVerifications.factId],
    references: [facts.id],
  }),
  modelScores: many(factModelScores),
}));

export const factModelScoresRelations = relations(factModelScores, ({ one }) => ({
  verification: one(factVerifications, {
    fields: [factModelScores.verificationId],
    references: [factVerifications.id],
  }),
}));

// LLM Feedback System - Tracks human overrides to improve AI grading
export const llmFeedback = pgTable("llm_feedback", {
  id: serial("id").primaryKey(),
  verificationId: integer("verification_id").notNull().references(() => factVerifications.id),
  factId: integer("fact_id").notNull().references(() => facts.id),
  llmModel: text("llm_model").$type<LLMModel>().notNull(),
  llmScore: integer("llm_score").notNull(), // Original AI score (1-5)
  humanScore: integer("human_score").notNull(), // Human override score (1-5)
  scoreDifference: integer("score_difference").notNull(), // Absolute difference
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Aggregated model accuracy stats - updated on each human override
export const modelAccuracyStats = pgTable("model_accuracy_stats", {
  id: serial("id").primaryKey(),
  model: text("model").$type<LLMModel>().notNull().unique(),
  totalSamples: integer("total_samples").notNull().default(0),
  totalAbsoluteError: integer("total_absolute_error").notNull().default(0), // Sum of all score differences
  meanAbsoluteError: text("mean_absolute_error").notNull().default('0'), // Stored as string for precision
  weight: text("weight").notNull().default('1'), // Model weight for consensus (stored as string)
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export const llmFeedbackRelations = relations(llmFeedback, ({ one }) => ({
  verification: one(factVerifications, {
    fields: [llmFeedback.verificationId],
    references: [factVerifications.id],
  }),
  fact: one(facts, {
    fields: [llmFeedback.factId],
    references: [facts.id],
  }),
}));

export const modelAccuracyStatsRelations = relations(modelAccuracyStats, ({ }) => ({}));

// DOK1 Redundancy Flagging - Groups of semantically similar facts
export const REDUNDANCY_STATUS = {
  PENDING: 'pending', // Awaiting review
  KEPT: 'kept', // User chose to keep this fact
  MERGED: 'merged', // Fact was merged into another
  DISMISSED: 'dismissed', // Redundancy flag dismissed (not actually redundant)
} as const;

export type RedundancyStatus = typeof REDUNDANCY_STATUS[keyof typeof REDUNDANCY_STATUS];

export const factRedundancyGroups = pgTable("fact_redundancy_groups", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  groupName: text("group_name").notNull(), // e.g., "Funding statistics" 
  factIds: integer("fact_ids").array().notNull(), // Array of fact IDs in this group
  primaryFactId: integer("primary_fact_id"), // Suggested fact to keep (highest score/most comprehensive)
  similarityScore: text("similarity_score").notNull(), // Average similarity percentage (e.g., "87%")
  reason: text("reason").notNull(), // Why these are considered redundant
  status: text("status").$type<RedundancyStatus>().notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const factRedundancyGroupsRelations = relations(factRedundancyGroups, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [factRedundancyGroups.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const contradictionClustersRelations = relations(contradictionClusters, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [contradictionClusters.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const readingListItemsRelations = relations(readingListItems, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [readingListItems.brainliftId],
    references: [brainlifts.id],
  }),
  grade: one(readingListGrades),
}));

export const readingListGradesRelations = relations(readingListGrades, ({ one }) => ({
  readingListItem: one(readingListItems, {
    fields: [readingListGrades.readingListItemId],
    references: [readingListItems.id],
  }),
}));

// === SCHEMAS ===

export const insertBrainliftSchema = createInsertSchema(brainlifts);
export const insertFactSchema = createInsertSchema(facts).omit({ id: true });
export const insertContradictionClusterSchema = createInsertSchema(contradictionClusters).omit({ id: true });
export const insertReadingListItemSchema = createInsertSchema(readingListItems).omit({ id: true });
export const insertReadingListGradeSchema = createInsertSchema(readingListGrades).omit({ id: true });
export const insertSourceFeedbackSchema = createInsertSchema(sourceFeedback).omit({ id: true, createdAt: true });
export const insertBrainliftVersionSchema = createInsertSchema(brainliftVersions).omit({ id: true, createdAt: true });
export const insertExpertSchema = createInsertSchema(experts).omit({ id: true });
export const insertFactVerificationSchema = createInsertSchema(factVerifications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFactModelScoreSchema = createInsertSchema(factModelScores).omit({ id: true });
export const insertLlmFeedbackSchema = createInsertSchema(llmFeedback).omit({ id: true, createdAt: true });
export const insertModelAccuracyStatsSchema = createInsertSchema(modelAccuracyStats).omit({ id: true, lastUpdated: true });
export const insertFactRedundancyGroupSchema = createInsertSchema(factRedundancyGroups).omit({ id: true, createdAt: true });

// === TYPES ===

export type Brainlift = typeof brainlifts.$inferSelect;
export type InsertBrainlift = z.infer<typeof insertBrainliftSchema>;

export type Fact = typeof facts.$inferSelect;
export type ContradictionCluster = typeof contradictionClusters.$inferSelect;
export type ReadingListItem = typeof readingListItems.$inferSelect;
export type ReadingListGrade = typeof readingListGrades.$inferSelect;
export type InsertReadingListGrade = z.infer<typeof insertReadingListGradeSchema>;
export type SourceFeedback = typeof sourceFeedback.$inferSelect;
export type InsertSourceFeedback = z.infer<typeof insertSourceFeedbackSchema>;
export type BrainliftVersion = typeof brainliftVersions.$inferSelect;
export type InsertBrainliftVersion = z.infer<typeof insertBrainliftVersionSchema>;
export type Expert = typeof experts.$inferSelect;
export type InsertExpert = z.infer<typeof insertExpertSchema>;
export type FactVerification = typeof factVerifications.$inferSelect;
export type InsertFactVerification = z.infer<typeof insertFactVerificationSchema>;
export type FactModelScore = typeof factModelScores.$inferSelect;
export type InsertFactModelScore = z.infer<typeof insertFactModelScoreSchema>;
export type LlmFeedback = typeof llmFeedback.$inferSelect;
export type InsertLlmFeedback = z.infer<typeof insertLlmFeedbackSchema>;
export type ModelAccuracyStats = typeof modelAccuracyStats.$inferSelect;
export type InsertModelAccuracyStats = z.infer<typeof insertModelAccuracyStatsSchema>;
export type FactRedundancyGroup = typeof factRedundancyGroups.$inferSelect;
export type InsertFactRedundancyGroup = z.infer<typeof insertFactRedundancyGroupSchema>;

// Full brainlift data with nested relations (for API response)
export interface BrainliftData extends Brainlift {
  facts: Fact[];
  contradictionClusters: ContradictionCluster[];
  readingList: ReadingListItem[];
  experts: Expert[];
}

// Fact with verification data for API response
export interface FactWithVerification extends Fact {
  verification?: FactVerification & {
    modelScores: FactModelScore[];
  };
}
