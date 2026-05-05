import { pgTable, text, serial, integer, jsonb, boolean, timestamp, varchar, date, index, unique, uniqueIndex, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations, sql } from "drizzle-orm";
import type {
  AnalyticsOrigin,
  DriftRepresentative,
  FrozenBrainliftSnapshot,
  GraderMonitoringTimezone,
  QABatchStatus,
  QABatchType,
  WeeklyConsistencyMetrics,
  WeeklyConsistencyRunStatus,
  WeeklyConsistencyTriggerKind,
  WeeklyModelDriftMetrics,
  WeeklyResultLevel,
} from "./analytics-types";


// === AUTH TABLES (Better Auth) ===

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  // Better Auth admin plugin fields
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Better Auth admin plugin field
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

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
  displayPurpose: text("display_purpose"),  // Short UI-friendly summary of purpose
  author: text("author"),
  createdByUserId: text("created_by_user_id").references(() => user.id), // Nullable for legacy/public brainlifts
  classification: text("classification").$type<Classification>().default('brainlift').notNull(),
  rejectionReason: text("rejection_reason"),
  rejectionSubtype: text("rejection_subtype"),
  rejectionRecommendation: text("rejection_recommendation"),
  flags: text("flags").array(),
  improperlyFormatted: boolean("improperly_formatted").default(false).notNull(),
  originalContent: text("original_content"),
  sourceType: text("source_type"),
  origin: text("origin").$type<AnalyticsOrigin | null>(),
  coverImageUrl: text("cover_image_url"),  // AI-generated cover image stored in S3
  gdriveRootFolderId: text("gdrive_root_folder_id"),
  expertDiagnostics: jsonb("expert_diagnostics").$type<{
    isValid: boolean;
    diagnostics: Array<{
      code: string;
      severity: 'error' | 'warning' | 'info';
      message: string;
      details?: string;
      affectedExperts?: string[];
    }>;
    summary: {
      expertsFound: number;
      expertsWithStructuredFields: number;
      expertsWithSocialLinks: number;
      hasRequiredFields: boolean;
    };
  }>(),
  summary: jsonb("summary").$type<{
    totalFacts: number;
    meanScore: string;
    score5Count: number;
    contradictionCount: number;
  }>().notNull(),
  // Import Agent fields
  importStatus: text("import_status").$type<ImportStatus>().default('pending'),
  importHierarchy: jsonb("import_hierarchy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("brainlifts_created_by_user_id_idx").on(table.createdByUserId),
]);

export const facts = pgTable("facts", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  originalId: text("original_id").notNull(), // The string ID from JSON like "6.1"
  category: text("category"), // Nullable for builder-linked facts (derive from LS item's categoryId)
  source: text("source"), // Citation or source reference
  fact: text("fact").notNull(),
  summary: text("summary"), // 3-line max AI summary
  score: integer("score").notNull(),
  contradicts: text("contradicts"), // Cluster name or null
  note: text("note"), // Explanation for the score
  flags: text("flags").array(), // New column for flags like "Incomplete/Unverifiable"
  isGradeable: boolean("is_gradeable").default(true).notNull(),
  // Builder Phase 3: link facts to their source LS item
  learningStreamItemId: integer("learning_stream_item_id")
    .references(() => learningStreamItems.id, { onDelete: "set null" }),
  // Granular editing: grading status, stale tracking, version timestamps
  gradingStatus: text("grading_status").$type<'graded' | 'regrading' | 'grading' | 'error'>().default('graded').notNull(),
  isStale: boolean("is_stale").default(false).notNull(),
  staleReason: text("stale_reason"),
  updatedAt: timestamp("updated_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_facts_learning_stream_item_id").on(table.learningStreamItemId),
]);

export const brainliftScoreLog = pgTable("brainlift_score_log", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
  origin: text("origin").$type<AnalyticsOrigin | null>(),
  windowStartedAt: timestamp("window_started_at").notNull(),
  lastEventAt: timestamp("last_event_at").notNull(),
  eventCount: integer("event_count").notNull().default(1),
  triggerSet: text("trigger_set").array().notNull(),
  startOverallScore: text("start_overall_score").notNull(),
  endOverallScore: text("end_overall_score").notNull(),
  peakOverallScore: text("peak_overall_score").notNull(),
  troughOverallScore: text("trough_overall_score").notNull(),
  startFactCount: integer("start_fact_count").notNull(),
  endFactCount: integer("end_fact_count").notNull(),
  peakRecordedAt: timestamp("peak_recorded_at").notNull(),
  troughRecordedAt: timestamp("trough_recorded_at").notNull(),
}, (table) => [
  index("brainlift_score_log_brainlift_last_event_idx").on(table.brainliftId, table.lastEventAt),
]);

export const brainliftScoreSummary = pgTable("brainlift_score_summary", {
  brainliftId: integer("brainlift_id").primaryKey().references(() => brainlifts.id, { onDelete: "cascade" }),
  firstScore: text("first_score").notNull(),
  firstRecordedAt: timestamp("first_recorded_at").notNull(),
  latestScore: text("latest_score").notNull(),
  latestRecordedAt: timestamp("latest_recorded_at").notNull(),
  peakScore: text("peak_score").notNull(),
  peakRecordedAt: timestamp("peak_recorded_at").notNull(),
  totalEvents: integer("total_events").notNull().default(0),
  totalWindows: integer("total_windows").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("brainlift_score_summary_latest_idx").on(table.latestRecordedAt),
]);

export const contradictionClusters = pgTable("contradiction_clusters", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  name: text("name").notNull(),
  tension: text("tension").notNull(),
  status: text("status").notNull(),
  factIds: text("fact_ids").array().notNull(),
  claims: text("claims").array().notNull(),
});

export const brainliftVersions = pgTable("brainlift_versions", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sourceType: text("source_type").notNull(), // "html", "workflowy", "googledocs"
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
  who: text("who"),
  why: text("why"),
  focus: text("focus"),
  where: text("where"),
  rankScore: integer("rank_score"), // 1-10 impact score (null if unranked)
  rationale: text("rationale"), // One-line explanation for ranking (null if unranked)
  source: text("source").notNull(), // "listed" (from brainlift) or "verification" (from fact notes)
  twitterHandle: text("twitter_handle"), // Optional X/Twitter handle
  isFollowing: boolean("is_following").notNull().default(true), // Auto-follow if rank > 5
});

// Brainlift Sharing - User-specific and token-based access control
export const brainliftShares = pgTable("brainlift_shares", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<'user' | 'token'>(),
  permission: text("permission").notNull().$type<'viewer' | 'editor'>(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  token: text("token").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
  // Indexes
  index("idx_brainlift_shares_brainlift_id").on(table.brainliftId),
  index("idx_brainlift_shares_user_id").on(table.userId).where(sql`${table.userId} IS NOT NULL`),
  index("idx_brainlift_shares_token").on(table.token).where(sql`${table.token} IS NOT NULL`),

  // Constraints
  unique("unique_user_share").on(table.brainliftId, table.userId),

  // CHECK constraints
  check("valid_type", sql`${table.type} IN ('user', 'token')`),
  check("valid_permission", sql`${table.permission} IN ('viewer', 'editor')`),
  check("user_share_has_user_id", sql`
    (${table.type} = 'user' AND ${table.userId} IS NOT NULL AND ${table.token} IS NULL) OR
    (${table.type} = 'token' AND ${table.token} IS NOT NULL AND ${table.userId} IS NULL)
  `),
]);

