import {
  db,
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
  brainlifts,
  brainliftShares,
  deliverables,
  plans,
  platformConfig,
  tasks,
  user,
  type Deliverable,
  type DeliverableSourceSurface,
  type SprintPlan,
  type SprintPlanStatus,
  type SprintTask,
  type SprintTaskMilestone,
} from './base';
import { buildSprintDaySlots } from '../lib/sprintSchedule';

export interface SprintTaskListRow extends SprintTask {
  milestone: SprintTaskMilestone | null;
  isComplete: boolean;
  isPastDue: boolean;
  deliverable: {
    id: number;
    title: string;
    docUrl: string;
    createdAt: string;
  } | null;
}

export interface SprintTaskDetailRow extends SprintTaskListRow {
  plan: {
    id: number;
    startDate: string;
    endDate: string;
    status: SprintPlanStatus;
  };
}

export interface SprintDeliverableListRow {
  id: number;
  taskId: number | null;
  planId: number | null;
  title: string;
  taskTitle: string | null;
  scheduledDate: string | null;
  createdAt: string;
  docUrl: string;
}

export interface SprintDocumentListRow extends SprintDeliverableListRow {
  brainliftId: number;
  brainliftSlug: string;
  brainliftTitle: string;
}

export class SprintStorageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SprintStorageConflictError';
  }
}

type PgError = {
  code?: string;
  constraint?: string;
};

function isPgError(error: unknown): error is PgError {
  return !!error && typeof error === 'object';
}

function extractPgError(error: unknown): PgError | null {
  if (isPgError(error) && typeof error.code === 'string') return error;
  if (isPgError((error as any)?.cause) && typeof (error as any).cause.code === 'string') {
    return (error as any).cause as PgError;
  }
  return null;
}

function parseIsoDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return parsed;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return null;
  return trimmed;
}

function dedupeEmails(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = normalizeEmail(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

export async function getActivePlan(brainliftId: number): Promise<SprintPlan | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.brainliftId, brainliftId), eq(plans.status, 'active')))
    .orderBy(desc(plans.createdAt))
    .limit(1);

  return plan ?? null;
}

/**
 * Returns the plan that should be shown to the user right now — either an
 * in-flight `generating` plan or the `active` one. `failed`/`complete` plans
 * are not returned; they belong in history.
 */
export async function getCurrentPlan(brainliftId: number): Promise<SprintPlan | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(
      eq(plans.brainliftId, brainliftId),
      inArray(plans.status, ['active', 'generating']),
    ))
    .orderBy(desc(plans.createdAt))
    .limit(1);

  return plan ?? null;
}

export async function listPlans(brainliftId: number): Promise<SprintPlan[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.brainliftId, brainliftId))
    .orderBy(desc(plans.startDate), desc(plans.createdAt));
}

export async function createPlanWithTasks(input: {
  brainliftId: number;
  startDate: string;
  userId: string;
  tasks: Array<{
    scheduledDate: string;
    title: string;
    description: string;
    milestone?: SprintTaskMilestone | null;
  }>;
}): Promise<{ plan: SprintPlan; tasks: SprintTask[] }> {
  const sprintDaySlots = buildSprintDaySlots(input.startDate);
  const endDate = sprintDaySlots[sprintDaySlots.length - 1]?.scheduledDate;
  if (!endDate) {
    throw new Error('Sprint schedule did not produce an end date');
  }

  const sprintDaySlotByDate = new Map(
    sprintDaySlots.map((slot) => [slot.scheduledDate, slot] as const),
  );

  const taskRows = input.tasks.map((task) => {
    const scheduledDate = toIsoDate(parseIsoDate(task.scheduledDate, 'scheduledDate'));
    const slot = sprintDaySlotByDate.get(scheduledDate);
    if (!slot) {
      throw new Error(
        `Task scheduledDate ${task.scheduledDate} must be one of the sprint workdays between ${input.startDate}..${endDate}`,
      );
    }

    return {
      brainliftId: input.brainliftId,
      planId: 0,
      scheduledDate,
      weekNumber: slot.weekNumber,
      dayInWeek: slot.dayInWeek,
      title: task.title,
      description: task.description,
      milestone: task.milestone ?? null,
    };
  });

  try {
    return await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          brainliftId: input.brainliftId,
          startDate: input.startDate,
          endDate,
          status: 'active',
          createdByUserId: input.userId,
        })
        .returning();

      if (taskRows.length === 0) {
        return { plan, tasks: [] };
      }

      const insertedTasks = await tx
        .insert(tasks)
        .values(
          taskRows.map((task) => ({
            ...task,
            planId: plan.id,
          })),
        )
        .returning();

      insertedTasks.sort((a, b) => {
        if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
        return a.id - b.id;
      });

      return { plan, tasks: insertedTasks };
    });
  } catch (error) {
    const pgError = extractPgError(error);
    if (pgError?.code === '23505' && pgError.constraint === 'plans_one_active_per_brainlift_idx') {
      throw new SprintStorageConflictError('An active sprint plan already exists for this brainlift');
    }
    throw error;
  }
}

