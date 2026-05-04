import type { BrainliftData, DeliverableSourceSurface, SprintTaskMilestone } from '@shared/schema';
import type {
  DeliverableListResponse,
  ListDeliverablesQuery,
  ListTasksQuery,
  PlanHistoryItem,
  ReadDeliverableResponse,
  TaskDetailResponse,
  TaskListItem,
  GeneratedPlanResponse,
} from '@shared/routes';
import { NotFoundError } from '../middleware/error-handler';
import { storage } from '../storage';
import {
  SprintStorageConflictError,
  setDeliverableSourceSurface,
  type SprintTaskDetailRow,
  type SprintTaskListRow,
} from '../storage/sprints';
import { buildSprintDaySlots, getFirstScheduledDateOnOrAfter } from '../lib/sprintSchedule';
import { createGoogleDriveService, type GoogleDriveService } from './googleDrive';
import { withJob } from '../utils/withJob';
import { generateSprintPlan } from '../ai/sprintGenerator';

const STALE_GENERATING_PLAN_MS = 10 * 60 * 1000;

export type CurrentSprintPlanResponse =
  | GeneratedPlanResponse
  | { plan: null; tasks: [] };

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

function toTaskListItem(task: SprintTaskListRow): TaskListItem {
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

function toTaskDetailResponse(task: SprintTaskDetailRow): TaskDetailResponse {
  return {
    ...toTaskListItem(task),
    plan: task.plan,
  };
}

function toGeneratedTaskListItems(
  tasks: Array<{
    id: number;
    planId: number;
    scheduledDate: string;
    weekNumber: number;
    dayInWeek: number;
    title: string;
    description: string;
    milestone: SprintTaskMilestone | null;
  }>,
): TaskListItem[] {
  return tasks.map((task) => ({
    id: task.id,
    planId: task.planId,
    scheduledDate: task.scheduledDate,
    weekNumber: task.weekNumber,
    dayInWeek: task.dayInWeek,
    title: task.title,
    description: task.description,
    milestone: task.milestone,
    isComplete: false,
    isPastDue: false,
    deliverable: null,
  }));
}

function buildFallbackDiagnosisGoal(context: NonNullable<Awaited<ReturnType<typeof storage.getSprintPlanContext>>>): string {
  return context.brainlift.displayPurpose
    ?? context.brainlift.description
    ?? `Advance ${context.brainlift.title}`;
}

function buildFallbackDiagnosisCurrentState(
  context: NonNullable<Awaited<ReturnType<typeof storage.getSprintPlanContext>>>,
): string {
  const parts = [
    `Brainlift "${context.brainlift.title}" currently has ${context.sources.length} source summaries`,
    `${context.spovs.length} SPOVs`,
    `and ${context.experts.length} ranked experts in context`,
  ];

  if (context.sources[0]?.points[0]) {
    parts.push(`top source point: ${context.sources[0].points[0]}`);
  }

  if (context.spovs[0]?.text) {
    parts.push(`top SPOV: ${context.spovs[0].text}`);
  }

  return parts.join('. ') + '.';
}

async function resolveDiagnosis(input: {
  brainliftId: number;
  diagnosis?: {
    goalRaw?: string;
    currentState?: string;
  };
}): Promise<{ goalRaw: string; currentState: string }> {
  const goalRaw = input.diagnosis?.goalRaw?.trim();
  const currentState = input.diagnosis?.currentState?.trim();

  if (goalRaw && currentState) {
    return { goalRaw, currentState };
  }

  const context = await storage.getSprintPlanContext(input.brainliftId);
  if (!context) {
    throw new Error(`Sprint generation context not found for brainlift ${input.brainliftId}`);
  }

  return {
    goalRaw: goalRaw ?? buildFallbackDiagnosisGoal(context),
    currentState: currentState ?? buildFallbackDiagnosisCurrentState(context),
  };
}

async function prepareSprintPlanGeneration(input: {
  brainliftId: number;
  userId: string;
  localDate: string;
}) {
  await storage.reclaimStaleGeneratingPlans({
    brainliftId: input.brainliftId,
    olderThan: new Date(Date.now() - STALE_GENERATING_PLAN_MS),
  });

  const existingCurrent = await storage.getCurrentPlan(input.brainliftId);
  if (existingCurrent) {
    if (existingCurrent.status === 'active') {
      throw new SprintStorageConflictError('An active sprint plan already exists for this brainlift');
    }
    if (existingCurrent.status === 'generating') {
      throw new SprintStorageConflictError('A sprint plan is already being generated for this brainlift');
    }
  }

  await storage.deleteFailedPlans(input.brainliftId);

  const startDate = getFirstScheduledDateOnOrAfter(input.localDate);
  const sprintDaySlots = buildSprintDaySlots(startDate);
  const endDate = sprintDaySlots[sprintDaySlots.length - 1]?.scheduledDate;
  if (!endDate) {
    throw new Error('Sprint schedule did not produce an end date');
  }

  const plan = await storage.createGeneratingPlan({
    brainliftId: input.brainliftId,
    startDate,
    endDate,
    userId: input.userId,
  });

  return { plan, startDate };
}

async function getTaskRowOrThrow(brainliftId: number, taskId: number): Promise<SprintTaskDetailRow> {
  const task = await storage.getTaskForBrainlift(taskId, brainliftId);
  if (!task) {
    throw new NotFoundError('Task not found');
  }
  return task;
}

async function getPlanForTaskOrThrow(brainliftId: number, planId: number) {
  const planRows = await storage.listPlans(brainliftId);
  const plan = planRows.find((row) => row.id === planId);
  if (!plan) {
    throw new NotFoundError('Plan not found');
  }
  return plan;
}

async function ensurePlanDriveFolder(input: {
  brainlift: Pick<BrainliftData, 'id' | 'title' | 'gdriveRootFolderId'>;
  plan: {
    id: number;
    startDate: string;
    gdriveFolderId?: string | null;
  };
  drive?: GoogleDriveService;
}): Promise<{ drive: GoogleDriveService; planFolderId: string }> {
  const drive = input.drive ?? getGoogleDriveService();
  const audience = await storage.getSprintSharingAudience(input.brainlift.id);

  const rootFolder = await drive.ensureRootFolder({
    brainliftId: input.brainlift.id,
    brainliftTitle: input.brainlift.title,
    ownerName: audience.ownerName,
    existingFolderId: input.brainlift.gdriveRootFolderId ?? null,
  });

  if (!input.brainlift.gdriveRootFolderId || input.brainlift.gdriveRootFolderId !== rootFolder.folderId) {
    await storage.setBrainliftGdriveRootFolder(input.brainlift.id, rootFolder.folderId);
  }

  await drive.syncRootFolderEditors(rootFolder.folderId, [
    audience.ownerEmail,
    ...audience.editorEmails,
    ...audience.guideEmails,
  ]);

  const planFolder = await drive.ensurePlanFolder({
    planId: input.plan.id,
    startDate: input.plan.startDate,
    existingFolderId: input.plan.gdriveFolderId ?? null,
    rootFolderId: rootFolder.folderId,
  });

  if (!input.plan.gdriveFolderId || input.plan.gdriveFolderId !== planFolder.folderId) {
    await storage.setPlanGdriveFolder(input.plan.id, planFolder.folderId);
  }

  return {
    drive,
    planFolderId: planFolder.folderId,
  };
}

export async function listSprintPlansWithCounts(brainliftId: number): Promise<PlanHistoryItem[]> {
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

export async function getCurrentSprintPlan(brainliftId: number): Promise<CurrentSprintPlanResponse> {
  const plan = await storage.getCurrentPlan(brainliftId);

  if (!plan) {
    return { plan: null, tasks: [] };
  }

  if (plan.status === 'generating') {
    return {
      plan: toPlanHistoryItem(plan, 0, 0),
      tasks: [],
    };
  }

  const tasks = await storage.listTasksForBrainlift(brainliftId);
  const completedTaskCount = tasks.filter((task) => task.isComplete).length;

  return {
    plan: toPlanHistoryItem(plan, tasks.length, completedTaskCount),
    tasks: tasks.map((task) => toTaskListItem(task)),
  };
}

export async function listSprintTasks(
  brainliftId: number,
  query: ListTasksQuery,
): Promise<TaskListItem[]> {
  const rows = await storage.listTasksForBrainlift(brainliftId, {
    date: query.date,
    week: query.week,
    state: query.state,
    includePastDue: query.includePastDue,
    localDate: query.localDate,
  });

  return rows.map((task) => toTaskListItem(task));
}

export async function getSprintTaskOrThrow(
  brainliftId: number,
  taskId: number,
): Promise<TaskDetailResponse> {
  const task = await getTaskRowOrThrow(brainliftId, taskId);
  return toTaskDetailResponse(task);
}

export async function queueSprintPlanGeneration(input: {
  brainliftId: number;
  userId: string;
  localDate: string;
  diagnosis: {
    goalRaw: string;
    currentState: string;
  };
}): Promise<GeneratedPlanResponse> {
  const { plan, startDate } = await prepareSprintPlanGeneration(input);

  await withJob('sprint:generate')
    .forPayload({
      planId: plan.id,
      brainliftId: input.brainliftId,
      startDate,
      localDate: input.localDate,
      diagnosis: input.diagnosis,
    })
    .queue();

  return {
    plan: toPlanHistoryItem(plan, 0, 0),
    tasks: [],
  };
}

export async function generateSprintPlanNow(input: {
  brainliftId: number;
  userId: string;
  localDate: string;
  diagnosis?: {
    goalRaw?: string;
    currentState?: string;
  };
}): Promise<GeneratedPlanResponse> {
  const { plan } = await prepareSprintPlanGeneration(input);
  const diagnosis = await resolveDiagnosis(input);

  try {
    const generated = await generateSprintPlan({
      brainliftId: input.brainliftId,
      localDate: input.localDate,
      diagnosis,
    });

    const finalized = await storage.finalizeGeneratingPlan({
      planId: plan.id,
      brainliftId: input.brainliftId,
      startDate: generated.startDate,
      tasks: generated.tasks,
    });

    const taskListItems = toGeneratedTaskListItems(finalized.tasks);

    return {
      plan: toPlanHistoryItem(finalized.plan, taskListItems.length, 0),
      tasks: taskListItems,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await storage.markPlanGenerationFailed({
      planId: plan.id,
      brainliftId: input.brainliftId,
      errorMessage: message,
    });
    throw error;
  }
}

export async function createSprintDeliverable(input: {
  brainlift: Pick<BrainliftData, 'id' | 'title' | 'gdriveRootFolderId'>;
  userId: string;
  taskId: number;
  title: string;
  markdown: string;
  sourceSurface: DeliverableSourceSurface;
  drive?: GoogleDriveService;
}): Promise<{ docUrl: string }> {
  const task = await getTaskRowOrThrow(input.brainlift.id, input.taskId);
  const existingDeliverable = await storage.getDeliverableByTaskId(input.taskId, input.brainlift.id);

  if (existingDeliverable) {
    throw new SprintStorageConflictError('A deliverable already exists for this task');
  }

  const plan = await getPlanForTaskOrThrow(input.brainlift.id, task.plan.id);
  const { drive, planFolderId } = await ensurePlanDriveFolder({
    brainlift: input.brainlift,
    plan,
    drive: input.drive,
  });

  const createdDoc = await drive.createGoogleDocFromMarkdown({
    parentFolderId: planFolderId,
    title: input.title,
    markdown: input.markdown,
  });

  try {
    const deliverable = await storage.createDeliverable({
      taskId: input.taskId,
      brainliftId: input.brainlift.id,
      title: input.title,
      docFileId: createdDoc.fileId,
      docUrl: createdDoc.docUrl,
      sourceSurface: input.sourceSurface,
      createdByUserId: input.userId,
    });

    await storage.markPlanCompleteIfAllDelivered(task.plan.id);

    return { docUrl: deliverable.docUrl };
  } catch (error) {
    try {
      await drive.deleteGoogleDoc(createdDoc.fileId);
    } catch (cleanupError) {
      console.error('[Sprints] Failed to clean up orphaned Google Doc:', cleanupError);
    }

    throw error;
  }
}

export async function readSprintDeliverable(input: {
  brainliftId: number;
  taskId: number;
  drive?: GoogleDriveService;
}): Promise<ReadDeliverableResponse> {
  await getTaskRowOrThrow(input.brainliftId, input.taskId);

  const deliverable = await storage.getDeliverableByTaskId(input.taskId, input.brainliftId);
  if (!deliverable) {
    throw new NotFoundError('Deliverable not found');
  }

  const drive = input.drive ?? getGoogleDriveService();
  const doc = await drive.exportGoogleDocAsMarkdown(deliverable.docFileId);

  return {
    title: doc.title || deliverable.title,
    contentMarkdown: doc.markdown,
    docUrl: doc.docUrl || deliverable.docUrl,
  };
}

export async function updateSprintDeliverable(input: {
  brainliftId: number;
  taskId: number;
  markdown: string;
  sourceSurface?: DeliverableSourceSurface;
  drive?: GoogleDriveService;
}): Promise<{ docUrl: string }> {
  await getTaskRowOrThrow(input.brainliftId, input.taskId);

  const deliverable = await storage.getDeliverableByTaskId(input.taskId, input.brainliftId);
  if (!deliverable) {
    throw new NotFoundError('Deliverable not found');
  }

  const drive = input.drive ?? getGoogleDriveService();
  await drive.replaceGoogleDocFromMarkdown(deliverable.docFileId, input.markdown);

  if (input.sourceSurface) {
    await setDeliverableSourceSurface(deliverable.id, input.brainliftId, input.sourceSurface);
  }

  return { docUrl: deliverable.docUrl };
}

export async function listSprintDeliverables(
  brainliftId: number,
  query: ListDeliverablesQuery,
): Promise<DeliverableListResponse> {
  const [plans, deliverables] = await Promise.all([
    listSprintPlansWithCounts(brainliftId),
    storage.listDeliverablesForBrainlift(brainliftId, { planId: query.planId }),
  ]);

  return { plans, deliverables };
}