export const SKILL_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type SkillVisibility = typeof SKILL_VISIBILITY[keyof typeof SKILL_VISIBILITY];

export const skills = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  body: text("body").notNull(),
  visibility: text("visibility").$type<SkillVisibility>().default('public').notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
  lastEditedByUserId: text("last_edited_by_user_id").references(() => user.id, { onDelete: "set null" }),
  lastEditedAt: timestamp("last_edited_at"),
  deletedAt: timestamp("deleted_at"),
  deletedByUserId: text("deleted_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique("skills_name_unique").on(table.name),
  index("skills_created_by_user_id_idx").on(table.createdByUserId),
  index("skills_deleted_at_idx").on(table.deletedAt),
  check("skills_visibility_valid", sql`${table.visibility} IN ('public', 'private')`),
  check("skills_description_length", sql`char_length(${table.description}) <= 500`),
  check("skills_body_length", sql`char_length(${table.body}) <= 102400`),
]);

export const skillResources = pgTable("skill_resources", {
  id: serial("id").primaryKey(),
  skillId: integer("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique("skill_resources_skill_path_unique").on(table.skillId, table.path),
  index("skill_resources_skill_id_idx").on(table.skillId),
  check("skill_resources_content_length", sql`char_length(${table.content}) <= 51200`),
]);

export const skillShares = pgTable("skill_shares", {
  id: serial("id").primaryKey(),
  skillId: integer("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("skill_shares_skill_user_unique").on(table.skillId, table.userId),
  index("skill_shares_skill_id_idx").on(table.skillId),
  index("skill_shares_user_id_idx").on(table.userId),
]);

export const skillUserDisabled = pgTable("skill_user_disabled", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  skillId: integer("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  disabledAt: timestamp("disabled_at").defaultNow().notNull(),
}, (table) => [
  unique("skill_user_disabled_user_skill_unique").on(table.userId, table.skillId),
  index("skill_user_disabled_user_id_idx").on(table.userId),
  index("skill_user_disabled_skill_id_idx").on(table.skillId),
]);

export const SPRINT_PLAN_STATUS = {
  ACTIVE: 'active',
  COMPLETE: 'complete',
  GENERATING: 'generating',
  FAILED: 'failed',
} as const;

export type SprintPlanStatus = typeof SPRINT_PLAN_STATUS[keyof typeof SPRINT_PLAN_STATUS];

export const DELIVERABLE_SOURCE_SURFACE = {
  MCP: 'mcp',
  UI: 'ui',
} as const;

export type DeliverableSourceSurface = typeof DELIVERABLE_SOURCE_SURFACE[keyof typeof DELIVERABLE_SOURCE_SURFACE];

export const SPRINT_TASK_MILESTONE = {
  WEEKLY_ARTIFACT: 'weekly_artifact',
} as const;

export type SprintTaskMilestone = typeof SPRINT_TASK_MILESTONE[keyof typeof SPRINT_TASK_MILESTONE];

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").$type<SprintPlanStatus>().notNull().default('active'),
  gdriveFolderId: text("gdrive_folder_id"),
  generationError: text("generation_error"),
  generationStartedAt: timestamp("generation_started_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
}, (table) => [
  index("plans_brainlift_id_idx").on(table.brainliftId),
  index("plans_status_idx").on(table.status),
  uniqueIndex("plans_one_active_per_brainlift_idx")
    .on(table.brainliftId)
    .where(sql`${table.status} IN ('active', 'generating')`),
  check("plans_valid_status", sql`${table.status} IN ('active', 'complete', 'generating', 'failed')`),
]);

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  scheduledDate: date("scheduled_date").notNull(),
  weekNumber: integer("week_number").notNull(),
  dayInWeek: integer("day_in_week").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  milestone: text("milestone").$type<SprintTaskMilestone>(),
}, (table) => [
  index("tasks_plan_id_idx").on(table.planId),
  index("tasks_brainlift_id_idx").on(table.brainliftId),
  index("tasks_scheduled_date_idx").on(table.scheduledDate),
  check("tasks_valid_week_number", sql`${table.weekNumber} >= 1`),
  check("tasks_valid_day_in_week", sql`${table.dayInWeek} >= 1 AND ${table.dayInWeek} <= 7`),
  check("tasks_valid_milestone", sql`${table.milestone} IS NULL OR ${table.milestone} IN ('weekly_artifact')`),
]);

export const deliverables = pgTable("deliverables", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }).unique(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  docFileId: text("doc_file_id").notNull(),
  docUrl: text("doc_url").notNull(),
  sourceSurface: text("source_surface").$type<DeliverableSourceSurface>().notNull().default('ui'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => user.id),
}, (table) => [
  index("deliverables_brainlift_id_idx").on(table.brainliftId),
  check("deliverables_valid_source_surface", sql`${table.sourceSurface} IN ('mcp', 'ui')`),
]);

export const platformConfig = pgTable("platform_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

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
  model: text("model").notNull(), // Which LLM model
  score: integer("score"), // 1-5 grade from this model
  rationale: text("rationale"), // Model's explanation
  status: text("status").$type<VerificationStatus>().notNull().default('pending'),
  error: text("error"), // Error if model call failed
  completedAt: timestamp("completed_at"),
});

export const qaBatches = pgTable("qa_batches", {
  id: serial("id").primaryKey(),
  type: text("type").$type<QABatchType>().notNull(),
  status: text("status").$type<QABatchStatus>().notNull().default('pending'),
  isBaseline: boolean("is_baseline").notNull().default(false),
  baselineBatchId: integer("baseline_batch_id"),
  sampleCount: integer("sample_count").notNull().default(0),
  metrics: jsonb("metrics").$type<Record<string, unknown> | null>(),
  artifactLabel: text("artifact_label"),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("qa_batches_type_status_idx").on(table.type, table.status),
]);

export const verificationTruthSet = pgTable("verification_truth_set", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => qaBatches.id, { onDelete: "cascade" }),
  assetKey: text("asset_key").notNull(),
  dokLevel: integer("dok_level").notNull(),
  stableKey: text("stable_key").notNull(),
  brainliftId: integer("brainlift_id").references(() => brainlifts.id, { onDelete: "set null" }),
  itemId: integer("item_id"),
  frozenContext: jsonb("frozen_context").$type<Record<string, unknown>>().notNull(),
  aiScore: integer("ai_score"),
  humanScore: integer("human_score"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("verification_truth_set_unique").on(table.batchId, table.assetKey, table.dokLevel, table.stableKey),
  index("verification_truth_set_batch_key_idx").on(table.batchId, table.assetKey, table.dokLevel, table.stableKey),
]);