export async function createGeneratingPlan(input: {
  brainliftId: number;
  startDate: string;
  endDate: string;
  userId: string;
}): Promise<SprintPlan> {
  try {
    const [plan] = await db
      .insert(plans)
      .values({
        brainliftId: input.brainliftId,
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'generating',
        generationStartedAt: new Date(),
        createdByUserId: input.userId,
      })
      .returning();
    return plan;
  } catch (error) {
    const pgError = extractPgError(error);
    if (pgError?.code === '23505' && pgError.constraint === 'plans_one_active_per_brainlift_idx') {
      throw new SprintStorageConflictError('A sprint plan is already active or being generated for this brainlift');
    }
    throw error;
  }
}

export async function finalizeGeneratingPlan(input: {
  planId: number;
  brainliftId: number;
  startDate: string;
  tasks: Array<{
    scheduledDate: string;
    title: string;
    description: string;
    milestone?: SprintTaskMilestone | null;
  }>;
}): Promise<{ plan: SprintPlan; tasks: SprintTask[] }> {
  const sprintDaySlots = buildSprintDaySlots(input.startDate);
  const sprintDaySlotByDate = new Map(
    sprintDaySlots.map((slot) => [slot.scheduledDate, slot] as const),
  );

  const taskRows = input.tasks.map((task) => {
    const scheduledDate = toIsoDate(parseIsoDate(task.scheduledDate, 'scheduledDate'));
    const slot = sprintDaySlotByDate.get(scheduledDate);
    if (!slot) {
      throw new Error(
        `Task scheduledDate ${task.scheduledDate} is outside the sprint schedule starting ${input.startDate}`,
      );
    }
    return {
      brainliftId: input.brainliftId,
      planId: input.planId,
      scheduledDate,
      weekNumber: slot.weekNumber,
      dayInWeek: slot.dayInWeek,
      title: task.title,
      description: task.description,
      milestone: task.milestone ?? null,
    };
  });

  return db.transaction(async (tx) => {
    const [flipped] = await tx
      .update(plans)
      .set({ status: 'active', generationError: null })
      .where(and(
        eq(plans.id, input.planId),
        eq(plans.brainliftId, input.brainliftId),
        eq(plans.status, 'generating'),
      ))
      .returning();

    if (!flipped) {
      throw new SprintStorageConflictError(
        `Plan ${input.planId} is no longer in generating state; cannot finalize`,
      );
    }

    const insertedTasks = taskRows.length === 0
      ? []
      : await tx.insert(tasks).values(taskRows).returning();

    insertedTasks.sort((a, b) => {
      if (a.scheduledDate !== b.scheduledDate) return a.scheduledDate.localeCompare(b.scheduledDate);
      return a.id - b.id;
    });

    return { plan: flipped, tasks: insertedTasks };
  });
}

export async function markPlanGenerationFailed(input: {
  planId: number;
  brainliftId: number;
  errorMessage: string;
}): Promise<void> {
  await db
    .update(plans)
    .set({ status: 'failed', generationError: input.errorMessage })
    .where(and(
      eq(plans.id, input.planId),
      eq(plans.brainliftId, input.brainliftId),
      eq(plans.status, 'generating'),
    ));
}

