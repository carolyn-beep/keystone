import { Router } from "express";
import { storage } from "../storage";
import { createBuilderExpertInputSchema, patchBuilderExpertInputSchema } from "@shared/routes";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, BadRequestError, NotFoundError } from "../middleware/error-handler";
import { requireBrainliftAccess, requireBrainliftModify } from "../middleware/brainlift-auth";
import type { NativePhaseProgress } from "@shared/schema";

export const builderExpertsRouter = Router();

// ─── Helpers: afterExpertSaved / afterExpertRemoved ─────────────────────────

/**
 * Called after a builder expert is saved (manual create or suggestion acceptance).
 * Updates phase2 to 'complete' and phase3 to 'in_progress' when >= 3 saved experts,
 * and idempotently queues learning-stream:research.
 */
async function afterExpertSaved(brainliftId: number): Promise<void> {
  const count = await storage.countSavedBuilderExperts(brainliftId);
  if (count >= 3) {
    // Read current phase progress by brainliftId to preserve other phases
    const { db, nativeBrainliftDetails, eq } = await import('../storage/base');
    const [detailRow] = await db
      .select({ phaseProgress: nativeBrainliftDetails.phaseProgress })
      .from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, brainliftId));

    if (detailRow) {
      const updatedProgress: NativePhaseProgress = {
        ...detailRow.phaseProgress,
        phase2: 'complete',
        phase3: 'in_progress',
      };
      await storage.updateNativeDetailsForBrainlift(brainliftId, {
        phaseProgress: updatedProgress,
      });
    }

    // Queue research idempotently — jobKey prevents duplicate queuing
    try {
      const { withJob } = await import('../utils/withJob');
      await withJob('learning-stream:research')
        .forPayload({ brainliftId })
        .withOptions({ jobKey: `builder-research-${brainliftId}` })
        .queue();
    } catch (err) {
      console.error('[BuilderExperts] Failed to queue research job:', err);
      // Don't roll back the expert save
    }
  }
}

/**
 * Called after a builder expert is removed.
 * Regresses phase2 based on remaining count:
 *   count === 0 -> 'not_started'
 *   count < 3   -> 'in_progress'
 *   count >= 3  -> no change (still complete)
 * Phase 3 is NEVER re-locked after being unlocked.
 */
async function afterExpertRemoved(brainliftId: number): Promise<void> {
  const count = await storage.countSavedBuilderExperts(brainliftId);
  if (count < 3) {
    const { db, nativeBrainliftDetails, eq } = await import('../storage/base');
    const [detailRow] = await db
      .select({ phaseProgress: nativeBrainliftDetails.phaseProgress })
      .from(nativeBrainliftDetails)
      .where(eq(nativeBrainliftDetails.brainliftId, brainliftId));

    if (detailRow) {
      const updatedProgress: NativePhaseProgress = {
        ...detailRow.phaseProgress,
        phase2: count === 0 ? 'not_started' : 'in_progress',
        // phase3 is intentionally NOT changed here -- stays at whatever it was
      };
      await storage.updateNativeDetailsForBrainlift(brainliftId, {
        phaseProgress: updatedProgress,
      });
    }
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/**
 * GET /api/brainlifts/:slug/builder-experts
 * List all builder experts with suggestion lifecycle state.
 */
builderExpertsRouter.get(
  '/api/brainlifts/:slug/builder-experts',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    const [experts, nativeDetails] = await Promise.all([
      storage.getBuilderExpertsByBrainliftId(brainlift.id),
      storage.getNativeDetailsBySlug(req.params.slug),
    ]);

    res.json({
      experts,
      suggestionStatus: nativeDetails?.suggestionStatus ?? 'queued',
      suggestionError: nativeDetails?.suggestionError ?? null,
    });
  })
);

/**
 * POST /api/brainlifts/:slug/builder-experts
 * Create a manual saved expert.
 */
builderExpertsRouter.post(
  '/api/brainlifts/:slug/builder-experts',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    const input = createBuilderExpertInputSchema.parse(req.body);

    const expert = await storage.createBuilderExpert({
      brainliftId: brainlift.id,
      name: input.name,
      who: input.who,
      focus: input.focus ?? null,
      why: input.why ?? null,
      where: input.where,
      origin: 'manual',
      status: 'saved',
    });

    await afterExpertSaved(brainlift.id);

    res.status(201).json(expert);
  })
);

/**
 * PATCH /api/brainlifts/:slug/builder-experts/:id
 * Update a builder expert (edit fields, accept suggestion).
 */
builderExpertsRouter.patch(
  '/api/brainlifts/:slug/builder-experts/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    const expertId = parseInt(req.params.id, 10);
    if (isNaN(expertId)) {
      throw new BadRequestError('Invalid expert ID');
    }

    const input = patchBuilderExpertInputSchema.parse(req.body);

    if (Object.keys(input).length === 0) {
      throw new BadRequestError('At least one field must be provided');
    }

    const updated = await storage.updateBuilderExpertForBrainlift(expertId, brainlift.id, {
      name: input.name,
      who: input.who,
      focus: input.focus,
      why: input.why,
      where: input.where,
      status: input.status,
    });

    if (!updated) {
      throw new NotFoundError('Builder expert not found');
    }

    // If status changed to 'saved', trigger side effects
    if (input.status === 'saved') {
      await afterExpertSaved(brainlift.id);
    }

    res.json(updated);
  })
);

/**
 * PATCH /api/brainlifts/:slug/builder-experts/:id/dismiss
 * Dismiss a pending suggested expert.
 */
builderExpertsRouter.patch(
  '/api/brainlifts/:slug/builder-experts/:id/dismiss',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    const expertId = parseInt(req.params.id, 10);
    if (isNaN(expertId)) {
      throw new BadRequestError('Invalid expert ID');
    }

    const success = await storage.dismissBuilderExpertForBrainlift(expertId, brainlift.id);

    if (!success) {
      throw new NotFoundError('Builder expert not found');
    }

    res.json({ success: true });
  })
);

/**
 * DELETE /api/brainlifts/:slug/builder-experts/:id
 * Delete a builder expert.
 */
builderExpertsRouter.delete(
  '/api/brainlifts/:slug/builder-experts/:id',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    const expertId = parseInt(req.params.id, 10);
    if (isNaN(expertId)) {
      throw new BadRequestError('Invalid expert ID');
    }

    const success = await storage.deleteBuilderExpertForBrainlift(expertId, brainlift.id);

    if (!success) {
      throw new NotFoundError('Builder expert not found');
    }

    await afterExpertRemoved(brainlift.id);

    res.status(204).send();
  })
);

/**
 * POST /api/brainlifts/:slug/builder-experts/regenerate-suggestions
 * Clear stale pending suggestions, reset status, and re-queue suggestion job.
 */
builderExpertsRouter.post(
  '/api/brainlifts/:slug/builder-experts/regenerate-suggestions',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Builder experts are only available for native brainlifts');
    }

    // Clear stale pending suggestions
    await storage.clearPendingSuggestions(brainlift.id);

    // Reset suggestion status
    await storage.setBuilderSuggestionState(brainlift.id, {
      status: 'queued',
      error: null,
    });

    // Queue the suggestion job
    const { withJob } = await import('../utils/withJob');
    await withJob('brainlift:suggest-experts')
      .forPayload({ brainliftId: brainlift.id })
      .queue();

    res.status(202).json({ status: 'queued' });
  })
);
