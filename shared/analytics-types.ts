export const ANALYTICS_ORIGINS = ['ui', 'mcp', 'builder', 'seed'] as const;
export type AnalyticsOrigin = typeof ANALYTICS_ORIGINS[number];

export const SCORE_EVENT_TRIGGERS = ['import', 'pipeline', 'grade', 'regrade', 'delete'] as const;
export type ScoreEventTrigger = typeof SCORE_EVENT_TRIGGERS[number];

export interface ScoreEventContext {
  brainliftId: number;
  trigger: ScoreEventTrigger;
  dokLevel?: 1 | 2 | 3 | 4;
  itemId?: number;
}

export interface FactVerificationEvidenceInput {
  url: string | null;
  content: string | null;
  error: string | null;
  fetchedAt: Date;
}

export interface FactVerificationModelResultInput {
  model: string;
  score: number | null;
  rationale: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error: string | null;
}

export interface FactVerificationConsensusInput {
  consensusScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  needsReview: boolean;
  verificationNotes: string;
  isNonGradeable?: boolean;
}

export interface PersistFactVerificationInput {
  factId: number;
  evidence: FactVerificationEvidenceInput;
  verification: {
    modelResults: FactVerificationModelResultInput[];
    consensus: FactVerificationConsensusInput;
  };
}

export interface AnalyticsDateFilter {
  from?: string;
  to?: string;
}

export type AnalyticsDokLevel = 1 | 2 | 3 | 4;
export type AnalyticsDokLevelFilter = AnalyticsDokLevel | 'all';

export interface VolumeFilters extends AnalyticsDateFilter {
  userId?: string;
  dokLevel?: AnalyticsDokLevelFilter;
  origin?: AnalyticsOrigin | 'all';
}

export interface ScoreDistributionFilters extends AnalyticsDateFilter {
  dokLevel?: AnalyticsDokLevelFilter;
}

export interface VolumeBucketRow {
  bucket: string;
  brainlifts: number;
  facts: number;
  dok2Summaries: number;
  dok3Insights: number;
  dok4Spovs: number;
  gradingEvents: number;
}

export interface VolumeResponse {
  totals: {
    brainlifts: number;
    facts: number;
    dok2Summaries: number;
    dok3Insights: number;
    dok4Spovs: number;
    gradingEvents: number;
  };
  series: VolumeBucketRow[];
}

export interface HumanVerificationMetricSummary {
  scoreStabilityRate: number;
  changedCount: number;
  agreeChangedCount: number;
  borderlineChangedCount: number;
  disagreeChangedCount: number;
}

export interface HumanVerificationResponse {
  hasData: boolean;
  baseline: {
    weightedAgreement: number;
    totalItems: number;
  } | null;
  latestBatch: {
    id: number;
    completedAt: string;
    metrics: HumanVerificationMetricSummary;
  } | null;
  trend: Array<{
    batchId: number;
    completedAt: string;
    scoreStabilityRate: number;
  }>;
}

export interface VanillaComparisonRow {
  id: number;
  brainliftId: number;
  brainliftSlug: string;
  brainliftTitle: string;
  score: number | null;
  scoreTier: 1 | 2 | 3 | 4 | 5 | 'rejected';
  text: string;
  divergenceQuestion: string | null;
  divergenceVanillaResponse: string | null;
  gradedAt: string | null;
}

export interface VanillaComparisonResponse {
  hasData: boolean;
  items: VanillaComparisonRow[];
}

export interface SpovDistributionResponse {
  hasData: boolean;
  totals: {
    total: number;
    graded: number;
    rejected: number;
    pending: number;
    error: number;
    linked: number;
    averageScore: number | null;
  };
  buckets: Array<{
    label: string;
    count: number;
    averageScore: number | null;
  }>;
}

export interface DokCliffLevelRow {
  dokLevel: 1 | 2 | 3 | 4;
  label: 'DOK1' | 'DOK2' | 'DOK3' | 'DOK4';
  averageScore: number | null;
  brainliftCount: number;
}

export interface DokCliffResponse {
  hasData: boolean;
  rows: DokCliffLevelRow[];
  summary: {
    totalBrainlifts: number;
    dok1Average: number | null;
    dok4Average: number | null;
    cliffDrop: number | null;
  };
}

export interface ScoreDistributionBucket {
  score: 1 | 2 | 3 | 4 | 5;
  label: '1' | '2' | '3' | '4' | '5';
  count: number;
  share: number;
}

export interface ScoreDistributionResponse {
  hasData: boolean;
  buckets: ScoreDistributionBucket[];
  totals: {
    totalScoredItems: number;
    averageScore: number | null;
    modalScore: 1 | 2 | 3 | 4 | 5 | null;
    distinctScores: number;
  };
}