/**
 * Flips any `generating` plans for the given brainlift whose generation
 * started before `olderThan` to `failed`. Used for lazy cleanup when a new
 * generation is requested and a prior one is stuck (worker crash, stranded
 * call, etc.). Returns the number of plans reclaimed.
 */
export async function reclaimStaleGeneratingPlans(input: {
  brainliftId: number;
  olderThan: Date;
}): Promise<number> {
  const result = await db
    .update(plans)
    .set({
      status: 'failed',
      generationError: 'Generation exceeded time budget; plan was reclaimed',
    })
    .where(and(
      eq(plans.brainliftId, input.brainliftId),
      eq(plans.status, 'generating'),
      sql`${plans.generationStartedAt} < ${input.olderThan.toISOString()}`,
    ))
    .returning({ id: plans.id });
  return result.length;
}

/**
 * Deletes a `failed` plan for this brainlift, if one exists. Called before a
 * fresh generation so a prior failure does not clutter history.
 */
export async function deleteFailedPlans(brainliftId: number): Promise<number> {
  const result = await db
    .delete(plans)
    .where(and(
      eq(plans.brainliftId, brainliftId),
      eq(plans.status, 'failed'),
    ))
    .returning({ id: plans.id });
  return result.length;
}

export async function listTasksForBrainlift(
  brainliftId: number,
  opts: {
    date?: string;
    week?: number;
    state?: 'all' | 'complete' | 'incomplete';
    includePastDue?: boolean;
    localDate?: string;
  } = {},
): Promise<SprintTaskListRow[]> {
  const activePlan = await getActivePlan(brainliftId);
  if (!activePlan) return [];

  if (opts.includePastDue && !opts.localDate) {
    throw new Error('localDate is required when includePastDue=true');
  }

  if (opts.date) parseIsoDate(opts.date, 'date');
  if (opts.localDate) parseIsoDate(opts.localDate, 'localDate');

  const referenceDate = opts.localDate ?? toIsoDate(new Date());
  const conditions = [
    eq(tasks.planId, activePlan.id),
    eq(tasks.brainliftId, brainliftId),
  ];

  if (opts.week != null) {
    conditions.push(eq(tasks.weekNumber, opts.week));
  }

  if (opts.includePastDue) {
    conditions.push(
      sql`(${tasks.scheduledDate} = ${opts.localDate!} OR (${tasks.scheduledDate} < ${opts.localDate!} AND ${deliverables.id} IS NULL))`,
    );
  } else if (opts.date) {
    conditions.push(eq(tasks.scheduledDate, opts.date));
  }

  if (opts.state === 'complete') {
    conditions.push(sql`${deliverables.id} IS NOT NULL`);
  } else if (opts.state === 'incomplete') {
    conditions.push(sql`${deliverables.id} IS NULL`);
  }

  const rows = await db
    .select({
      id: tasks.id,
      planId: tasks.planId,
      brainliftId: tasks.brainliftId,
      scheduledDate: tasks.scheduledDate,
      weekNumber: tasks.weekNumber,
      dayInWeek: tasks.dayInWeek,
      title: tasks.title,
      description: tasks.description,
      milestone: tasks.milestone,
      deliverableId: deliverables.id,
      deliverableTitle: deliverables.title,
      deliverableDocUrl: deliverables.docUrl,
      deliverableCreatedAt: deliverables.createdAt,
    })
    .from(tasks)
    .leftJoin(deliverables, eq(deliverables.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.scheduledDate), asc(tasks.id));

  return rows.map((row) => {
    const hasDeliverable = row.deliverableId != null;
    return {
      id: row.id,
      planId: row.planId,
      brainliftId: row.brainliftId,
      scheduledDate: row.scheduledDate,
      weekNumber: row.weekNumber,
      dayInWeek: row.dayInWeek,
      title: row.title,
      description: row.description,
      milestone: row.milestone ?? null,
      isComplete: hasDeliverable,
      isPastDue: !hasDeliverable && row.scheduledDate < referenceDate,
      deliverable: hasDeliverable
        ? {
            id: row.deliverableId!,
            title: row.deliverableTitle!,
            docUrl: row.deliverableDocUrl!,
            createdAt: row.deliverableCreatedAt!.toISOString(),
          }
        : null,
    };
  });
}