export const graderMonitoringSets = pgTable("grader_monitoring_sets", {
  id: serial("id").primaryKey(),
  monitoredSlugs: text("monitored_slugs").array().notNull(),
  scheduleTimezone: text("schedule_timezone").$type<GraderMonitoringTimezone>().notNull().default('America/Sao_Paulo'),
  driftRepresentative: text("drift_representative").$type<DriftRepresentative>().notNull().default('pass1'),
  snapshotVersion: integer("snapshot_version").notNull().default(0),
  active: boolean("active").notNull().default(true),
  frozenAt: timestamp("frozen_at"),
  createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("grader_monitoring_sets_active_idx").on(table.active),
]);

export const graderMonitoringBrainlifts = pgTable("grader_monitoring_brainlifts", {
  id: serial("id").primaryKey(),
  monitoringSetId: integer("monitoring_set_id").notNull().references(() => graderMonitoringSets.id, { onDelete: "cascade" }),
  snapshotVersion: integer("snapshot_version").notNull(),
  sourceBrainliftId: integer("source_brainlift_id").references(() => brainlifts.id, { onDelete: "set null" }),
  sourceSlug: text("source_slug").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose").notNull(),
  overallScore: text("overall_score").notNull(),
  snapshot: jsonb("snapshot").$type<FrozenBrainliftSnapshot>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("grader_monitoring_brainlifts_unique").on(table.monitoringSetId, table.snapshotVersion, table.sourceSlug),
  index("grader_monitoring_brainlifts_set_idx").on(table.monitoringSetId, table.snapshotVersion),
]);

export const graderMonitoringRuns = pgTable("grader_monitoring_runs", {
  id: serial("id").primaryKey(),
  monitoringSetId: integer("monitoring_set_id").notNull().references(() => graderMonitoringSets.id, { onDelete: "cascade" }),
  snapshotVersion: integer("snapshot_version").notNull(),
  weekStart: timestamp("week_start").notNull(),
  timezone: text("timezone").$type<GraderMonitoringTimezone>().notNull().default('America/Sao_Paulo'),
  triggerKind: text("trigger_kind").$type<WeeklyConsistencyTriggerKind>().notNull(),
  status: text("status").$type<WeeklyConsistencyRunStatus>().notNull().default('pending'),
  representativePass: integer("representative_pass").notNull().default(1),
  metrics: jsonb("metrics").$type<WeeklyConsistencyMetrics | null>(),
  driftMetrics: jsonb("drift_metrics").$type<WeeklyModelDriftMetrics | null>(),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("grader_monitoring_runs_unique").on(table.monitoringSetId, table.snapshotVersion, table.weekStart),
  index("grader_monitoring_runs_completed_idx").on(table.completedAt),
  index("grader_monitoring_runs_set_week_idx").on(table.monitoringSetId, table.snapshotVersion, table.weekStart),
]);

export const graderMonitoringPassResults = pgTable("grader_monitoring_pass_results", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => graderMonitoringRuns.id, { onDelete: "cascade" }),
  passNumber: integer("pass_number").notNull(),
  brainliftStableKey: text("brainlift_stable_key").notNull(),
  level: text("level").$type<WeeklyResultLevel>().notNull(),
  stableKey: text("stable_key").notNull(),
  score: text("score"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("grader_monitoring_pass_results_unique").on(
    table.runId,
    table.passNumber,
    table.brainliftStableKey,
    table.level,
    table.stableKey,
  ),
  index("grader_monitoring_pass_results_run_pass_idx").on(table.runId, table.passNumber),
]);

// === RELATIONS ===

// Auth relations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  brainlifts: many(brainlifts),
  sprintPlansCreated: many(plans),
  deliverablesCreated: many(deliverables),
  skillsCreated: many(skills, { relationName: 'skillsCreatedBy' }),
  skillsLastEdited: many(skills, { relationName: 'skillsLastEditedBy' }),
  skillsDeleted: many(skills, { relationName: 'skillsDeletedBy' }),
  skillShares: many(skillShares, { relationName: 'skillShareUser' }),
  skillSharesCreated: many(skillShares, { relationName: 'skillShareCreatedBy' }),
  disabledSkills: many(skillUserDisabled),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// App relations
export const brainliftsRelations = relations(brainlifts, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [brainlifts.createdByUserId],
    references: [user.id],
  }),
  facts: many(facts),
  contradictionClusters: many(contradictionClusters),
  versions: many(brainliftVersions),
  experts: many(experts),
  shares: many(brainliftShares),
  plans: many(plans),
  tasks: many(tasks),
  deliverables: many(deliverables),
  learningStreamItems: many(learningStreamItems),
  categories: many(categories),
  nativeDetails: one(nativeBrainliftDetails),
  builderExperts: many(builderExperts),
  graderMonitoringSnapshots: many(graderMonitoringBrainlifts),
}));

export const brainliftSharesRelations = relations(brainliftShares, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [brainliftShares.brainliftId],
    references: [brainlifts.id],
  }),
  user: one(user, {
    fields: [brainliftShares.userId],
    references: [user.id],
  }),
  createdBy: one(user, {
    fields: [brainliftShares.createdByUserId],
    references: [user.id],
  }),
}));

export const skillsRelations = relations(skills, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [skills.createdByUserId],
    references: [user.id],
    relationName: 'skillsCreatedBy',
  }),
  lastEditedBy: one(user, {
    fields: [skills.lastEditedByUserId],
    references: [user.id],
    relationName: 'skillsLastEditedBy',
  }),
  deletedBy: one(user, {
    fields: [skills.deletedByUserId],
    references: [user.id],
    relationName: 'skillsDeletedBy',
  }),
  resources: many(skillResources),
  shares: many(skillShares),
  disabledUsers: many(skillUserDisabled),
}));

export const skillResourcesRelations = relations(skillResources, ({ one }) => ({
  skill: one(skills, {
    fields: [skillResources.skillId],
    references: [skills.id],
  }),
}));

export const skillSharesRelations = relations(skillShares, ({ one }) => ({
  skill: one(skills, {
    fields: [skillShares.skillId],
    references: [skills.id],
  }),
  user: one(user, {
    fields: [skillShares.userId],
    references: [user.id],
    relationName: 'skillShareUser',
  }),
  createdBy: one(user, {
    fields: [skillShares.createdByUserId],
    references: [user.id],
    relationName: 'skillShareCreatedBy',
  }),
}));

export const skillUserDisabledRelations = relations(skillUserDisabled, ({ one }) => ({
  skill: one(skills, {
    fields: [skillUserDisabled.skillId],
    references: [skills.id],
  }),
  user: one(user, {
    fields: [skillUserDisabled.userId],
    references: [user.id],
  }),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  brainlift: one(brainlifts, {
    fields: [plans.brainliftId],
    references: [brainlifts.id],
  }),
  createdBy: one(user, {
    fields: [plans.createdByUserId],
    references: [user.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  plan: one(plans, {
    fields: [tasks.planId],
    references: [plans.id],
  }),
  brainlift: one(brainlifts, {
    fields: [tasks.brainliftId],
    references: [brainlifts.id],
  }),
  deliverable: one(deliverables),
}));

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  task: one(tasks, {
    fields: [deliverables.taskId],
    references: [tasks.id],
  }),
  brainlift: one(brainlifts, {
    fields: [deliverables.brainliftId],
    references: [brainlifts.id],
  }),
  createdBy: one(user, {
    fields: [deliverables.createdByUserId],
    references: [user.id],
  }),
}));

