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

export const dok1CrudRouter = Router();

/**
 * POST /api/brainlifts/:slug/facts
 * Create a new DOK1 fact. Queues grading job (fire-and-forget).
 */
dok1CrudRouter.post(
  '/api/brainlifts/:slug/facts',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const { fact, source, category } = req.body;

    if (!fact || typeof fact !== 'string' || fact.trim().length === 0) {
      throw new BadRequestError('fact is required and must be a non-empty string');
    }
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new BadRequestError('source is required and must be a non-empty string');
    }

    const brainliftId = req.brainlift!.id;

    const result = await storage.createFact({
      brainliftId,
      fact: fact.trim(),
      source: source.trim(),
      category: category?.trim() || undefined,
    });

    // Queue grading job (fire-and-forget)
    await withJob('dok1:grade-single')
      .forPayload({ factId: result.id, brainliftId })
      .queue();

    res.status(201).json({ id: result.id, status: 'grading' });
  })
);

/**
 * PATCH /api/brainlifts/:slug/facts/:factId
 * Edit a DOK1 fact's text. Creates version, propagates stale, queues regrade.
 */
dok1CrudRouter.patch(
  '/api/brainlifts/:slug/facts/:factId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const factId = parseInt(req.params.factId);
    if (isNaN(factId)) throw new BadRequestError('Invalid fact ID');

    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new BadRequestError('text is required and must be a non-empty string');
    }

    const brainliftId = req.brainlift!.id;

    // Check current state
    const fact = await storage.getFactByIdForBrainlift(factId, brainliftId);
    if (!fact) throw new NotFoundError('Fact not found');

    // Reject if text unchanged
    if (fact.fact === text.trim()) {
      throw new BadRequestError('Text unchanged');
    }

    // Edit fact (returns previous state)
    const editResult = await storage.editFact(factId, brainliftId, text.trim());
    if (!editResult) throw new NotFoundError('Fact not found');

    // Create version snapshot
    await createVersion({
      dokLevel: 1,
      itemId: factId,
      brainliftId,
      textContent: editResult.previousText,
      score: editResult.previousScore,
      feedback: editResult.previousFeedback,
    });

    // Propagate stale flags
    await propagateStaleFlags({
      dokLevel: 1,
      itemId: factId,
      brainliftId,
      reason: `DOK1 fact ${factId} edited`,
    });

    // Prune old versions
    await pruneVersions(1, factId);

    // Build previous evaluation context
    const previousEvaluation: PreviousEvaluation = {
      previousScore: editResult.previousScore ?? 0,
      previousFeedback: editResult.previousFeedback ?? '',
      oldText: editResult.previousText,
      newText: text.trim(),
      editNumber: 1, // Could be computed from version count
    };

    // Queue regrade job
    await withJob('dok1:regrade')
      .forPayload({ factId, brainliftId, previousEvaluation })
      .queue();

    res.json({
      id: factId,
      status: 'regrading',
      previousScore: editResult.previousScore,
    });
  })
);

/**
 * DELETE /api/brainlifts/:slug/facts/:factId
 * Delete a DOK1 fact. Supports ?preview=true for impact preview.
 */
dok1CrudRouter.delete(
  '/api/brainlifts/:slug/facts/:factId',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const factId = parseInt(req.params.factId);
    if (isNaN(factId)) throw new BadRequestError('Invalid fact ID');

    const brainliftId = req.brainlift!.id;

    // Preview mode
    if (req.query.preview === 'true') {
      const impact = await storage.getFactDeleteImpact(factId, brainliftId);
      if (!impact) throw new NotFoundError('Fact not found');
      return res.json(impact);
    }

    // Actual delete
    const result = await storage.deleteFact(factId, brainliftId);
    if (!result) throw new NotFoundError('Fact not found');

    // Recompute brainlift score
    await recomputeBrainliftScore(brainliftId);

    res.json(result);
  })
);