export interface ScoreImprovementRow {
  brainliftId: number;
  brainliftSlug: string;
  brainliftTitle: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  origin: AnalyticsOrigin | null;
  firstScore: number;
  latestScore: number;
  delta: number;
  totalEvents: number;
  totalWindows: number;
  latestRecordedAt: string;
}

export interface ScoreImprovementResponse {
  hasData: boolean;
  rows: ScoreImprovementRow[];
  summary: {
    totalBrainlifts: number;
    improving: number;
    declining: number;
    averageDelta: number;
  };
}

export interface BrainliftScoreHistoryPoint {
  recordedAt: string;
  score: number;
  kind: 'baseline' | 'window_end';
}

export interface BrainliftScoreHistoryResponse {
  hasData: boolean;
  points: BrainliftScoreHistoryPoint[];
}

export type LeaderboardRankBy = 'brainlifts' | 'edits' | 'quality' | 'dok1' | 'dok2' | 'dok3' | 'dok4';

export interface LeaderboardRow {
  userId: string;
  userName: string;
  userEmail: string;
  value: number;
  secondaryValue?: number;
}

export interface LeaderboardResponse {
  rankBy: LeaderboardRankBy;
  rows: LeaderboardRow[];
}

export const QABATCH_TYPES = ['verification'] as const;
export type QABatchType = typeof QABATCH_TYPES[number];

export const QABATCH_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type QABatchStatus = typeof QABATCH_STATUSES[number];

