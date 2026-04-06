import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import { withJob } from '../utils/withJob';
import { createVersion, pruneVersions } from '../storage/versions';
import { propagateStaleFlags } from '../storage/stale';
import { recomputeBrainliftScore } from '../services/brainlift';
import type { PreviousEvaluation } from '@shared/types/regrading';

export const dok2CrudRouter = Router();

/**
 * POST /api/brainlifts/:slug/dok2-summaries
 * Create a new DOK2 summary with points and optional fact relations.
 * Queues grading job (fire-and-forget).
 */
dok2CrudRouter.post(
  '/api/brainlifts/:slug/dok2-summaries',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { sourceName, sourceUrl, points, relatedFactIds } = req.body;

    if (!sourceName || typeof sourceName !== 'string' || sourceName.trim().length === 0) {
      throw new BadRequestError('sourceName is required and must be a non-empty string');
    }
    if (!Array.isArray(points) || points.length === 0) {
      throw new BadRequestError('points must be a non-empty array of strings');
    }
    if (!points.every((p: unknown) => typeof p === 'string' && (p as string).trim().length > 0)) {
      throw new BadRequestError('All points must be non-empty strings');
    }

    const brainliftId = req.brainlift!.id;
    const trimmedPoints = points.map((p: string) => p.trim());

    // Validate relatedFactIds belong to this brainlift
    const factIds: number[] = Array.isArray(relatedFactIds) ? relatedFactIds : [];
    if (factIds.length > 0) {
      if (!factIds.every((id: unknown) => typeof id === 'number' && Number.isInteger(id))) {
        throw new BadRequestError('relatedFactIds must contain only integers');
      }
      // Verify all fact IDs belong to this brainlift
      for (const factId of factIds) {
        const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
        if (!fact) {
          throw new BadRequestError(`Fact ID ${factId} not found in this brainlift`);
        }
      }
    }

    const result = await storage.createDok2Summary({
      brainliftId,
      sourceName: sourceName.trim(),
      sourceUrl: sourceUrl?.trim() || undefined,
      points: trimmedPoints,
      relatedFactIds: factIds,
    });

    // Queue grading job (fire-and-forget)
    await withJob('dok2:grade-single')
      .forPayload({ summaryId: result.id, brainliftId })
      .queue();

    res.status(201).json({ id: result.id, status: 'grading' });
  })
);

/**
 * PATCH /api/brainlifts/:slug/dok2-summaries/:summaryId
 * Edit a DOK2 summary's points. Creates version, propagates stale, queues regrade.
 */
dok2CrudRouter.patch(
  '/api/brainlifts/:slug/dok2-summaries/:summaryId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const summaryId = parseInt(req.params.summaryId);
    if (isNaN(summaryId)) throw new BadRequestError('Invalid summary ID');

    const { points } = req.body;
    if (!Array.isArray(points) || points.length === 0) {
      throw new BadRequestError('points must be a non-empty array of strings');
    }
    if (!points.every((p: unknown) => typeof p === 'string' && p.trim().length > 0)) {
      throw new BadRequestError('All points must be non-empty strings');
    }

    const brainliftId = req.brainlift!.id;
    const trimmedPoints = points.map((p: string) => p.trim());

    // Edit summary (returns previous state)
    const editResult = await storage.editDok2Summary(summaryId, brainliftId, trimmedPoints);
    if (!editResult) throw new NotFoundError('DOK2 summary not found');

    // Create version snapshot (text = joined points)
    await createVersion({
      dokLevel: 2,
      itemId: summaryId,
      brainliftId,
      textContent: editResult.previousPoints.join('\n'),
      score: editResult.previousScore,
      feedback: editResult.previousFeedback,
    });

    // Propagate stale flags
    await propagateStaleFlags({
      dokLevel: 2,
      itemId: summaryId,
      brainliftId,
      reason: `DOK2 summary ${summaryId} edited`,
    });

    // Prune old versions
    await pruneVersions(2, summaryId);

    // Build previous evaluation context
    const previousEvaluation: PreviousEvaluation = {
      previousScore: editResult.previousScore ?? 0,
      previousFeedback: editResult.previousFeedback ?? '',
      oldText: editResult.previousPoints.join('\n'),
      newText: trimmedPoints.join('\n'),
      editNumber: 1,
    };

    // Queue regrade job
    await withJob('dok2:regrade')
      .forPayload({ summaryId, brainliftId, previousEvaluation })
      .queue();

    res.json({
      id: summaryId,
      status: 'regrading',
      previousScore: editResult.previousScore,
    });
  })
);

/**
 * DELETE /api/brainlifts/:slug/dok2-summaries/:summaryId
 * Delete a DOK2 summary. Supports ?preview=true for impact preview.
 */
dok2CrudRouter.delete(
  '/api/brainlifts/:slug/dok2-summaries/:summaryId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const summaryId = parseInt(req.params.summaryId);
    if (isNaN(summaryId)) throw new BadRequestError('Invalid summary ID');

    const brainliftId = req.brainlift!.id;

    // Preview mode
    if (req.query.preview === 'true') {
      const impact = await storage.getDok2DeleteImpact(summaryId, brainliftId);
      if (!impact) throw new NotFoundError('DOK2 summary not found');
      return res.json(impact);
    }

    // Actual delete
    const result = await storage.deleteDok2Summary(summaryId, brainliftId);
    if (!result) throw new NotFoundError('DOK2 summary not found');

    // Recompute brainlift score
    await recomputeBrainliftScore(brainliftId);

    res.json(result);
  })
);
