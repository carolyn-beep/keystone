import { Router } from 'express';
import { z } from 'zod';
import { storage } from '../storage';
import { getModelDisplayName } from '../ai/client/registry';
import { requireAdmin } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { withJob } from '../utils/withJob';
import { createQABatch } from '../storage/qa-batches';
import { freezeGraderMonitoringSet } from '../services/freeze-grader-monitoring-set';
import type {
  AnalyticsDateFilter,
  AnalyticsDokLevel,
  AnalyticsOrigin,
  LeaderboardRankBy,
  FreezeGraderMonitoringSetInput,
  ScoreDistributionFilters,
  VolumeFilters,
} from '@shared/analytics-types';
import { ANALYTICS_ORIGINS } from '@shared/analytics-types';

export const analyticsRouter = Router();

const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const originSchema = z.union([z.literal('all'), z.enum(ANALYTICS_ORIGINS)]);
const dokLevelSchema = z.union([z.literal('all'), z.literal('1'), z.literal('2'), z.literal('3'), z.literal('4')]);
const rankBySchema = z.enum(['brainlifts', 'edits', 'quality', 'dok1', 'dok2', 'dok3', 'dok4']);

const analyticsDateSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const volumeQuerySchema = analyticsDateSchema.extend({
  userId: z.string().trim().optional(),
  dokLevel: dokLevelSchema.optional(),
  origin: originSchema.optional(),
});

const scoreDistributionQuerySchema = analyticsDateSchema.extend({
  dokLevel: dokLevelSchema.optional(),
});

const brainliftScoreHistoryQuerySchema = analyticsDateSchema.extend({
  brainliftId: z.coerce.number().int().positive(),
});

const leaderboardQuerySchema = analyticsDateSchema.extend({
  rankBy: rankBySchema,
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

const verificationTriggerSchema = z.object({
  baseline: z.boolean().optional(),
  artifactLabel: z.string().trim().optional(),
  sampleCount: z.coerce.number().int().min(0).optional(),
});

const graderMonitoringFreezeSchema = z.object({
  slugs: z.array(z.string().trim().min(1)).length(5),
});

function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new BadRequestError(result.error.issues[0]?.message ?? 'Invalid query parameters');
  }
  return result.data;
}

function parseVolumeFilters(query: unknown): VolumeFilters {
  const parsed = parseQuery(volumeQuerySchema, query);
  return {
    from: parsed.from,
    to: parsed.to,
    userId: parsed.userId,
    dokLevel: parsed.dokLevel ? (parsed.dokLevel === 'all' ? 'all' : Number(parsed.dokLevel) as 1 | 2 | 3 | 4) : undefined,
    origin: parsed.origin as AnalyticsOrigin | 'all' | undefined,
  };
}

function parseLeaderboardFilters(query: unknown): { from?: string; to?: string; rankBy: LeaderboardRankBy; limit?: number } {
  const parsed = parseQuery(leaderboardQuerySchema, query);
  return {
    from: parsed.from,
    to: parsed.to,
    rankBy: parsed.rankBy,
    limit: parsed.limit,
  };
}

function parseScoreDistributionFilters(query: unknown): ScoreDistributionFilters {
  const parsed = parseQuery(scoreDistributionQuerySchema, query);
  return {
    from: parsed.from,
    to: parsed.to,
    dokLevel: parsed.dokLevel
      ? (parsed.dokLevel === 'all' ? 'all' : Number(parsed.dokLevel) as AnalyticsDokLevel)
      : undefined,
  };
}

function parseBrainliftScoreHistoryFilters(query: unknown): AnalyticsDateFilter & { brainliftId: number } {
  const parsed = parseQuery(brainliftScoreHistoryQuerySchema, query);
  return {
    from: parsed.from,
    to: parsed.to,
    brainliftId: parsed.brainliftId,
  };
}

export async function modelAccuracyHandler(_req: any, res: any) {
  const stats = await storage.getModelAccuracyStats();
  const feedback = await storage.getLlmFeedbackHistory(50);

  const sortedStats = [...stats].sort((a, b) =>
    parseFloat(a.meanAbsoluteError) - parseFloat(b.meanAbsoluteError)
  );

  const modelAnalytics = sortedStats.map((stat, index) => {
    const mae = parseFloat(stat.meanAbsoluteError);
    let accuracyTier: 'excellent' | 'good' | 'fair' | 'poor';
    if (mae <= 0.5) accuracyTier = 'excellent';
    else if (mae <= 1.0) accuracyTier = 'good';
    else if (mae <= 1.5) accuracyTier = 'fair';
    else accuracyTier = 'poor';

    return {
      model: stat.model,
      modelName: getModelDisplayName(stat.model),
      totalSamples: stat.totalSamples,
      meanAbsoluteError: mae.toFixed(3),
      weight: parseFloat(stat.weight).toFixed(3),
      accuracyTier,
      rank: index + 1,
    };
  });

  const recentByModel: Record<string, { llmScore: number; humanScore: number; diff: number }[]> = {};
  for (const fb of feedback) {
    if (!recentByModel[fb.llmModel]) recentByModel[fb.llmModel] = [];
    recentByModel[fb.llmModel].push({
      llmScore: fb.llmScore,
      humanScore: fb.humanScore,
      diff: fb.scoreDifference,
    });
  }

  res.json({
    models: modelAnalytics,
    totalOverrides: stats.reduce((sum, s) => sum + s.totalSamples, 0),
    recentFeedback: recentByModel,
  });
}

