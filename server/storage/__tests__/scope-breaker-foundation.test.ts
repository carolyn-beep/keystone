import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  brainlifts,
  brainliftShares,
  deliverables,
  plans,
  platformConfig,
  tasks,
  user,
} from '@shared/schema';
import { deleteBrainlift } from '../brainlifts';
import {
  createDeliverable,
  createPlanWithTasks,
  getSprintSharingAudience,
  getTaskForBrainlift,
  listPlans,
  listTasksForBrainlift,
  markPlanCompleteIfAllDelivered,
  SprintStorageConflictError,
} from '../sprints';

const createdBrainliftIds: number[] = [];
const createdUserIds: string[] = [];

const TEST_USER_OWNER = `scope-owner-${Date.now()}`;
const TEST_USER_EDITOR = `scope-editor-${Date.now()}`;
const TEST_USER_OTHER = `scope-other-${Date.now()}`;

const DEFAULT_SUMMARY = {
  totalFacts: 0,
  meanScore: '0',
  score5Count: 0,
  contradictionCount: 0,
};

async function insertUser(id: string, email: string, name: string): Promise<void> {
  await db.insert(user).values({
    id,
    email,
    name,
    emailVerified: false,
  });
  createdUserIds.push(id);
}

async function insertBrainlift(ownerUserId: string, label: string): Promise<number> {
  const [row] = await db
    .insert(brainlifts)
    .values({
      slug: `scope-breaker-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Scope Breaker ${label}`,
      description: `Scope breaker test brainlift ${label}`,
      summary: DEFAULT_SUMMARY,
      createdByUserId: ownerUserId,
    })
    .returning({ id: brainlifts.id });

  createdBrainliftIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  await insertUser(TEST_USER_OWNER, `owner-${Date.now()}@scope.test`, 'Scope Owner');
  await insertUser(TEST_USER_EDITOR, `editor-${Date.now()}@scope.test`, 'Scope Editor');
  await insertUser(TEST_USER_OTHER, `other-${Date.now()}@scope.test`, 'Scope Other');
});

beforeEach(async () => {
  await db.delete(platformConfig).where(eq(platformConfig.key, 'autoShareEmails')).catch(() => {});
  await db.delete(platformConfig).where(eq(platformConfig.key, 'auto_share_emails')).catch(() => {});
});

afterAll(async () => {
  await db.delete(platformConfig).where(eq(platformConfig.key, 'autoShareEmails')).catch(() => {});
  await db.delete(platformConfig).where(eq(platformConfig.key, 'auto_share_emails')).catch(() => {});

  for (const id of createdBrainliftIds) {
    await deleteBrainlift(id).catch(() => {});
  }

  for (const id of createdUserIds) {
    await db.delete(user).where(eq(user.id, id)).catch(() => {});
  }
});

