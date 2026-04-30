import { Router, type Request, type Response } from 'express';
import {
  createDeliverableRequestSchema,
  generatePlanRequestSchema,
  listDeliverablesQuerySchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
  updateDeliverableRequestSchema,
} from '@shared/routes';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler } from '../middleware/error-handler';
import { SprintStorageConflictError } from '../storage/sprints';
import {
  createSprintDeliverable,
  getCurrentSprintPlan,
  getSprintTaskOrThrow,
  listSprintDeliverables,
  listSprintPlansWithCounts,
  listSprintTasks,
  queueSprintPlanGeneration,
  readSprintDeliverable,
  updateSprintDeliverable,
} from '../services/sprint';

export const sprintsRouter = Router();

export async function createPlanHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;
  const input = generatePlanRequestSchema.parse(req.body);

  try {
    const result = await queueSprintPlanGeneration({
      brainliftId: brainlift.id,
      userId: authContext.userId,
      localDate: input.localDate,
      diagnosis: input.diagnosis,
    });

    res.status(202).json(result);
  } catch (error) {
    if (error instanceof SprintStorageConflictError) {
      res.status(409).json({ message: error.message });
      return;
    }
    throw error;
  }
}

export async function listPlansHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const history = await listSprintPlansWithCounts(brainlift.id);
  res.json(history);
}

export async function getActivePlanHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  res.json(await getCurrentSprintPlan(brainlift.id));
}

export async function listTasksHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const query = listTasksQuerySchema.parse(req.query);
  res.json(await listSprintTasks(brainlift.id, query));
}

export async function getTaskHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  res.json(await getSprintTaskOrThrow(brainlift.id, taskId));
}

export async function createDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const body = createDeliverableRequestSchema.parse(req.body);

  try {
    const result = await createSprintDeliverable({
      brainlift: {
        id: brainlift.id,
        title: brainlift.title,
        gdriveRootFolderId: brainlift.gdriveRootFolderId ?? null,
      },
      userId: authContext.userId,
      taskId,
      title: body.title,
      markdown: body.markdown,
      sourceSurface: 'ui',
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof SprintStorageConflictError) {
      res.status(409).json({ message: error.message });
      return;
    }

    throw error;
  }
}

export async function readDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  res.json(await readSprintDeliverable({ brainliftId: brainlift.id, taskId }));
}

export async function updateDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const body = updateDeliverableRequestSchema.parse(req.body);
  res.json(await updateSprintDeliverable({
    brainliftId: brainlift.id,
    taskId,
    markdown: body.markdown,
  }));
}

export async function listDeliverablesHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const query = listDeliverablesQuerySchema.parse(req.query);
  res.json(await listSprintDeliverables(brainlift.id, query));
}

sprintsRouter.post(
  '/api/brainlifts/:slug/plans',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(createPlanHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/plans',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listPlansHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/plans/active',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(getActivePlanHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/tasks',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listTasksHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/tasks/:taskId',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(getTaskHandler),
);

sprintsRouter.post(
  '/api/brainlifts/:slug/tasks/:taskId/deliverable',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(createDeliverableHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/tasks/:taskId/deliverable',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(readDeliverableHandler),
);

sprintsRouter.put(
  '/api/brainlifts/:slug/tasks/:taskId/deliverable',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(updateDeliverableHandler),
);

sprintsRouter.get(
  '/api/brainlifts/:slug/deliverables',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(listDeliverablesHandler),
);