/**
 * Lists tasks across every active sprint plan belonging to brainlifts the user can access
 * (owned or shared). Same filter shape as listTasksForBrainlift. Each row carries the
 * brainlift slug and title so cross-brainlift callers can render context per task.
 */
export async function listTasksForUser(
  userId: string,
  opts: {
    date?: string;
    week?: number;
    state?: 'all' | 'complete' | 'incomplete';
    includePastDue?: boolean;
    localDate?: string;
  } = {},
): Promise<Array<SprintTaskListRow & { brainliftSlug: string; brainliftTitle: string }>> {
  if (opts.includePastDue && !opts.localDate) {
    throw new Error('localDate is required when includePastDue=true');
  }
  if (opts.date) parseIsoDate(opts.date, 'date');
  if (opts.localDate) parseIsoDate(opts.localDate, 'localDate');

  const referenceDate = opts.localDate ?? toIsoDate(new Date());

  const conditions = [
    eq(plans.status, 'active' as SprintPlanStatus),
    sql`(
      ${brainlifts.createdByUserId} = ${userId}
      OR EXISTS (
        SELECT 1 FROM ${brainliftShares}
        WHERE ${brainliftShares.brainliftId} = ${brainlifts.id}
          AND ${brainliftShares.userId} = ${userId}
          AND ${brainliftShares.type} = 'user'
      )
    )`,
  ];

  if (opts.week != null) {
    conditions.push(eq(tasks.weekNumber, opts.week));
  }

  if (opts.includePastDue) {
    conditions.push(
      sql`(${tasks.scheduledDate} = ${opts.localDate!} OR (${tasks.scheduledDate} < ${opts.localDate!} AND ${deliverables.id} IS NULL))`,
    );
  } else if (opts.date) {
    conditions.push(eq(tasks.scheduledDate, opts.date));
  }

  if (opts.state === 'complete') {
    conditions.push(sql`${deliverables.id} IS NOT NULL`);
  } else if (opts.state === 'incomplete') {
    conditions.push(sql`${deliverables.id} IS NULL`);
  }

  const rows = await db
    .select({
      id: tasks.id,
      planId: tasks.planId,
      brainliftId: tasks.brainliftId,
      brainliftSlug: brainlifts.slug,
      brainliftTitle: brainlifts.title,
      scheduledDate: tasks.scheduledDate,
      weekNumber: tasks.weekNumber,
      dayInWeek: tasks.dayInWeek,
      title: tasks.title,
      description: tasks.description,
      milestone: tasks.milestone,
      deliverableId: deliverables.id,
      deliverableTitle: deliverables.title,
      deliverableDocUrl: deliverables.docUrl,
      deliverableCreatedAt: deliverables.createdAt,
    })
    .from(tasks)
    .innerJoin(plans, eq(plans.id, tasks.planId))
    .innerJoin(brainlifts, eq(brainlifts.id, tasks.brainliftId))
    .leftJoin(deliverables, eq(deliverables.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.scheduledDate), asc(brainlifts.slug), asc(tasks.id));

  return rows.map((row) => {
    const hasDeliverable = row.deliverableId != null;
    return {
      id: row.id,
      planId: row.planId,
      brainliftId: row.brainliftId,
      brainliftSlug: row.brainliftSlug,
      brainliftTitle: row.brainliftTitle,
      scheduledDate: row.scheduledDate,
      weekNumber: row.weekNumber,
      dayInWeek: row.dayInWeek,
      title: row.title,
      description: row.description,
      milestone: row.milestone ?? null,
      isComplete: hasDeliverable,
      isPastDue: !hasDeliverable && row.scheduledDate < referenceDate,
      deliverable: hasDeliverable
        ? {
            id: row.deliverableId!,
            title: row.deliverableTitle!,
            docUrl: row.deliverableDocUrl!,
            createdAt: row.deliverableCreatedAt!.toISOString(),
          }
        : null,
    };
  });
}

