import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import {
  onboardingCreateInput,
  onboardingPatchInput,
  topicSuggestionsInput,
  onboardingSuggestionsInput,
  onboardingResourceInput,
} from "@shared/routes";
import { discoverExperts } from "../ai/onboarding/expert-discovery";
import {
  launchStarterPack,
  isStarterPackInFlight,
} from "../ai/onboarding/starter-pack";
import { swarmEmitter } from "../ai/learning-stream-swarm-v2/event-emitter";
import { requireAuth } from "../middleware/auth";
import {
  asyncHandler,
  BadRequestError,
  ConflictError,
} from "../middleware/error-handler";
import {
  requireBrainliftAccess,
  requireBrainliftModify,
} from "../middleware/brainlift-auth";
import {
  generateTopicSuggestions,
  generateOnboardingSuggestions,
} from "../ai/onboarding/suggestions";
import { composeTopicSentence, generateProjectTitle } from "../ai/onboarding/title";

/**
 * Onboarding wizard endpoints (features/ux-redesign/onboarding-wizard).
 * Routes stay thin: storage owns the writes. Suggestion / starter-pack /
 * discovery endpoints (specs 04-06) will join this router.
 */
export const onboardingRouter = Router();

// Create a brainlift from the wizard's Topic step. Sets phase='research' and
// onboardingStep=1. Creation is optimistic: the row is inserted immediately
// with the raw topic as title (slug derives from it, uniqueness retry) and the
// full composed topic sentence persisted for downstream prompts; the AI title
// then backfills in the background (fail-open: on any failure the raw topic
// simply remains as the title).
onboardingRouter.post(
  "/api/onboarding/projects",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { topic, focus, why } = onboardingCreateInput.parse(req.body);
    const brainlift = await storage.createOnboardingBrainlift({
      userId: req.authContext!.userId,
      topic,
      onboardingTopic: composeTopicSentence({ topic, focus, why }),
    });
    res.status(201).json(brainlift);

    void (async () => {
      try {
        const title = await generateProjectTitle({ topic, focus, why });
        if (title) await storage.updateBrainliftTitle(brainlift.id, title);
      } catch (error) {
        console.warn(`[onboarding] title backfill failed for ${brainlift.slug}:`, error);
      }
    })();
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
    // the wizard should never PATCH after completion cleared the step.
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

// Search-grounded expert discovery for the wizard's Experts step. No request
// body — topic/scope/categories are read server-side from the loaded
// brainlift. Discovery failure degrades to { candidates: [] }; it must NEVER
// 5xx the wizard (the step falls back to manual entry). discoverExperts is
// itself fail-open, but the try/catch is a defense-in-depth backstop against
// the category read or anything else throwing.
onboardingRouter.post(
  "/api/brainlifts/:slug/onboarding/expert-discovery",
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const brainlift = req.brainlift!;
    let candidates: Awaited<ReturnType<typeof discoverExperts>> = [];
    try {
      const categoryRows = await storage.getCategoriesWithCountsForSecondBrain(brainlift.id);
      candidates = await discoverExperts({
        // Full descriptive topic sentence; title is display-only (and often an
        // invented project name no search engine has heard of).
        topic: brainlift.onboardingTopic ?? brainlift.title,
        inScope: brainlift.inScope,
        categories: categoryRows.map((c) => c.name),
      });
    } catch (error) {
      console.error(
        `[onboarding] expert discovery failed for ${brainlift.slug}, returning []:`,
        error,
      );
    }
    res.json({ candidates });
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
        // Full descriptive topic sentence; title is display-only.
        topic: current.onboardingTopic ?? current.title,
        inScope: current.inScope ?? [],
        outOfScope: current.outOfScope ?? [],
      },
      exclude,
    );
    res.json({ suggestions });
  }),
);

// Launch the quick, cap-exempt starter-pack swarm (fired on Categories Next).
// Guards mirror the /launch handler MINUS the daily cap: (a) one swarm at a
// time (active swarm / pending job / in-flight pack → 409 with existingRunId);
// (b) one pack per brainlift (existing pack rows → 409). A first run that
// yielded zero rows leaves none, so a re-fire is naturally allowed.
onboardingRouter.post(
  "/api/brainlifts/:slug/onboarding/starter-pack",
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req: Request, res: Response) => {
    const brainlift = req.brainlift!;

    if (
      swarmEmitter.isSwarmActive(brainlift.id) ||
      (await storage.hasResearchJobPending(brainlift.id)) ||
      isStarterPackInFlight(brainlift.id)
    ) {
      const existingRunId = await storage.getActiveRunIdForBrainlift(brainlift.id);
      throw new ConflictError(
        "A research run is already in progress for this brainlift.",
        "research_run_in_progress",
        { existingRunId: existingRunId ?? undefined },
      );
    }

    if (await storage.hasStarterPackItems(brainlift.id)) {
      throw new ConflictError(
        "A starter pack has already been generated for this brainlift.",
        "starter_pack_already_run",
      );
    }

    const { runId } = await launchStarterPack(brainlift, req.authContext!.userId);
    res.status(200).json({ runId });
  }),
);

// Starter-pack status for the Resources step's poll. `running` while in-flight
// (covers orchestrate → swarm → filter); else `ready` once rows exist; else
// `idle`. A `ready` with zero surviving pending items is legal (paste-only UI).
onboardingRouter.get(
  "/api/brainlifts/:slug/onboarding/starter-pack",
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const brainlift = req.brainlift!;
    let status: "idle" | "running" | "ready";
    if (isStarterPackInFlight(brainlift.id)) {
      status = "running";
    } else if (await storage.hasStarterPackItems(brainlift.id)) {
      status = "ready";
    } else {
      status = "idle";
    }
    res.json({ status });
  }),
);

// Paste a link from the Resources step. Existing URL → 200 { item, duplicate:
// true } (no new row); otherwise a pending source='manual' item with
// pre-extraction defaults (the extraction job auto-fires at insert) → 201.
onboardingRouter.post(
  "/api/brainlifts/:slug/onboarding/resources",
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req: Request, res: Response) => {
    const { url } = onboardingResourceInput.parse(req.body);
    const brainlift = req.brainlift!;

    const existing = await storage.getLearningStreamItemByUrl(url, brainlift.id);
    if (existing) {
      res.status(200).json({ item: existing, duplicate: true });
      return;
    }

    const hostname = new URL(url).hostname;
    const item = await storage.addLearningStreamItem(brainlift.id, {
      type: "News",
      author: hostname,
      topic: url,
      time: "—",
      facts: "",
      url,
      source: "manual",
    });
    res.status(201).json({ item, duplicate: false });
  }),
);