export const expertsRelations = relations(experts, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [experts.brainliftId],
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
  llmModel: text("llm_model").notNull(),
  llmScore: integer("llm_score").notNull(), // Original AI score (1-5)
  humanScore: integer("human_score").notNull(), // Human override score (1-5)
  scoreDifference: integer("score_difference").notNull(), // Absolute difference
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Aggregated model accuracy stats - updated on each human override
export const modelAccuracyStats = pgTable("model_accuracy_stats", {
  id: serial("id").primaryKey(),
  model: text("model").notNull().unique(),
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

// Learning Stream - Extracted content types (discriminated union)
export type ExtractedContent =
  | { contentType: 'embed'; embedType: 'youtube'; embedId: string }
  | { contentType: 'embed'; embedType: 'spotify'; embedId: string }
  | { contentType: 'embed'; embedType: 'apple-podcast'; embedUrl: string }
  | { contentType: 'embed'; embedType: 'tweet'; tweetId: string }
  | { contentType: 'article'; markdown: string; title?: string; siteName?: string }
  | { contentType: 'pdf'; url: string }
  | { contentType: 'fallback'; reason: string };

// Builder Phase 3 - Category Suggestion State (JSONB on native_brainlift_details)
export interface CategorySuggestionState {
  threshold: number;
  status: 'pending' | 'ready' | 'accepted' | 'dismissed' | 'failed';
  payload: {
    suggestions: Array<{ tempId: string; name: string; itemIds: number[] }>;
    uncategorizedItemIds: number[];
  } | null;
  sourceCountSnapshot: number;
  generatedAt: string | null;
  error: string | null;
}

// Builder Phase 3 - Categories for organizing saved knowledge tree sources
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("categories_brainlift_id_idx").on(table.brainliftId),
]);

// Learning Stream - Automated research feed items
export const learningStreamItems = pgTable("learning_stream_items", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),

  // Source metadata
  type: text("type").notNull(), // "Substack", "Twitter", "Academic Paper", "Podcast", "Video", "News"
  author: text("author").notNull(),
  topic: text("topic").notNull(), // Title or brief description
  time: text("time").notNull(), // "5 min", "15 min"
  facts: text("facts").notNull(), // Summary/relevance description
  url: text("url").notNull(),

  // Learning stream state
  status: text("status").$type<'pending' | 'bookmarked' | 'graded' | 'discarded'>()
    .default('pending')
    .notNull(),
  source: text("source").$type<'quick-search' | 'deep-research' | 'twitter' | 'swarm-research' | 'manual'>().notNull(),

  // Builder Phase 3: category assignment (nullable for non-builder items)
  categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),

  // Grading fields (populated when status='graded')
  quality: integer("quality"), // 1-5 scale, nullable
  alignment: text("alignment").$type<'yes' | 'no'>(), // nullable

  // AI metadata
  relevanceScore: text("relevance_score"), // "0.85" from AI classification
  aiRationale: text("ai_rationale"), // Why AI suggested this

  // Cached extracted content for inline viewing
  extractedContent: jsonb("extracted_content").$type<ExtractedContent | null>(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Prevent duplicate URLs per brainlift
  unique("unique_brainlift_url").on(table.brainliftId, table.url),
  // Optimize status filtering queries
  index("idx_learning_stream_status").on(table.brainliftId, table.status),
]);

export type LearningStreamItem = typeof learningStreamItems.$inferSelect;
export type NewLearningStreamItem = typeof learningStreamItems.$inferInsert;

// Knowledge Check - Quiz question and answer types
export interface QuizQuestion {
  question: string;          // The question text
  options: string[];         // 4 options (shuffled, correct position varies)
  correctIndex: number;      // Index of correct answer in options array
  explanation: string;       // Why the correct answer is correct (shown as feedback)
  conceptTested: string;     // The concept this question tests (from phase 1)
  misconceptions: string[];  // What each distractor targets (parallel to non-correct options)
}

export interface QuizAnswer {
  questionIndex: number;     // Index into questions array
  selectedIndex: number;     // Which option the student selected
  correct: boolean;          // Whether selectedIndex === correctIndex
}

// Knowledge Check - Quiz storage
export const knowledgeCheckQuizzes = pgTable("knowledge_check_quizzes", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull()
    .references(() => learningStreamItems.id, { onDelete: "cascade" }),
  brainliftId: integer("brainlift_id").notNull()
    .references(() => brainlifts.id, { onDelete: "cascade" }),

  // Generated quiz content
  questions: jsonb("questions").$type<QuizQuestion[]>().notNull(),

  // Student responses (null until submitted)
  answers: jsonb("answers").$type<QuizAnswer[] | null>(),
  score: integer("score"),                    // number correct, null until submitted
  completedAt: timestamp("completed_at"),     // null until submitted

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // One quiz per item per brainlift
  unique("unique_quiz_per_item").on(table.itemId, table.brainliftId),
]);

export type KnowledgeCheckQuiz = typeof knowledgeCheckQuizzes.$inferSelect;

// DOK2 Grading - Fail reasons for auto-fail conditions
export const DOK2_FAIL_REASON = {
  COPY_PASTE: 'copy_paste',
  NO_PURPOSE_RELATION: 'no_purpose_relation',
  FACTUAL_MISREPRESENTATION: 'factual_misrepresentation',
  FACT_MANIPULATION: 'fact_manipulation',
} as const;

export type DOK2FailReason = typeof DOK2_FAIL_REASON[keyof typeof DOK2_FAIL_REASON];

// DOK2 Summary Storage - Owner's interpretation/synthesis of sources
// One summary group per source, containing multiple summary points
export const dok2Summaries = pgTable("dok2_summaries", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id),
  category: text("category"), // Nullable for builder-linked summaries (derive from LS item's categoryId)
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  displayTitle: text("display_title"),  // AI-generated insight title (e.g., "Key findings on athlete compensation")
  workflowyNodeId: text("workflowy_node_id"), // Original DOK2 marker node ID
  sourceWorkflowyNodeId: text("source_workflowy_node_id"), // Source node ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // DOK2 Grading fields
  grade: integer("grade"), // 1-5 grading scale
  diagnosis: text("diagnosis"), // Why this score was given
  feedback: text("feedback"), // How to improve
  gradedAt: timestamp("graded_at"),
  failReason: text("fail_reason").$type<DOK2FailReason>(), // Auto-fail reason if grade=1
  sourceVerified: boolean("source_verified"), // Was the source URL successfully fetched?
  // Builder Phase 3: link DOK2 summaries to their source LS item
  learningStreamItemId: integer("learning_stream_item_id")
    .references(() => learningStreamItems.id, { onDelete: "set null" }),
  // Granular editing: grading status, stale tracking, version timestamps
  gradingStatus: text("grading_status").$type<'graded' | 'regrading' | 'grading' | 'error'>().default('graded').notNull(),
  isStale: boolean("is_stale").default(false).notNull(),
  staleReason: text("stale_reason"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_dok2_summaries_learning_stream_item_id").on(table.learningStreamItemId),
]);