export interface QABatchRow {
  id: number;
  type: QABatchType;
  status: QABatchStatus;
  isBaseline: boolean;
  baselineBatchId: number | null;
  sampleCount: number;
  metrics: Record<string, unknown> | null;
  artifactLabel: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface BrainliftScoreLogRow {
  brainliftId: number;
  ownerUserId: string | null;
  origin: AnalyticsOrigin | null;
  windowStartedAt: string;
  lastEventAt: string;
  eventCount: number;
  triggerSet: ScoreEventTrigger[];
  startOverallScore: number;
  endOverallScore: number;
  peakOverallScore: number;
  troughOverallScore: number;
  startFactCount: number;
  endFactCount: number;
}

export interface BrainliftScoreSummaryRow {
  brainliftId: number;
  firstScore: number;
  firstRecordedAt: string;
  latestScore: number;
  latestRecordedAt: string;
  peakScore: number;
  peakRecordedAt: string;
  totalEvents: number;
  totalWindows: number;
}

export interface VerificationTruthContext {
  dokLevel: 1 | 2;
  fact?: string;
  source?: string | null;
  points?: string[];
  sourceName?: string;
  sourceUrl?: string | null;
  relatedFacts?: Array<{
    fact: string;
    source: string | null;
  }>;
  purpose?: string;
}

export interface VerificationTruthImportRow {
  assetKey: string;
  dokLevel: 1 | 2;
  stableKey: string;
  frozenContext: VerificationTruthContext;
  aiScore: number | null;
  humanScore: number | null;
  metadata: Record<string, unknown> | null;
}

export interface RunVerificationBatchJobPayload {
  batchType: 'verification';
}

export interface VerificationTruthSetRow {
  batchId: number;
  assetKey: string;
  dokLevel: 0 | 1 | 2 | 3 | 4;
  stableKey: string;
  frozenContext: Record<string, unknown>;
  aiScore: number | null;
  humanScore: number | null;
  metadata: Record<string, unknown> | null;
}

export const GRADER_MONITORING_TIMEZONES = ['America/Sao_Paulo'] as const;
export type GraderMonitoringTimezone = typeof GRADER_MONITORING_TIMEZONES[number];

export const DRIFT_REPRESENTATIVES = ['pass1', 'pass2', 'mean'] as const;
export type DriftRepresentative = typeof DRIFT_REPRESENTATIVES[number];

export const WEEKLY_CONSISTENCY_TRIGGER_KINDS = ['cron', 'manual'] as const;
export type WeeklyConsistencyTriggerKind = typeof WEEKLY_CONSISTENCY_TRIGGER_KINDS[number];

export const WEEKLY_CONSISTENCY_RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type WeeklyConsistencyRunStatus = typeof WEEKLY_CONSISTENCY_RUN_STATUSES[number];

export const WEEKLY_RESULT_LEVELS = ['brainlift', 'dok1', 'dok2', 'dok3', 'dok4'] as const;
export type WeeklyResultLevel = typeof WEEKLY_RESULT_LEVELS[number];

export interface FrozenSourceEvidence {
  sourceUrl: string;
  sourceName: string | null;
  content: string;
  fetchedAt: string;
}

export interface FrozenDok1Fact {
  stableKey: string;
  sourceFactId: number | null;
  fact: string;
  sourceLabel: string | null;
  sourceUrl: string;
  evidenceContent: string;
  baselineScore: number | null;
}

export interface FrozenDok2Summary {
  stableKey: string;
  sourceSummaryId: number | null;
  sourceName: string;
  sourceUrl: string | null;
  points: string[];
  relatedDok1Keys: string[];
  baselineScore: number | null;
}

export interface FrozenDok3Insight {
  stableKey: string;
  sourceInsightId: number | null;
  text: string;
  linkedDok2Keys: string[];
  baselineScore: number | null;
}

export interface FrozenDok4Spov {
  stableKey: string;
  sourceSpovId: number | null;
  text: string;
  linkedDok3Keys: string[];
  primaryDok3Key: string | null;
  baselineScore: number | null;
}

export interface FrozenBrainliftSnapshot {
  monitoringSetId: number;
  snapshotVersion: number;
  sourceBrainliftId: number;
  sourceSlug: string;
  title: string;
  purpose: string;
  frozenOverallScore: number;
  sourceEvidence: FrozenSourceEvidence[];
  dok1Facts: FrozenDok1Fact[];
  dok2Summaries: FrozenDok2Summary[];
  dok3Insights: FrozenDok3Insight[];
  dok4Spovs: FrozenDok4Spov[];
  frozenAt: string;
}

export interface GraderMonitoringSetRow {
  id: number;
  monitoredSlugs: string[];
  scheduleTimezone: GraderMonitoringTimezone;
  driftRepresentative: DriftRepresentative;
  snapshotVersion: number;
  active: boolean;
  frozenAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyConsistencyMetrics {
  overallPearsonR: number | null;
  brainliftPearsonR: number | null;
  byDokLevel: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number | null>>;
  comparableCoverage: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number>>;
  monitoredBrainlifts: number;
}

export interface WeeklyModelDriftMetrics {
  representativePass: 1;
  comparedToWeekStart: string | null;
  overallBrainliftDelta: number | null;
  byDokLevel: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number | null>>;
}

export interface WeeklyConsistencyRunRow {
  id: number;
  monitoringSetId: number;
  snapshotVersion: number;
  weekStart: string;
  timezone: GraderMonitoringTimezone;
  triggerKind: WeeklyConsistencyTriggerKind;
  status: WeeklyConsistencyRunStatus;
  representativePass: 1;
  metrics: WeeklyConsistencyMetrics | null;
  driftMetrics: WeeklyModelDriftMetrics | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WeeklyConsistencyResultRow {
  runId: number;
  passNumber: 1 | 2;
  brainliftStableKey: string;
  level: WeeklyResultLevel;
  stableKey: string;
  score: number | null;
  metadata: Record<string, unknown> | null;
}

export interface FreezeGraderMonitoringSetInput {
  slugs: string[];
  createdByUserId?: string | null;
}

export interface FreezeGraderMonitoringSetResponse {
  set: GraderMonitoringSetRow;
  frozenBrainlifts: number;
}

export interface RunWeeklyConsistencyJobPayload {
  monitoringSetId?: number;
  triggerKind: WeeklyConsistencyTriggerKind;
  requestedByUserId?: string | null;
}

export interface GraderConsistencyResponse {
  hasData: boolean;
  latestRun: {
    weekStart: string;
    completedAt: string;
    overallPearsonR: number | null;
    brainliftPearsonR: number | null;
    byDokLevel: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number | null>>;
    comparableCoverage: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number>>;
    monitoredBrainlifts: number;
  } | null;
  trend: Array<{
    weekStart: string;
    completedAt: string;
    overallPearsonR: number | null;
    brainliftPearsonR: number | null;
  }>;
}

export interface ModelDriftResponse {
  hasData: boolean;
  latestRun: {
    weekStart: string;
    completedAt: string;
    comparedToWeekStart: string | null;
    comparedToCompletedAt: string | null;
    representativePass: 1;
    overallBrainliftDelta: number | null;
    byDokLevel: Partial<Record<'dok1' | 'dok2' | 'dok3' | 'dok4', number | null>>;
  } | null;
  trend: Array<{
    weekStart: string;
    completedAt: string;
    overallBrainliftDelta: number | null;
    dok1Delta: number | null;
    dok2Delta: number | null;
    dok3Delta: number | null;
    dok4Delta: number | null;
  }>;
}
