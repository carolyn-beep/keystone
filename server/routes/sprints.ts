import { Router, type Request, type Response } from 'express';
import {
  createDeliverableRequestSchema,
  generatePlanRequestSchema,
  listDeliverablesQuerySchema,
  listTasksQuerySchema,
  taskIdParamsSchema,
  updateDeliverableRequestSchema,
  type PlanHistoryItem,
  type TaskDetailResponse,
  type TaskListItem,
} from '@shared/routes';
import type { SprintTaskMilestone } from '@shared/schema';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { asyncHandler, NotFoundError } from '../middleware/error-handler';
import { buildSprintDaySlots, getFirstScheduledDateOnOrAfter } from '../lib/sprintSchedule';
import { createGoogleDriveService, type GoogleDriveService } from '../services/googleDrive';
import { SprintStorageConflictError } from '../storage/sprints';
import { withJob } from '../utils/withJob';

const STALE_GENERATING_PLAN_MS = 10 * 60 * 1000;

export const sprintsRouter = Router();

let googleDriveService: GoogleDriveService | null = null;

function getGoogleDriveService(): GoogleDriveService {
  if (!googleDriveService) {
    googleDriveService = createGoogleDriveService();
  }
  return googleDriveService;
}

function toPlanHistoryItem(
  plan: {
    id: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'complete' | 'generating' | 'failed';
    generationError?: string | null;
  },
  taskCount: number,
  completedTaskCount: number,
): PlanHistoryItem {
  return {
    id: plan.id,
    startDate: plan.startDate,
    endDate: plan.endDate,
    status: plan.status,
    taskCount,
    completedTaskCount,
    generationError: plan.generationError ?? null,
  };
}

function toTaskListItem(task: {
  id: number;
  planId: number;
  scheduledDate: string;
  weekNumber: number;
  dayInWeek: number;
  title: string;
  description: string;
  milestone: SprintTaskMilestone | null;
  isComplete: boolean;
  isPastDue: boolean;
  deliverable: {
    id: number;
    title: string;
    docUrl: string;
    createdAt: string;
  } | null;
}): TaskListItem {
  return {
    id: task.id,
    planId: task.planId,
    scheduledDate: task.scheduledDate,
    weekNumber: task.weekNumber,
    dayInWeek: task.dayInWeek,
    title: task.title,
    description: task.description,
    milestone: task.milestone,
    isComplete: task.isComplete,
    isPastDue: task.isPastDue,
    deliverable: task.deliverable,
  };
}

function toTaskDetailResponse(task: {
  id: number;
  planId: number;
  scheduledDate: string;
  weekNumber: number;
  dayInWeek: number;
  title: string;
  description: string;
  milestone: SprintTaskMilestone | null;
  isComplete: boolean;
  isPastDue: boolean;
  deliverable: {
    id: number;
    title: string;
    docUrl: string;
    createdAt: string;
  } | null;
  plan: {
    id: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'complete' | 'generating' | 'failed';
  };
}): TaskDetailResponse {
  return {
    ...toTaskListItem(task),
    plan: task.plan,
  };
}

async function listPlanHistoryWithCounts(brainliftId: number): Promise<PlanHistoryItem[]> {
  const planRows = await storage.listPlans(brainliftId);
  if (planRows.length === 0) return [];

  const activeTasks = await storage.listTasksForBrainlift(brainliftId);
  const activePlan = planRows.find((plan) => plan.status === 'active');
  const activeTaskCount = activeTasks.length;
  const activeCompletedCount = activeTasks.filter((task) => task.isComplete).length;

  const completedPlans = planRows.filter((plan) => plan.status === 'complete');
  const completedCounts = new Map<number, number>();

  await Promise.all(
    completedPlans.map(async (plan) => {
      const deliverables = await storage.listDeliverablesForBrainlift(brainliftId, { planId: plan.id });
      completedCounts.set(plan.id, deliverables.length);
    }),
  );

  return planRows.map((plan) => {
    if (activePlan && plan.id === activePlan.id) {
      return toPlanHistoryItem(plan, activeTaskCount, activeCompletedCount);
    }

    const completedCount = completedCounts.get(plan.id) ?? 0;
    return toPlanHistoryItem(plan, completedCount, completedCount);
  });
}