// Individual summary points within a DOK2 group
export const dok2Points = pgTable("dok2_points", {
  id: serial("id").primaryKey(),
  summaryId: integer("summary_id").notNull().references(() => dok2Summaries.id),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").default(0),
});

// Link DOK2 summaries to related DOK1 facts (for grading: "do summaries capture these facts?")
export const dok2FactRelations = pgTable("dok2_fact_relations", {
  id: serial("id").primaryKey(),
  summaryId: integer("summary_id").notNull().references(() => dok2Summaries.id),
  factId: integer("fact_id").notNull().references(() => facts.id),
});

export const dok2SummariesRelations = relations(dok2Summaries, ({ one, many }) => ({
  brainlift: one(brainlifts, {
    fields: [dok2Summaries.brainliftId],
    references: [brainlifts.id],
  }),
  points: many(dok2Points),
  factRelations: many(dok2FactRelations),
}));

export const dok2PointsRelations = relations(dok2Points, ({ one }) => ({
  summary: one(dok2Summaries, {
    fields: [dok2Points.summaryId],
    references: [dok2Summaries.id],
  }),
}));

export const dok2FactRelationsRelations = relations(dok2FactRelations, ({ one }) => ({
  summary: one(dok2Summaries, {
    fields: [dok2FactRelations.summaryId],
    references: [dok2Summaries.id],
  }),
  fact: one(facts, {
    fields: [dok2FactRelations.factId],
    references: [facts.id],
  }),
}));

export const contradictionClustersRelations = relations(contradictionClusters, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [contradictionClusters.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const categoriesRelations = relations(categories, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [categories.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const learningStreamItemsRelations = relations(learningStreamItems, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [learningStreamItems.brainliftId],
    references: [brainlifts.id],
  }),
  category: one(categories, {
    fields: [learningStreamItems.categoryId],
    references: [categories.id],
  }),
}));

// Swarm Usage - Tracks daily swarm runs per user for rate limiting
export const swarmUsage = pgTable("swarm_usage", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_swarm_usage_user_date").on(table.userId, table.createdAt),
]);

export const swarmUsageRelations = relations(swarmUsage, ({ one }) => ({
  user: one(user, {
    fields: [swarmUsage.userId],
    references: [user.id],
  }),
  brainlift: one(brainlifts, {
    fields: [swarmUsage.brainliftId],
    references: [brainlifts.id],
  }),
}));

// DOK3 Models — used for DOK3 grading (quality-tier and fast-tier)
export const DOK3_MODELS = {
  // Quality-tier (conceptual coherence evaluation)
  OPUS: 'anthropic/claude-opus-4.6',
  SONNET_FALLBACK: 'anthropic/claude-sonnet-4.5',
  // Mid-tier (traceability) — Gemini primary, Sonnet fallback on rate limit
  GEMINI_FLASH: 'google/gemini-2.0-flash-001',
  SONNET_MID_FALLBACK: 'anthropic/claude-sonnet-4.5',
} as const;

export type DOK3Model = typeof DOK3_MODELS[keyof typeof DOK3_MODELS];


// DOK3 Insight Status
export const DOK3_INSIGHT_STATUS = {
  PENDING_LINKING: 'pending_linking',
  LINKED: 'linked',
  GRADING: 'grading',
  GRADED: 'graded',
  ERROR: 'error',
  SCRATCHPADDED: 'scratchpadded',
} as const;

export type DOK3InsightStatus = typeof DOK3_INSIGHT_STATUS[keyof typeof DOK3_INSIGHT_STATUS];