export async function getTaskForBrainlift(taskId: number, brainliftId: number): Promise<SprintTaskDetailRow | null> {
  const [row] = await db
    .select({
      id: tasks.id,
      planId: tasks.planId,
      brainliftId: tasks.brainliftId,
      scheduledDate: tasks.scheduledDate,
      weekNumber: tasks.weekNumber,
      dayInWeek: tasks.dayInWeek,
      title: tasks.title,
      description: tasks.description,
      milestone: tasks.milestone,
      planStartDate: plans.startDate,
      planEndDate: plans.endDate,
      planStatus: plans.status,
      deliverableId: deliverables.id,
      deliverableTitle: deliverables.title,
      deliverableDocUrl: deliverables.docUrl,
      deliverableCreatedAt: deliverables.createdAt,
    })
    .from(tasks)
    .innerJoin(plans, eq(tasks.planId, plans.id))
    .leftJoin(deliverables, eq(deliverables.taskId, tasks.id))
    .where(and(eq(tasks.id, taskId), eq(tasks.brainliftId, brainliftId)))
    .limit(1);

  if (!row) return null;

  const referenceDate = toIsoDate(new Date());
  const hasDeliverable = row.deliverableId != null;

  return {
    id: row.id,
    planId: row.planId,
    brainliftId: row.brainliftId,
    scheduledDate: row.scheduledDate,
    weekNumber: row.weekNumber,
    dayInWeek: row.dayInWeek,
    title: row.title,
    description: row.description,
    milestone: row.milestone ?? null,
    isComplete: hasDeliverable,
    isPastDue: !hasDeliverable && row.scheduledDate < referenceDate,
    deliverable: hasDeliverable
      ? {
          id: row.deliverableId!,
          title: row.deliverableTitle!,
          docUrl: row.deliverableDocUrl!,
          createdAt: row.deliverableCreatedAt!.toISOString(),
        }
      : null,
    plan: {
      id: row.planId,
      startDate: row.planStartDate,
      endDate: row.planEndDate,
      status: row.planStatus,
    },
  };
}

export async function getDeliverableByTaskId(taskId: number, brainliftId: number): Promise<Deliverable | null> {
  const [record] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.taskId, taskId), eq(deliverables.brainliftId, brainliftId)))
    .limit(1);

  return record ?? null;
}

export async function getDeliverableByIdForBrainlift(deliverableId: number, brainliftId: number): Promise<Deliverable | null> {
  const [record] = await db
    .select()
    .from(deliverables)
    .where(and(eq(deliverables.id, deliverableId), eq(deliverables.brainliftId, brainliftId)))
    .limit(1);

  return record ?? null;
}