async function getTaskOr404(brainliftId: number, taskId: number) {
  const task = await storage.getTaskForBrainlift(taskId, brainliftId);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  return task;
}

export async function createPlanHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;
  const input = generatePlanRequestSchema.parse(req.body);

  await storage.reclaimStaleGeneratingPlans({
    brainliftId: brainlift.id,
    olderThan: new Date(Date.now() - STALE_GENERATING_PLAN_MS),
  });

  const existingCurrent = await storage.getCurrentPlan(brainlift.id);
  if (existingCurrent) {
    if (existingCurrent.status === 'active') {
      res.status(409).json({ message: 'An active sprint plan already exists for this brainlift' });
      return;
    }
    if (existingCurrent.status === 'generating') {
      res.status(409).json({ message: 'A sprint plan is already being generated for this brainlift' });
      return;
    }
  }

  await storage.deleteFailedPlans(brainlift.id);

  const startDate = getFirstScheduledDateOnOrAfter(input.localDate);
  const sprintDaySlots = buildSprintDaySlots(startDate);
  const endDate = sprintDaySlots[sprintDaySlots.length - 1]?.scheduledDate;
  if (!endDate) {
    throw new Error('Sprint schedule did not produce an end date');
  }

  let plan;
  try {
    plan = await storage.createGeneratingPlan({
      brainliftId: brainlift.id,
      startDate,
      endDate,
      userId: authContext.userId,
    });
  } catch (error) {
    if (error instanceof SprintStorageConflictError) {
      res.status(409).json({ message: error.message });
      return;
    }
    throw error;
  }

  await withJob('sprint:generate')
    .forPayload({
      planId: plan.id,
      brainliftId: brainlift.id,
      startDate,
      localDate: input.localDate,
      diagnosis: input.diagnosis,
    })
    .queue();

  res.status(202).json({
    plan: toPlanHistoryItem(plan, 0, 0),
    tasks: [],
  });
}

export async function listPlansHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const history = await listPlanHistoryWithCounts(brainlift.id);
  res.json(history);
}

export async function getActivePlanHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const plan = await storage.getCurrentPlan(brainlift.id);

  if (!plan) {
    res.json({ plan: null, tasks: [] });
    return;
  }

  if (plan.status === 'generating') {
    res.json({
      plan: toPlanHistoryItem(plan, 0, 0),
      tasks: [],
    });
    return;
  }

  const tasks = await storage.listTasksForBrainlift(brainlift.id);
  const completedTaskCount = tasks.filter((task) => task.isComplete).length;

  res.json({
    plan: toPlanHistoryItem(plan, tasks.length, completedTaskCount),
    tasks: tasks.map((task) => toTaskListItem(task)),
  });
}

export async function listTasksHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const query = listTasksQuerySchema.parse(req.query);

  const rows = await storage.listTasksForBrainlift(brainlift.id, {
    date: query.date,
    week: query.week,
    state: query.state,
    includePastDue: query.includePastDue,
    localDate: query.localDate,
  });

  res.json(rows.map((task) => toTaskListItem(task)));
}

export async function getTaskHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const task = await getTaskOr404(brainlift.id, taskId);
  res.json(toTaskDetailResponse(task));
}

