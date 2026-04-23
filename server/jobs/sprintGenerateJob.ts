import type { JobHelpers } from 'graphile-worker';
import { storage } from '../storage';
import { generateSprintPlan } from '../ai/sprintGenerator';

export async function sprintGenerateJob(
  payload: {
    planId: number;
    brainliftId: number;
    startDate: string;
    localDate: string;
    diagnosis: {
      goalRaw: string;
      currentState: string;
    };
  },
  helpers: JobHelpers,
) {
  helpers.logger.info('[sprint:generate] starting', {
    planId: payload.planId,
    brainliftId: payload.brainliftId,
  });

  try {
    const generated = await generateSprintPlan({
      brainliftId: payload.brainliftId,
      localDate: payload.localDate,
      diagnosis: payload.diagnosis,
    });

    await storage.finalizeGeneratingPlan({
      planId: payload.planId,
      brainliftId: payload.brainliftId,
      startDate: generated.startDate,
      tasks: generated.tasks,
    });

    helpers.logger.info('[sprint:generate] completed', {
      planId: payload.planId,
      brainliftId: payload.brainliftId,
      taskCount: generated.tasks.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    helpers.logger.error('[sprint:generate] failed', {
      planId: payload.planId,
      brainliftId: payload.brainliftId,
      error: message,
    });

    await storage.markPlanGenerationFailed({
      planId: payload.planId,
      brainliftId: payload.brainliftId,
      errorMessage: message,
    });
  }
}
