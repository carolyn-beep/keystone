import { Router } from "express";
import { storage } from "../storage";
import { createNativeBrainliftInputSchema, patchNativeDetailsInputSchema } from "@shared/routes";
import { requireAuth } from "../middleware/auth";
import { asyncHandler, BadRequestError, NotFoundError } from "../middleware/error-handler";
import { requireBrainliftAccess, requireBrainliftModify } from "../middleware/brainlift-auth";

export const nativeBrainliftsRouter = Router();

/**
 * POST /api/brainlifts/native
 * Create a new native brainlift with builder details.
 */
nativeBrainliftsRouter.post(
  '/api/brainlifts/native',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = createNativeBrainliftInputSchema.parse(req.body);

    const result = await storage.createNativeBrainlift({
      topic: input.topic,
      purpose: input.purpose,
      owner: input.owner ?? null,
      userId: req.authContext!.userId,
    });

    res.status(201).json(result);
  })
);

/**
 * GET /api/brainlifts/:slug/native-details
 * Get native builder details for a brainlift.
 */
nativeBrainliftsRouter.get(
  '/api/brainlifts/:slug/native-details',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const details = await storage.getNativeDetailsBySlug(req.params.slug);
    if (!details) {
      throw new NotFoundError('Native details not found');
    }
    res.json(details);
  })
);

/**
 * PATCH /api/brainlifts/:slug/native-details
 * Update native builder details (topic, purpose, owner, lastActivePhase).
 */
nativeBrainliftsRouter.patch(
  '/api/brainlifts/:slug/native-details',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;

    // Reject if not a native brainlift
    if (brainlift.sourceType !== 'native') {
      throw new BadRequestError('Only native brainlifts have builder details');
    }

    const input = patchNativeDetailsInputSchema.parse(req.body);

    // Reject empty body
    if (Object.keys(input).length === 0) {
      throw new BadRequestError('At least one field must be provided');
    }

    const updated = await storage.updateNativeDetailsForBrainlift(brainlift.id, {
      topic: input.topic,
      purpose: input.purpose,
      owner: input.owner,
      lastActivePhase: input.lastActivePhase,
    });

    res.json(updated);
  })
);