describe('scope breaker storage foundation', () => {
  it('derives week/day values across a 30-workday sprint window (FR1)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'week-day');
    const result = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-01-05',
      userId: TEST_USER_OWNER,
      tasks: [
        { scheduledDate: '2026-01-05', title: 'Day 1', description: 'd1' },
        { scheduledDate: '2026-01-09', title: 'Day 5', description: 'd5' },
        { scheduledDate: '2026-01-12', title: 'Day 6', description: 'd6' },
        { scheduledDate: '2026-02-13', title: 'Day 30', description: 'd30' },
      ],
    });

    expect(result.plan.endDate).toBe('2026-02-13');
    expect(result.tasks.map((task) => task.weekNumber)).toEqual([1, 1, 2, 6]);
    expect(result.tasks.map((task) => task.dayInWeek)).toEqual([1, 5, 1, 5]);
  });

  it('rejects tasks scheduled on non-working days', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'weekend-task');

    await expect(
      createPlanWithTasks({
        brainliftId,
        startDate: '2026-01-05',
        userId: TEST_USER_OWNER,
        tasks: [{ scheduledDate: '2026-01-10', title: 'Weekend task', description: 'desc' }],
      }),
    ).rejects.toThrow('must be one of the sprint workdays');
  });

  it('enforces one active plan per brainlift (FR1)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'unique-active');
    await createPlanWithTasks({
      brainliftId,
      startDate: '2026-02-02',
      userId: TEST_USER_OWNER,
      tasks: [{ scheduledDate: '2026-02-02', title: 'T1', description: 'desc' }],
    });

    await expect(
      createPlanWithTasks({
        brainliftId,
        startDate: '2026-03-02',
        userId: TEST_USER_OWNER,
        tasks: [{ scheduledDate: '2026-03-02', title: 'T2', description: 'desc' }],
      }),
    ).rejects.toBeInstanceOf(SprintStorageConflictError);
  });

  it('enforces one deliverable per task (FR1)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'deliverable-unique');
    const { tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-02-02',
      userId: TEST_USER_OWNER,
      tasks: [{ scheduledDate: '2026-02-02', title: 'Task', description: 'desc' }],
    });
    const task = createdTasks[0];

    await createDeliverable({
      taskId: task.id,
      brainliftId,
      title: 'Deliverable',
      docFileId: 'doc-1',
      docUrl: 'https://docs.google.com/document/d/doc-1/edit',
      sourceSurface: 'ui',
      createdByUserId: TEST_USER_OWNER,
    });

    await expect(
      createDeliverable({
        taskId: task.id,
        brainliftId,
        title: 'Second',
        docFileId: 'doc-2',
        docUrl: 'https://docs.google.com/document/d/doc-2/edit',
        sourceSurface: 'mcp',
        createdByUserId: TEST_USER_OWNER,
      }),
    ).rejects.toBeInstanceOf(SprintStorageConflictError);
  });

  it('supports task filters, includePastDue, and derived completion flags (FR2)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'task-filters');
    const { tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-02-02',
      userId: TEST_USER_OWNER,
      tasks: [
        { scheduledDate: '2026-02-02', title: 'Past complete', description: 'desc' },
        { scheduledDate: '2026-02-03', title: 'Past overdue', description: 'desc' },
        { scheduledDate: '2026-02-05', title: 'Today', description: 'desc' },
      ],
    });

    await createDeliverable({
      taskId: createdTasks[0].id,
      brainliftId,
      title: 'Done',
      docFileId: 'doc-done',
      docUrl: 'https://docs.google.com/document/d/doc-done/edit',
      sourceSurface: 'ui',
      createdByUserId: TEST_USER_OWNER,
    });

    const todayAndPastDue = await listTasksForBrainlift(brainliftId, {
      includePastDue: true,
      localDate: '2026-02-05',
    });

    expect(todayAndPastDue.map((task) => task.title)).toEqual(['Past overdue', 'Today']);
    expect(todayAndPastDue.map((task) => task.isPastDue)).toEqual([true, false]);
    expect(todayAndPastDue.every((task) => !task.isComplete)).toBe(true);

    const completeOnly = await listTasksForBrainlift(brainliftId, { state: 'complete' });
    expect(completeOnly).toHaveLength(1);
    expect(completeOnly[0].title).toBe('Past complete');
    expect(completeOnly[0].deliverable?.docUrl).toContain('doc-done');
  });

  it('returns null for task lookup when brainlift id does not match (IDOR safety, FR2)', async () => {
    const brainliftA = await insertBrainlift(TEST_USER_OWNER, 'idor-a');
    const brainliftB = await insertBrainlift(TEST_USER_OWNER, 'idor-b');

    const { tasks: tasksA } = await createPlanWithTasks({
      brainliftId: brainliftA,
      startDate: '2026-03-02',
      userId: TEST_USER_OWNER,
      tasks: [{ scheduledDate: '2026-03-02', title: 'Scoped task', description: 'desc' }],
    });

    const crossLookup = await getTaskForBrainlift(tasksA[0].id, brainliftB);
    expect(crossLookup).toBeNull();
  });

  it('marks plan complete only when all tasks have deliverables (FR2)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'plan-complete');
    const { plan, tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-04-01',
      userId: TEST_USER_OWNER,
      tasks: [
        { scheduledDate: '2026-04-02', title: 'Task A', description: 'desc' },
        { scheduledDate: '2026-04-03', title: 'Task B', description: 'desc' },
      ],
    });

    await createDeliverable({
      taskId: createdTasks[0].id,
      brainliftId,
      title: 'A',
      docFileId: 'doc-a',
      docUrl: 'https://docs.google.com/document/d/doc-a/edit',
      sourceSurface: 'ui',
      createdByUserId: TEST_USER_OWNER,
    });

    await expect(markPlanCompleteIfAllDelivered(plan.id)).resolves.toBe('active');

    await createDeliverable({
      taskId: createdTasks[1].id,
      brainliftId,
      title: 'B',
      docFileId: 'doc-b',
      docUrl: 'https://docs.google.com/document/d/doc-b/edit',
      sourceSurface: 'mcp',
      createdByUserId: TEST_USER_OWNER,
    });

    await expect(markPlanCompleteIfAllDelivered(plan.id)).resolves.toBe('complete');

    const planHistory = await listPlans(brainliftId);
    expect(planHistory[0].status).toBe('complete');
  });

  it('resolves owner, explicit editors, and guide auto-share audience with dedupe (FR3)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'audience');

    await db.insert(brainliftShares).values([
      {
        brainliftId,
        type: 'user',
        permission: 'editor',
        userId: TEST_USER_EDITOR,
        token: null,
        createdByUserId: TEST_USER_OWNER,
      },
      {
        brainliftId,
        type: 'token',
        permission: 'editor',
        userId: null,
        token: `share-${Date.now()}`,
        createdByUserId: TEST_USER_OWNER,
      },
    ]);

    const ownerRecord = await db.select({ email: user.email }).from(user).where(eq(user.id, TEST_USER_OWNER));
    const ownerEmail = ownerRecord[0].email;

    await db.insert(platformConfig).values({
      key: 'autoShareEmails',
      value: ['Guide@One.com', 'guide@one.com', ownerEmail],
    });

    const audience = await getSprintSharingAudience(brainliftId);
    expect(audience.ownerEmail).toBe(ownerEmail.toLowerCase());
    expect(audience.editorEmails).toHaveLength(1);
    expect(audience.editorEmails[0]).toContain('@scope.test');
    expect(audience.guideEmails).toEqual(['guide@one.com']);
  });

  it('cascades sprint rows when deleting a brainlift (FR1)', async () => {
    const brainliftId = await insertBrainlift(TEST_USER_OWNER, 'cascade');
    const { tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-05-01',
      userId: TEST_USER_OWNER,
      tasks: [{ scheduledDate: '2026-05-01', title: 'Task', description: 'desc' }],
    });

    await createDeliverable({
      taskId: createdTasks[0].id,
      brainliftId,
      title: 'Deliverable',
      docFileId: 'doc-cascade',
      docUrl: 'https://docs.google.com/document/d/doc-cascade/edit',
      sourceSurface: 'ui',
      createdByUserId: TEST_USER_OWNER,
    });

    await deleteBrainlift(brainliftId);

    const [remainingPlans, remainingTasks, remainingDeliverables] = await Promise.all([
      db.select().from(plans).where(eq(plans.brainliftId, brainliftId)),
      db.select().from(tasks).where(eq(tasks.brainliftId, brainliftId)),
      db.select().from(deliverables).where(eq(deliverables.brainliftId, brainliftId)),
    ]);

    expect(remainingPlans).toHaveLength(0);
    expect(remainingTasks).toHaveLength(0);
    expect(remainingDeliverables).toHaveLength(0);
  });
});
