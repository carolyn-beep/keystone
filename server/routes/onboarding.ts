import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import {
  onboardingCreateInput,
  onboardingPatchInput,
  topicSuggestionsInput,
  onboardingSuggestionsInput,
} from "@shared/routes";
import { requireAuth } from "../middleware/auth";
import {
  asyncHandler,
  BadRequestError,
  ConflictError,
} from "../middleware/error-handler";
import { requireBrainliftModify } from "../middleware/brainlift-auth";
import {
  generateTopicSuggestions,
  generateOnboardingSuggestions,
} from "../ai/onboarding/suggestions";

/**
 * Onboarding wizard endpoints (features/ux-redesign/onboarding-wizard).
 * Routes stay thin: storage owns the writes. Suggestion / starter-pack /
 * discovery endpoints (specs 04-06) will join this router.
 */
export const onboardingRouter = Router();

// Create a brainlift from the wizard's Topic step. Sets phase='research' and
// onboardingStep=1; slug is derived from the topic with a uniqueness retry.
onboardingRouter.post(
  "/api/onboarding/projects",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { topic } = onboardingCreateInput.parse(req.body);
    const brainlift = await storage.createOnboardingBrainlift({
      userId: req.authContext!.userId,
      topic,
    });
    res.status(201).json(brainlift);
  }),
);

// Persist wizard progress: forward-only step high-water mark + scope arrays.
onboardingRouter.patch(
  "/api/brainlifts/:slug/onboarding",
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req: Request, res: Response) => {
    const { step, inScope, outOfScope } = onboardingPatchInput.parse(req.body);
    const current = req.brainlift!;

    // Patching an already-completed onboarding is a conflict, not a no-op:
    // the wizard should never PATCH after Done cleared the step.
    if (current.onboardingStep === null) {
      throw new ConflictError("Onboarding already complete");
    }

    // Step is a forward-only high-water mark. Back-navigation in the wizard
    // renders earlier steps without PATCHing, so a backward step is a bug.
    if (step !== undefined && step < current.onboardingStep) {
      throw new BadRequestError("Onboarding step cannot move backward");
    }

    let updated = current;
    if (inScope !== undefined || outOfScope !== undefined) {
      updated = await storage.updateBrainliftScope(current.id, { inScope, outOfScope });
    }
    if (step !== undefined && step > current.onboardingStep) {
      updated = await storage.updateOnboardingStep(current.id, step);
    }

    res.json(updated);
  }),
);

// Finish onboarding: clear the step. Idempotent — a repeat call on an
// already-complete brainlift returns 200 without a write.
onboardingRouter.post(
  "/api/brainlifts/:slug/onboarding/complete",
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req: Request, res: Response) => {
    const current = req.brainlift!;
    if (current.onboardingStep !== null) {
      await storage.updateOnboardingStep(current.id, null);
    }
    res.json({ slug: current.slug });
  }),
);

// Topic idea chips for step 1. Pre-create (no brainlift yet), so auth-only.
// Non-blocking: the generator already resolves [] on any AI failure.
onboardingRouter.post(
  "/api/onboarding/topic-suggestions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { exclude } = topicSuggestionsInput.parse(req.body);
    const suggestions = await generateTopicSuggestions(exclude);
    res.json({ suggestions });
  }),
);

// Suggestion chips for steps 2-4 (in-scope / out-of-scope / categories).
// Topic and scope inputs are read from the brainlift row — never trusted from
// the client. Non-blocking: the generator resolves [] on any AI failure.
onboardingRouter.post(
  "/api/brainlifts/:slug/onboarding/suggestions",
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req: Request, res: Response) => {
    const { kind, exclude } = onboardingSuggestionsInput.parse(req.body);
    const current = req.brainlift!;
    const suggestions = await generateOnboardingSuggestions(
      kind,
      {
        topic: current.title,
        inScope: current.inScope ?? [],
        outOfScope: current.outOfScope ?? [],
      },
      exclude,
    );
    res.json({ suggestions });
  }),
);