export async function createDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const authContext = req.authContext!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const body = createDeliverableRequestSchema.parse(req.body);

  const task = await getTaskOr404(brainlift.id, taskId);
  const existingDeliverable = await storage.getDeliverableByTaskId(taskId, brainlift.id);

  if (existingDeliverable) {
    res.status(409).json({ message: 'A deliverable already exists for this task' });
    return;
  }

  const planRows = await storage.listPlans(brainlift.id);
  const plan = planRows.find((row) => row.id === task.plan.id);
  if (!plan) {
    throw new NotFoundError('Plan not found');
  }

  const drive = getGoogleDriveService();
  const audience = await storage.getSprintSharingAudience(brainlift.id);

  const rootFolder = await drive.ensureRootFolder({
    brainliftId: brainlift.id,
    brainliftTitle: brainlift.title,
    ownerName: audience.ownerName,
    existingFolderId: brainlift.gdriveRootFolderId ?? null,
  });

  if (!brainlift.gdriveRootFolderId || brainlift.gdriveRootFolderId !== rootFolder.folderId) {
    await storage.setBrainliftGdriveRootFolder(brainlift.id, rootFolder.folderId);
  }

  await drive.syncRootFolderEditors(rootFolder.folderId, [
    audience.ownerEmail,
    ...audience.editorEmails,
    ...audience.guideEmails,
  ]);

  const planFolder = await drive.ensurePlanFolder({
    planId: plan.id,
    startDate: plan.startDate,
    existingFolderId: plan.gdriveFolderId ?? null,
    rootFolderId: rootFolder.folderId,
  });

  if (!plan.gdriveFolderId || plan.gdriveFolderId !== planFolder.folderId) {
    await storage.setPlanGdriveFolder(plan.id, planFolder.folderId);
  }

  const createdDoc = await drive.createGoogleDocFromMarkdown({
    parentFolderId: planFolder.folderId,
    title: body.title,
    markdown: body.markdown,
  });

  try {
    const deliverable = await storage.createDeliverable({
      taskId,
      brainliftId: brainlift.id,
      title: body.title,
      docFileId: createdDoc.fileId,
      docUrl: createdDoc.docUrl,
      sourceSurface: 'ui',
      createdByUserId: authContext.userId,
    });

    await storage.markPlanCompleteIfAllDelivered(task.plan.id);
    res.status(201).json({ docUrl: deliverable.docUrl });
  } catch (error) {
    try {
      await drive.deleteGoogleDoc(createdDoc.fileId);
    } catch (cleanupError) {
      console.error('[Sprints] Failed to clean up orphaned Google Doc:', cleanupError);
    }

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

  await getTaskOr404(brainlift.id, taskId);

  const deliverable = await storage.getDeliverableByTaskId(taskId, brainlift.id);
  if (!deliverable) {
    throw new NotFoundError('Deliverable not found');
  }

  const drive = getGoogleDriveService();
  const doc = await drive.exportGoogleDocAsMarkdown(deliverable.docFileId);

  res.json({
    title: doc.title || deliverable.title,
    contentMarkdown: doc.markdown,
    docUrl: doc.docUrl || deliverable.docUrl,
  });
}

export async function updateDeliverableHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const { taskId } = taskIdParamsSchema.parse(req.params);
  const body = updateDeliverableRequestSchema.parse(req.body);

  await getTaskOr404(brainlift.id, taskId);

  const deliverable = await storage.getDeliverableByTaskId(taskId, brainlift.id);
  if (!deliverable) {
    throw new NotFoundError('Deliverable not found');
  }

  const drive = getGoogleDriveService();
  await drive.replaceGoogleDocFromMarkdown(deliverable.docFileId, body.markdown);

  res.json({ docUrl: deliverable.docUrl });
}

export async function listDeliverablesHandler(req: Request, res: Response): Promise<void> {
  const brainlift = req.brainlift!;
  const query = listDeliverablesQuerySchema.parse(req.query);

  const [plans, deliverables] = await Promise.all([
    listPlanHistoryWithCounts(brainlift.id),
    storage.listDeliverablesForBrainlift(brainlift.id, { planId: query.planId }),
  ]);

  res.json({
    plans,
    deliverables,
  });
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