export async function volumeHandler(req: any, res: any) {
  const filters = parseVolumeFilters(req.query);
  const payload = await storage.getVolumeAnalytics(filters);
  res.json(payload);
}

export async function humanVerificationHandler(req: any, res: any) {
  const payload = await storage.getHumanVerificationAnalytics({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  res.json(payload);
}

export async function vanillaComparisonHandler(req: any, res: any) {
  const payload = await storage.getVanillaComparisonAnalytics({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  res.json(payload);
}

export async function dokCliffHandler(req: any, res: any) {
  const payload = await storage.getDokCliffAnalytics({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  res.json(payload);
}

export async function scoreDistributionHandler(req: any, res: any) {
  const payload = await storage.getScoreDistributionAnalytics(parseScoreDistributionFilters(req.query));
  res.json(payload);
}

export async function spovDistributionHandler(req: any, res: any) {
  const payload = await storage.getSpovDistributionAnalytics({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  res.json(payload);
}

export async function scoreImprovementHandler(req: any, res: any) {
  const payload = await storage.getScoreImprovementAnalytics({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  res.json(payload);
}

export async function brainliftScoreHistoryHandler(req: any, res: any) {
  const payload = await storage.getBrainliftScoreHistoryAnalytics(parseBrainliftScoreHistoryFilters(req.query));
  res.json(payload);
}

export async function leaderboardHandler(req: any, res: any) {
  const filters = parseLeaderboardFilters(req.query);
  const payload = await storage.getLeaderboardAnalytics(filters);
  res.json(payload);
}

export async function graderConsistencyHandler(req: any, res: any) {
  const payload = await storage.getGraderConsistencyAnalytics();
  res.json(payload);
}

export async function modelDriftHandler(req: any, res: any) {
  const payload = await storage.getModelDriftAnalytics();
  res.json(payload);
}

export async function verificationTriggerHandler(req: any, res: any) {
  const parsed = verificationTriggerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid verification payload');
  }

  const batch = await createQABatch({
    type: 'verification',
    status: 'pending',
    isBaseline: parsed.data.baseline ?? false,
    artifactLabel: parsed.data.artifactLabel ?? null,
    sampleCount: parsed.data.sampleCount ?? 0,
  });

  const jobId = await withJob('analytics:run-verification-batch')
    .forPayload({ batchType: 'verification' })
    .queue();

  res.status(201).json({ batch, jobId });
}

export async function graderMonitoringFreezeHandler(req: any, res: any) {
  const parsed = graderMonitoringFreezeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid grader monitoring freeze payload');
  }

  const payload = await freezeGraderMonitoringSet({
    slugs: parsed.data.slugs,
    createdByUserId: req.user?.id ?? null,
  } satisfies FreezeGraderMonitoringSetInput);

  res.status(201).json(payload);
}

export async function graderMonitoringRunTriggerHandler(req: any, res: any) {
  const jobId = await withJob('analytics:run-weekly-grader-consistency')
    .forPayload({
      triggerKind: 'manual',
      requestedByUserId: req.user?.id ?? null,
    })
    .queue();

  res.status(202).json({ jobId });
}

analyticsRouter.get('/api/analytics/model-accuracy', requireAdmin, asyncHandler(modelAccuracyHandler));
analyticsRouter.get('/api/analytics/volume', requireAdmin, asyncHandler(volumeHandler));
analyticsRouter.get('/api/analytics/human-verification', requireAdmin, asyncHandler(humanVerificationHandler));
analyticsRouter.get('/api/analytics/grader-consistency', requireAdmin, asyncHandler(graderConsistencyHandler));
analyticsRouter.get('/api/analytics/model-drift', requireAdmin, asyncHandler(modelDriftHandler));
analyticsRouter.get('/api/analytics/vanilla-comparison', requireAdmin, asyncHandler(vanillaComparisonHandler));
analyticsRouter.get('/api/analytics/dok-cliff', requireAdmin, asyncHandler(dokCliffHandler));
analyticsRouter.get('/api/analytics/score-distribution', requireAdmin, asyncHandler(scoreDistributionHandler));
analyticsRouter.get('/api/analytics/spov-distribution', requireAdmin, asyncHandler(spovDistributionHandler));
analyticsRouter.get('/api/analytics/score-improvement', requireAdmin, asyncHandler(scoreImprovementHandler));
analyticsRouter.get('/api/analytics/brainlift-score-history', requireAdmin, asyncHandler(brainliftScoreHistoryHandler));
analyticsRouter.get('/api/analytics/leaderboard', requireAdmin, asyncHandler(leaderboardHandler));
analyticsRouter.post('/api/analytics/human-verification/run', requireAdmin, asyncHandler(verificationTriggerHandler));
analyticsRouter.post('/api/analytics/grader-consistency/freeze', requireAdmin, asyncHandler(graderMonitoringFreezeHandler));
analyticsRouter.post('/api/analytics/grader-consistency/run', requireAdmin, asyncHandler(graderMonitoringRunTriggerHandler));