// DOK3 Insights - Cross-source insights linking multiple DOK2 summaries
export const dok3Insights = pgTable("dok3_insights", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  workflowyNodeId: text("workflowy_node_id"),
  status: text("status").$type<DOK3InsightStatus>().notNull().default('pending_linking'),
  score: integer("score"),
  frameworkName: text("framework_name"),
  frameworkDescription: text("framework_description"),
  criteriaBreakdown: jsonb("criteria_breakdown"),
  rationale: text("rationale"),
  feedback: text("feedback"),
  foundationIntegrityIndex: text("foundation_integrity_index"),
  dok1FoundationScore: text("dok1_foundation_score"),
  dok2SynthesisScore: text("dok2_synthesis_score"),
  linkingFlagged: boolean("linking_flagged").default(false).notNull(),
  traceabilityFlagged: boolean("traceability_flagged").default(false),
  traceabilityFlaggedSource: text("traceability_flagged_source"),
  evaluatorModel: text("evaluator_model"),
  sourceRankings: jsonb("source_rankings").$type<Record<string, number>>(),
  gradedAt: timestamp("graded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  // Granular editing: stale tracking and version timestamps
  isStale: boolean("is_stale").default(false).notNull(),
  staleReason: text("stale_reason"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_dok3_insights_brainlift").on(table.brainliftId),
]);

// DOK3 Insight Links (many-to-many: insight ↔ dok2_summary)
export const dok3InsightLinks = pgTable("dok3_insight_links", {
  id: serial("id").primaryKey(),
  insightId: integer("insight_id").notNull().references(() => dok3Insights.id, { onDelete: "cascade" }),
  dok2SummaryId: integer("dok2_summary_id").notNull().references(() => dok2Summaries.id, { onDelete: "cascade" }),
}, (table) => [
  unique("dok3_insight_links_unique").on(table.insightId, table.dok2SummaryId),
  index("idx_dok3_insight_links_insight").on(table.insightId),
  index("idx_dok3_insight_links_dok2").on(table.dok2SummaryId),
]);

// DOK3 Scratchpad table removed in Phase 5 — scratchpad is now a soft-delete status on dok3_insights

export const dok3InsightsRelations = relations(dok3Insights, ({ one, many }) => ({
  brainlift: one(brainlifts, {
    fields: [dok3Insights.brainliftId],
    references: [brainlifts.id],
  }),
  links: many(dok3InsightLinks),
}));

export const dok3InsightLinksRelations = relations(dok3InsightLinks, ({ one }) => ({
  insight: one(dok3Insights, {
    fields: [dok3InsightLinks.insightId],
    references: [dok3Insights.id],
  }),
  dok2Summary: one(dok2Summaries, {
    fields: [dok3InsightLinks.dok2SummaryId],
    references: [dok2Summaries.id],
  }),
}));

// dok3Scratchpad relations removed in Phase 5

// === DOK4 TABLES ===

// DOK4 SPOV Status
export const DOK4_SPOV_STATUS = {
  PENDING_LINKING: 'pending_linking',
  LINKED: 'linked',
  GRADING: 'grading',
  GRADED: 'graded',
  REJECTED: 'rejected',
  ERROR: 'error',
} as const;

export type DOK4SpovStatus = typeof DOK4_SPOV_STATUS[keyof typeof DOK4_SPOV_STATUS];

// DOK4 SPOVs - Spiky Points of View (apex-level knowledge claims)
export const dok4Spovs = pgTable("dok4_spovs", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  workflowyNodeId: text("workflowy_node_id"),

  // Status
  status: text("status").$type<DOK4SpovStatus>().notNull().default('pending_linking'),

  // POV Validation (Step 1)
  rejectionReason: text("rejection_reason"),
  rejectionCategory: text("rejection_category"),

  // Foundation Integrity (Step 2)
  foundationIntegrityIndex: text("foundation_integrity_index"),
  dok1FoundationScore: text("dok1_foundation_score"),
  dok2FoundationScore: text("dok2_foundation_score"),
  dok3FoundationScore: text("dok3_foundation_score"),
  foundationCeiling: integer("foundation_ceiling"),

  // Traceability (Step 3)
  traceabilityFlagged: boolean("traceability_flagged").default(false),
  traceabilityFlaggedSource: text("traceability_flagged_source"),
  traceabilityOverlapSummary: text("traceability_overlap_summary"),

  // Divergence (Step 4)
  divergenceQuestion: text("divergence_question"),
  divergenceVanillaResponse: text("divergence_vanilla_response"),

  // Quality Evaluation (Step 5)
  qualityScoreRaw: integer("quality_score_raw"),
  score: integer("score"),
  positionSummary: text("position_summary"),
  frameworkDependency: text("framework_dependency"),
  keyEvidence: jsonb("key_evidence"),
  vulnerabilityPoints: jsonb("vulnerability_points"),
  criteriaBreakdown: jsonb("criteria_breakdown"),
  rationale: text("rationale"),
  feedback: text("feedback"),

  // Antimemetic Assessment (Step 6)
  antimemeticAssessment: jsonb("antimemetic_assessment"),

  // Insight rankings for manual linking UI (pre-computed by dok4InsightRanker)
  insightRankings: jsonb("insight_rankings").$type<Record<string, number>>(),

  // Metadata
  evaluatorModel: text("evaluator_model"),
  gradedAt: timestamp("graded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  // Granular editing: stale tracking and version timestamps
  isStale: boolean("is_stale").default(false).notNull(),
  staleReason: text("stale_reason"),
  updatedAt: timestamp("updated_at"),
}, (table) => [
  index("idx_dok4_spovs_brainlift").on(table.brainliftId),
]);

// DOK4 -> DOK3 Links (many-to-many with primary designation)
export const dok4Dok3Links = pgTable("dok4_dok3_links", {
  id: serial("id").primaryKey(),
  spovId: integer("spov_id").notNull().references(() => dok4Spovs.id, { onDelete: "cascade" }),
  dok3InsightId: integer("dok3_insight_id").notNull().references(() => dok3Insights.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (table) => [
  unique("dok4_dok3_links_unique").on(table.spovId, table.dok3InsightId),
  index("idx_dok4_dok3_links_spov").on(table.spovId),
  index("idx_dok4_dok3_links_dok3").on(table.dok3InsightId),
]);

// DOK4 Relations
export const dok4SpovsRelations = relations(dok4Spovs, ({ one, many }) => ({
  brainlift: one(brainlifts, {
    fields: [dok4Spovs.brainliftId],
    references: [brainlifts.id],
  }),
  dok3Links: many(dok4Dok3Links),
}));

export const dok4Dok3LinksRelations = relations(dok4Dok3Links, ({ one }) => ({
  spov: one(dok4Spovs, {
    fields: [dok4Dok3Links.spovId],
    references: [dok4Spovs.id],
  }),
  dok3Insight: one(dok3Insights, {
    fields: [dok4Dok3Links.dok3InsightId],
    references: [dok3Insights.id],
  }),
}));

// === DOK ITEM VERSIONING ===

export const dokItemVersions = pgTable("dok_item_versions", {
  id: serial("id").primaryKey(),
  dokLevel: integer("dok_level").notNull(),        // 1, 2, 3, or 4
  itemId: integer("item_id").notNull(),             // ID in respective DOK table
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(), // 0 = original, 1+ = edits
  textContent: text("text_content").notNull(),       // snapshot of text at this version
  score: integer("score"),                           // score at time of version creation
  feedback: text("feedback"),                        // LLM feedback at time of version
  diagnosis: text("diagnosis"),                      // LLM diagnosis (DOK2 only)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("dok_item_versions_unique").on(table.dokLevel, table.itemId, table.versionNumber),
  index("idx_dok_item_versions_brainlift").on(table.brainliftId),
]);

// === NATIVE BUILDER TABLES ===

// Builder phase status types
export type BuilderPhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'locked';
export type BuilderSuggestionStatus = 'queued' | 'ready' | 'failed';

export type NativePhaseProgress = {
  phase1: BuilderPhaseStatus;
  phase2: BuilderPhaseStatus;
  phase3: BuilderPhaseStatus;
  phase4: BuilderPhaseStatus;
  phase5: BuilderPhaseStatus;
};

// Native brainlift builder-specific details (1:1 with brainlifts where sourceType='native')
export const nativeBrainliftDetails = pgTable("native_brainlift_details", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id")
    .notNull()
    .references(() => brainlifts.id, { onDelete: "cascade" })
    .unique(),
  phaseProgress: jsonb("phase_progress")
    .$type<NativePhaseProgress>()
    .notNull()
    .default({
      phase1: "complete",
      phase2: "in_progress",
      phase3: "locked",
      phase4: "locked",
      phase5: "locked",
    }),
  lastActivePhase: integer("last_active_phase").notNull().default(2),
  suggestionStatus: text("suggestion_status")
    .$type<BuilderSuggestionStatus>()
    .notNull()
    .default("queued"),
  suggestionError: text("suggestion_error"),
  // Builder Phase 3: celebration acknowledgement (one-time modal)
  phase3CelebratedAt: timestamp("phase3_celebrated_at"),
  // Builder Phase 3: AI category suggestion state
  categorySuggestion: jsonb("category_suggestion").$type<CategorySuggestionState | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("native_brainlift_details_brainlift_id_idx").on(table.brainliftId),
]);

// Builder experts - suggested and manually added experts for native brainlifts
export const builderExperts = pgTable("builder_experts", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id")
    .notNull()
    .references(() => brainlifts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  who: text("who").notNull(),
  focus: text("focus"),
  why: text("why"),
  where: text("where").notNull(),
  origin: text("origin").$type<'suggested' | 'manual'>().notNull(),
  status: text("status").$type<'pending' | 'saved' | 'dismissed'>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("builder_experts_brainlift_id_idx").on(table.brainliftId),
]);

// Native Builder Relations
export const nativeBrainliftDetailsRelations = relations(nativeBrainliftDetails, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [nativeBrainliftDetails.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const builderExpertsRelations = relations(builderExperts, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [builderExperts.brainliftId],
    references: [brainlifts.id],
  }),
}));

// === IMPORT AGENT TABLES ===

// Import Agent Phase enum
export const IMPORT_PHASE = {
  INIT: 'init',
  SOURCES: 'sources',
  DOK1: 'dok1',
  DOK2: 'dok2',
  DOK3: 'dok3',
  DOK3_LINKING: 'dok3_linking',
  FINAL: 'final',
} as const;

export type ImportPhase = typeof IMPORT_PHASE[keyof typeof IMPORT_PHASE];

// Import Status enum (on brainlifts table)
export const IMPORT_STATUS = {
  PENDING: 'pending',
  COMPLETE: 'complete',
} as const;

export type ImportStatus = typeof IMPORT_STATUS[keyof typeof IMPORT_STATUS];

