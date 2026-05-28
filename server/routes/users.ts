/**
 * User-self preference endpoints.
 *
 * Powers the per-user explainer-seen flag for the DOK Rubric Explainer Modal
 * (and any future per-user UI preferences). Both endpoints are behind
 * `requireAuth`; the userId is read from `req.authContext` (set by the
 * auth middleware), never from path params.
 *
 * See features/pedagogy/dok1-rubric-explainer/specs/01-foundation/spec.md.
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { storage } from '../storage';

export const usersRouter = Router();

const markSeenBodySchema = z.object({
  key: z
    .string({ message: 'key must be a string' })
    .min(1, 'key must be non-empty')
    .max(64, 'key must be 64 characters or fewer'),
});

usersRouter.get(
  '/api/users/me/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.authContext!.userId;
    const prefs = await storage.getUserPreferences(userId);
    res.json(prefs);
  }),
);

usersRouter.patch(
  '/api/users/me/seen-explainer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = markSeenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(
        parsed.error.issues[0]?.message ?? 'Invalid body',
      );
    }

    const userId = req.authContext!.userId;
    const seenExplainers = await storage.markExplainerSeen(
      userId,
      parsed.data.key,
    );
    res.json({ seenExplainers });
  }),
);