export async function createDeliverable(input: {
  taskId?: number | null;
  brainliftId: number;
  title: string;
  docFileId: string;
  docUrl: string;
  sourceSurface: DeliverableSourceSurface;
  createdByUserId: string;
}): Promise<Deliverable> {
  try {
    const [created] = await db
      .insert(deliverables)
      .values({
        taskId: input.taskId,
        brainliftId: input.brainliftId,
        title: input.title,
        docFileId: input.docFileId,
        docUrl: input.docUrl,
        sourceSurface: input.sourceSurface,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return created;
  } catch (error) {
    const pgError = extractPgError(error);
    if (pgError?.code === '23505') {
      throw new SprintStorageConflictError('A deliverable already exists for this task');
    }
    throw error;
  }
}

export async function setDeliverableSourceSurface(
  deliverableId: number,
  brainliftId: number,
  sourceSurface: DeliverableSourceSurface,
): Promise<void> {
  await db
    .update(deliverables)
    .set({ sourceSurface })
    .where(and(
      eq(deliverables.id, deliverableId),
      eq(deliverables.brainliftId, brainliftId),
    ));
}

export async function listDeliverablesForBrainlift(
  brainliftId: number,
  opts: { planId?: number; scope?: 'plan' | 'hub' } = {},
): Promise<SprintDeliverableListRow[]> {
  const conditions = [eq(deliverables.brainliftId, brainliftId)];

  if (opts.planId != null) {
    conditions.push(eq(tasks.planId, opts.planId));
  }
  if (opts.scope === 'plan') {
    conditions.push(isNotNull(deliverables.taskId));
  } else if (opts.scope === 'hub') {
    conditions.push(isNull(deliverables.taskId));
  }

  const rows = await db
    .select({
      id: deliverables.id,
      taskId: deliverables.taskId,
      planId: tasks.planId,
      title: deliverables.title,
      taskTitle: tasks.title,
      scheduledDate: tasks.scheduledDate,
      createdAt: deliverables.createdAt,
      docUrl: deliverables.docUrl,
    })
    .from(deliverables)
    .leftJoin(tasks, eq(deliverables.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(desc(deliverables.createdAt), desc(deliverables.id));

  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    planId: row.planId ?? null,
    title: row.title,
    taskTitle: row.taskTitle ?? null,
    scheduledDate: row.scheduledDate ?? null,
    createdAt: row.createdAt.toISOString(),
    docUrl: row.docUrl,
  }));
}

const DOCUMENTS_PAGE_SIZE = 30;

function buildDocumentAccessCondition(userId: string, isAdmin: boolean | undefined) {
  if (isAdmin) return sql`TRUE`;

  return sql`(
    ${brainlifts.createdByUserId} = ${userId}
    OR EXISTS (
      SELECT 1 FROM ${brainliftShares}
      WHERE ${brainliftShares.brainliftId} = ${brainlifts.id}
        AND ${brainliftShares.userId} = ${userId}
        AND ${brainliftShares.type} = 'user'
    )
  )`;
}

export async function listDocuments(input: {
  userId: string;
  isAdmin?: boolean;
  brainliftId?: number;
  brainliftSlug?: string;
  taskId?: number;
  q?: string;
  sort?: 'createdAt' | 'title';
  order?: 'asc' | 'desc';
  page?: number;
}): Promise<{ documents: SprintDocumentListRow[]; page: number; pageSize: 30; total: number }> {
  const page = Math.max(1, input.page ?? 1);
  const order = input.order ?? 'desc';
  const sort = input.sort ?? 'createdAt';
  const conditions = [buildDocumentAccessCondition(input.userId, input.isAdmin)];

  if (input.brainliftId != null) {
    conditions.push(eq(deliverables.brainliftId, input.brainliftId));
  }
  if (input.brainliftSlug) {
    conditions.push(eq(brainlifts.slug, input.brainliftSlug));
  }
  if (input.taskId != null) {
    conditions.push(eq(deliverables.taskId, input.taskId));
  }
  if (input.q) {
    conditions.push(sql`lower(${deliverables.title}) LIKE ${`%${input.q.toLowerCase()}%`}`);
  }

  const direction = order === 'asc' ? asc : desc;
  const sortColumn = sort === 'title' ? deliverables.title : deliverables.createdAt;
  const tieBreaker = order === 'asc' ? asc(deliverables.id) : desc(deliverables.id);

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)` })
    .from(deliverables)
    .innerJoin(brainlifts, eq(brainlifts.id, deliverables.brainliftId))
    .leftJoin(tasks, eq(deliverables.taskId, tasks.id))
    .where(and(...conditions));

  const rows = await db
    .select({
      id: deliverables.id,
      brainliftId: deliverables.brainliftId,
      brainliftSlug: brainlifts.slug,
      brainliftTitle: brainlifts.title,
      taskId: deliverables.taskId,
      planId: tasks.planId,
      title: deliverables.title,
      taskTitle: tasks.title,
      scheduledDate: tasks.scheduledDate,
      createdAt: deliverables.createdAt,
      docUrl: deliverables.docUrl,
    })
    .from(deliverables)
    .innerJoin(brainlifts, eq(brainlifts.id, deliverables.brainliftId))
    .leftJoin(tasks, eq(deliverables.taskId, tasks.id))
    .where(and(...conditions))
    .orderBy(direction(sortColumn), tieBreaker)
    .limit(DOCUMENTS_PAGE_SIZE)
    .offset((page - 1) * DOCUMENTS_PAGE_SIZE);

  return {
    documents: rows.map((row) => ({
      id: row.id,
      brainliftId: row.brainliftId,
      brainliftSlug: row.brainliftSlug,
      brainliftTitle: row.brainliftTitle,
      taskId: row.taskId,
      planId: row.planId ?? null,
      title: row.title,
      taskTitle: row.taskTitle ?? null,
      scheduledDate: row.scheduledDate ?? null,
      createdAt: row.createdAt.toISOString(),
      docUrl: row.docUrl,
    })),
    page,
    pageSize: DOCUMENTS_PAGE_SIZE,
    total: Number(totalRow?.total ?? 0),
  };
}

export async function markPlanCompleteIfAllDelivered(planId: number): Promise<SprintPlanStatus> {
  return db.transaction(async (tx) => {
    const [counts] = await tx
      .select({
        totalTasks: sql<number>`count(${tasks.id})`,
        deliveredTasks: sql<number>`count(${deliverables.id})`,
      })
      .from(tasks)
      .leftJoin(deliverables, eq(deliverables.taskId, tasks.id))
      .where(eq(tasks.planId, planId));

    if (Number(counts.totalTasks) > 0 && Number(counts.totalTasks) === Number(counts.deliveredTasks)) {
      await tx
        .update(plans)
        .set({ status: 'complete' })
        .where(eq(plans.id, planId));
    }

    const [plan] = await tx
      .select({ status: plans.status })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    return plan.status;
  });
}

export async function setPlanGdriveFolder(planId: number, folderId: string): Promise<void> {
  await db
    .update(plans)
    .set({ gdriveFolderId: folderId })
    .where(eq(plans.id, planId));
}

export async function setBrainliftGdriveRootFolder(brainliftId: number, folderId: string): Promise<void> {
  await db
    .update(brainlifts)
    .set({ gdriveRootFolderId: folderId })
    .where(eq(brainlifts.id, brainliftId));
}

export async function getSprintSharingAudience(brainliftId: number): Promise<{
  ownerEmail: string;
  ownerName: string | null;
  editorEmails: string[];
  guideEmails: string[];
}> {
  const [brainliftRow] = await db
    .select({
      ownerEmail: user.email,
      ownerName: user.name,
    })
    .from(brainlifts)
    .leftJoin(user, eq(brainlifts.createdByUserId, user.id))
    .where(eq(brainlifts.id, brainliftId))
    .limit(1);

  if (!brainliftRow) {
    throw new Error('Brainlift not found');
  }

  const ownerEmail = normalizeEmail(brainliftRow.ownerEmail);
  if (!ownerEmail) {
    throw new Error('Brainlift owner email is required for sprint sharing');
  }

  const editorRows = await db
    .select({ email: user.email })
    .from(brainliftShares)
    .innerJoin(user, eq(brainliftShares.userId, user.id))
    .where(and(
      eq(brainliftShares.brainliftId, brainliftId),
      eq(brainliftShares.type, 'user'),
      eq(brainliftShares.permission, 'editor'),
    ));

  const configRows = await db
    .select({ value: platformConfig.value })
    .from(platformConfig)
    .where(inArray(platformConfig.key, ['autoShareEmails', 'auto_share_emails']));

  const guideCandidateValues: Array<string | null | undefined> = [];
  for (const row of configRows) {
    if (!Array.isArray(row.value)) continue;
    for (const value of row.value) {
      if (typeof value === 'string') {
        guideCandidateValues.push(value);
      }
    }
  }

  const editorEmails = dedupeEmails(editorRows.map((row) => row.email)).filter((email) => email !== ownerEmail);
  const guideEmails = dedupeEmails(guideCandidateValues).filter((email) => email !== ownerEmail);

  return {
    ownerEmail,
    ownerName: brainliftRow.ownerName ?? null,
    editorEmails,
    guideEmails,
  };
}