// Source curation status
export const SOURCE_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SCRATCHPADDED: 'scratchpadded',
} as const;

export type SourceStatus = typeof SOURCE_STATUS[keyof typeof SOURCE_STATUS];

// Import Agent Conversations - persists agent chat history across sessions
export const importAgentConversations = pgTable("import_agent_conversations", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  messages: jsonb("messages").notNull().default([]),
  currentPhase: text("current_phase").$type<ImportPhase>().notNull().default('init'),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("unique_brainlift_conversation").on(table.brainliftId),
]);

// Brainlift Sources - URLs/references curated during import
export const brainliftSources = pgTable("brainlift_sources", {
  id: serial("id").primaryKey(),
  brainliftId: integer("brainlift_id").notNull().references(() => brainlifts.id, { onDelete: "cascade" }),
  url: text("url"),
  name: text("name"),
  category: text("category"),
  surroundingContext: text("surrounding_context"),
  status: text("status").$type<SourceStatus>().notNull().default('pending'),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_brainlift_sources_brainlift").on(table.brainliftId),
  unique("uq_brainlift_sources_url").on(table.brainliftId, table.url),
]);

// Import Agent Relations
export const importAgentConversationsRelations = relations(importAgentConversations, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [importAgentConversations.brainliftId],
    references: [brainlifts.id],
  }),
}));

export const brainliftSourcesRelations = relations(brainliftSources, ({ one }) => ({
  brainlift: one(brainlifts, {
    fields: [brainliftSources.brainliftId],
    references: [brainlifts.id],
  }),
}));

// === NATIVE CHAT TABLES ===

export interface StoredChatMessage {
  id: string;
  role: string;
  parts: unknown[];
  metadata?: unknown;
}

export interface ChatActivePlanTask {
  id: number;
  title: string;
  weekNumber: number;
  isFlagship: boolean;
  scheduledDate: string;
}

export interface ChatActivePlanSnapshot {
  brainliftSlug: string;
  brainliftTitle: string;
  planId: number;
  todayTasks: ChatActivePlanTask[];
  overdueTasks: ChatActivePlanTask[];
}

export interface ChatUserContext {
  userId: string;
  userName: string | null;
  isAdmin: boolean;
  brainliftCount: number;
  recentBrainlifts: Array<{
    slug: string;
    title: string;
    updatedAt: Date;
    permission: 'owner' | 'editor' | 'viewer';
  }>;
  recentConversations: Array<{
    id: number;
    title: string;
    lastActivityAt: Date;
  }>;
  activePlans: ChatActivePlanSnapshot[];
}

export const chatConversations = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
  lastMessageAt: timestamp("last_message_at"),
}, (table) => [
  index("chat_conversations_user_updated_idx").on(table.userId, table.updatedAt),
]);

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  messageId: text("message_id").notNull(),
  role: text("role").notNull(),
  parts: jsonb("parts").$type<StoredChatMessage["parts"]>().notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  unique("chat_messages_conversation_message_unique").on(table.conversationId, table.messageId),
  index("chat_messages_conversation_id_idx").on(table.conversationId, table.id),
]);

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  user: one(user, {
    fields: [chatConversations.userId],
    references: [user.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

export const graderMonitoringSetsRelations = relations(graderMonitoringSets, ({ one, many }) => ({
  createdBy: one(user, {
    fields: [graderMonitoringSets.createdByUserId],
    references: [user.id],
  }),
  frozenBrainlifts: many(graderMonitoringBrainlifts),
  runs: many(graderMonitoringRuns),
}));

export const graderMonitoringBrainliftsRelations = relations(graderMonitoringBrainlifts, ({ one }) => ({
  monitoringSet: one(graderMonitoringSets, {
    fields: [graderMonitoringBrainlifts.monitoringSetId],
    references: [graderMonitoringSets.id],
  }),
  sourceBrainlift: one(brainlifts, {
    fields: [graderMonitoringBrainlifts.sourceBrainliftId],
    references: [brainlifts.id],
  }),
}));

export const graderMonitoringRunsRelations = relations(graderMonitoringRuns, ({ one, many }) => ({
  monitoringSet: one(graderMonitoringSets, {
    fields: [graderMonitoringRuns.monitoringSetId],
    references: [graderMonitoringSets.id],
  }),
  passResults: many(graderMonitoringPassResults),
}));

export const graderMonitoringPassResultsRelations = relations(graderMonitoringPassResults, ({ one }) => ({
  run: one(graderMonitoringRuns, {
    fields: [graderMonitoringPassResults.runId],
    references: [graderMonitoringRuns.id],
  }),
}));

// === SCHEMAS ===

export const insertBrainliftSchema = createInsertSchema(brainlifts);
export const insertFactSchema = createInsertSchema(facts).omit({ id: true });
export const insertContradictionClusterSchema = createInsertSchema(contradictionClusters).omit({ id: true });
export const insertBrainliftVersionSchema = createInsertSchema(brainliftVersions).omit({ id: true, createdAt: true });
export const insertExpertSchema = createInsertSchema(experts).omit({ id: true });
export const insertFactVerificationSchema = createInsertSchema(factVerifications).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFactModelScoreSchema = createInsertSchema(factModelScores).omit({ id: true });
export const insertLlmFeedbackSchema = createInsertSchema(llmFeedback).omit({ id: true, createdAt: true });
export const insertModelAccuracyStatsSchema = createInsertSchema(modelAccuracyStats).omit({ id: true, lastUpdated: true });
export const insertFactRedundancyGroupSchema = createInsertSchema(factRedundancyGroups).omit({ id: true, createdAt: true });
export const insertDok2SummarySchema = createInsertSchema(dok2Summaries).omit({ id: true, createdAt: true });
export const insertDok2PointSchema = createInsertSchema(dok2Points).omit({ id: true });
export const insertDok2FactRelationSchema = createInsertSchema(dok2FactRelations).omit({ id: true });
export const insertDok3InsightSchema = createInsertSchema(dok3Insights).omit({ id: true, createdAt: true });
export const insertDok3InsightLinkSchema = createInsertSchema(dok3InsightLinks).omit({ id: true });
export const insertBrainliftShareSchema = createInsertSchema(brainliftShares).omit({ id: true, createdAt: true });
export const insertSkillSchema = createInsertSchema(skills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastEditedAt: true,
  deletedAt: true,
});
export const insertSkillResourceSchema = createInsertSchema(skillResources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSkillShareSchema = createInsertSchema(skillShares).omit({ id: true, createdAt: true });
export const insertSkillUserDisabledSchema = createInsertSchema(skillUserDisabled).omit({ disabledAt: true });
export const insertPlanSchema = createInsertSchema(plans).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export const insertDeliverableSchema = createInsertSchema(deliverables).omit({ id: true, createdAt: true });
export const insertPlatformConfigSchema = createInsertSchema(platformConfig).omit({ updatedAt: true });
export const insertLearningStreamItemSchema = createInsertSchema(learningStreamItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true });
export const insertImportAgentConversationSchema = createInsertSchema(importAgentConversations).omit({ id: true, updatedAt: true });
export const insertBrainliftSourceSchema = createInsertSchema(brainliftSources).omit({ id: true, createdAt: true });
export const insertDok4SpovSchema = createInsertSchema(dok4Spovs).omit({ id: true, createdAt: true });
export const insertDok4Dok3LinkSchema = createInsertSchema(dok4Dok3Links).omit({ id: true });
export const insertDokItemVersionSchema = createInsertSchema(dokItemVersions).omit({ id: true, createdAt: true });
export const insertNativeBrainliftDetailsSchema = createInsertSchema(nativeBrainliftDetails).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBuilderExpertSchema = createInsertSchema(builderExperts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGraderMonitoringSetSchema = createInsertSchema(graderMonitoringSets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGraderMonitoringBrainliftSchema = createInsertSchema(graderMonitoringBrainlifts).omit({ id: true, createdAt: true });
export const insertGraderMonitoringRunSchema = createInsertSchema(graderMonitoringRuns).omit({ id: true, createdAt: true });
export const insertGraderMonitoringPassResultSchema = createInsertSchema(graderMonitoringPassResults).omit({ id: true, createdAt: true });

// === TYPES ===

// Auth types
export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;

export type Brainlift = typeof brainlifts.$inferSelect;
export type InsertBrainlift = z.infer<typeof insertBrainliftSchema>;

export type Fact = typeof facts.$inferSelect;
export type ContradictionCluster = typeof contradictionClusters.$inferSelect;
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
export type BrainliftScoreLog = typeof brainliftScoreLog.$inferSelect;
export type BrainliftScoreSummary = typeof brainliftScoreSummary.$inferSelect;
export type QABatch = typeof qaBatches.$inferSelect;
export type VerificationTruthSet = typeof verificationTruthSet.$inferSelect;
export type GraderMonitoringSet = typeof graderMonitoringSets.$inferSelect;
export type InsertGraderMonitoringSet = z.infer<typeof insertGraderMonitoringSetSchema>;
export type GraderMonitoringBrainlift = typeof graderMonitoringBrainlifts.$inferSelect;
export type InsertGraderMonitoringBrainlift = z.infer<typeof insertGraderMonitoringBrainliftSchema>;
export type GraderMonitoringRun = typeof graderMonitoringRuns.$inferSelect;
export type InsertGraderMonitoringRun = z.infer<typeof insertGraderMonitoringRunSchema>;
export type GraderMonitoringPassResult = typeof graderMonitoringPassResults.$inferSelect;
export type InsertGraderMonitoringPassResult = z.infer<typeof insertGraderMonitoringPassResultSchema>;
export type Dok2Summary = typeof dok2Summaries.$inferSelect;
export type InsertDok2Summary = z.infer<typeof insertDok2SummarySchema>;
export type Dok2Point = typeof dok2Points.$inferSelect;
export type InsertDok2Point = z.infer<typeof insertDok2PointSchema>;
export type Dok2FactRelation = typeof dok2FactRelations.$inferSelect;
export type InsertDok2FactRelation = z.infer<typeof insertDok2FactRelationSchema>;
export type DOK3Insight = typeof dok3Insights.$inferSelect;
export type InsertDOK3Insight = z.infer<typeof insertDok3InsightSchema>;
export type DOK3InsightLink = typeof dok3InsightLinks.$inferSelect;
export type InsertDOK3InsightLink = z.infer<typeof insertDok3InsightLinkSchema>;
export type BrainliftShare = typeof brainliftShares.$inferSelect;
export type InsertBrainliftShare = z.infer<typeof insertBrainliftShareSchema>;
export type Skill = typeof skills.$inferSelect;
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type SkillResource = typeof skillResources.$inferSelect;
export type InsertSkillResource = z.infer<typeof insertSkillResourceSchema>;
export type SkillShare = typeof skillShares.$inferSelect;
export type InsertSkillShare = z.infer<typeof insertSkillShareSchema>;
export type SkillUserDisabled = typeof skillUserDisabled.$inferSelect;
export type InsertSkillUserDisabled = z.infer<typeof insertSkillUserDisabledSchema>;
export type SprintPlan = typeof plans.$inferSelect;
export type InsertSprintPlan = z.infer<typeof insertPlanSchema>;
export type SprintTask = typeof tasks.$inferSelect;
export type InsertSprintTask = z.infer<typeof insertTaskSchema>;
export type Deliverable = typeof deliverables.$inferSelect;
export type InsertDeliverable = z.infer<typeof insertDeliverableSchema>;
export type PlatformConfig = typeof platformConfig.$inferSelect;
export type InsertPlatformConfig = z.infer<typeof insertPlatformConfigSchema>;
export type InsertLearningStreamItem = z.infer<typeof insertLearningStreamItemSchema>;
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type ImportAgentConversation = typeof importAgentConversations.$inferSelect;
export type InsertImportAgentConversation = z.infer<typeof insertImportAgentConversationSchema>;
export type BrainliftSource = typeof brainliftSources.$inferSelect;
export type InsertBrainliftSource = z.infer<typeof insertBrainliftSourceSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type DOK4Spov = typeof dok4Spovs.$inferSelect;
export type InsertDOK4Spov = z.infer<typeof insertDok4SpovSchema>;
export type DOK4Dok3Link = typeof dok4Dok3Links.$inferSelect;
export type InsertDOK4Dok3Link = z.infer<typeof insertDok4Dok3LinkSchema>;
export type DokItemVersion = typeof dokItemVersions.$inferSelect;
export type InsertDokItemVersion = z.infer<typeof insertDokItemVersionSchema>;
export type NativeBrainliftDetails = typeof nativeBrainliftDetails.$inferSelect;
export type InsertNativeBrainliftDetails = z.infer<typeof insertNativeBrainliftDetailsSchema>;
export type BuilderExpert = typeof builderExperts.$inferSelect;
export type InsertBuilderExpert = z.infer<typeof insertBuilderExpertSchema>;

// Full brainlift data with nested relations (for API response)
export interface BrainliftData extends Brainlift {
  facts: Fact[];
  contradictionClusters: ContradictionCluster[];
  experts: Expert[];
  userPermission?: 'owner' | 'editor' | 'viewer' | null;
  dok2Summaries?: Array<{
    id: number;
    category: string;
    sourceName: string;
    sourceUrl: string | null;
    displayTitle: string | null;
    points: Array<{ id: number; text: string; sortOrder: number }>;
    relatedFactIds: number[];
    // DOK2 Grading fields
    grade: number | null;
    diagnosis: string | null;
    feedback: string | null;
    failReason: DOK2FailReason | null;
    sourceVerified: boolean | null;
  }>;
}

// Fact with verification data for API response
export interface FactWithVerification extends Fact {
  verification?: FactVerification & {
    modelScores: FactModelScore[];
  };
}

// === AUTHORIZATION ===

export const USER_ROLES = {
  USER: "user",
  ADMIN: "admin",
  // GUIDE: "guide", // Future: Guide role for accessing students' data
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export interface AuthContext {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
}

// === SERVICE API KEYS ===

export const apiKeys = pgTable(
  "api_keys",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    rateLimit: integer("rate_limit").default(60),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [index("api_keys_key_idx").on(table.key)],
);

export type ApiKey = typeof apiKeys.$inferSelect;
