import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { brainlifts, brainliftShares, user } from '@shared/schema';
import { deleteBrainlift } from '../brainlifts';
import {
  createDeliverable,
  createPlanWithTasks,
  listDocuments,
  listDeliverablesForBrainlift,
  listTasksForBrainlift,
  markPlanCompleteIfAllDelivered,
} from '../sprints';

const createdBrainliftIds: number[] = [];
const createdUserIds: string[] = [];

const OWNER_ID = `scope-sprints-owner-${Date.now()}`;

const DEFAULT_SUMMARY = {
  totalFacts: 0,
  meanScore: '0',
  score5Count: 0,
  contradictionCount: 0,
};

async function insertUser(id: string, email: string): Promise<void> {
  await db.insert(user).values({
    id,
    email,
    name: id,
    emailVerified: false,
  });
  createdUserIds.push(id);
}

async function insertBrainlift(label: string, ownerId = OWNER_ID): Promise<number> {
  const [row] = await db
    .insert(brainlifts)
    .values({
      slug: `scope-sprints-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Scope Sprint ${label}`,
      description: `Scope sprint brainlift ${label}`,
      summary: DEFAULT_SUMMARY,
      createdByUserId: ownerId,
    })
    .returning({ id: brainlifts.id });

  createdBrainliftIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  await insertUser(OWNER_ID, `scope-sprints-owner-${Date.now()}@scope.test`);
  await insertUser(`${OWNER_ID}-other`, `scope-sprints-other-${Date.now()}@scope.test`);
});

afterAll(async () => {
  for (const brainliftId of createdBrainliftIds) {
    await deleteBrainlift(brainliftId).catch(() => {});
  }

  for (const userId of createdUserIds) {
    await db.delete(user).where(eq(user.id, userId)).catch(() => {});
  }
});

describe('sprints storage queries', () => {
  it('lists deliverables across plans and filters by planId', async () => {
    const brainliftId = await insertBrainlift('deliverables-by-plan');

    const { plan: planA, tasks: planATasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-04-01',
      userId: OWNER_ID,
      tasks: [
        { scheduledDate: '2026-04-01', title: 'A1', description: 'A1 desc' },
        { scheduledDate: '2026-04-02', title: 'A2', description: 'A2 desc' },
      ],
    });

    for (const task of planATasks) {
      await createDeliverable({
        taskId: task.id,
        brainliftId,
        title: `${task.title} Deliverable`,
        docFileId: `doc-${task.id}`,
        docUrl: `https://docs.google.com/document/d/doc-${task.id}/edit`,
        sourceSurface: 'ui',
        createdByUserId: OWNER_ID,
      });
    }
    await markPlanCompleteIfAllDelivered(planA.id);

    const { plan: planB, tasks: planBTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-05-01',
      userId: OWNER_ID,
      tasks: [
        { scheduledDate: '2026-05-01', title: 'B1', description: 'B1 desc' },
      ],
    });

    await createDeliverable({
      taskId: planBTasks[0].id,
      brainliftId,
      title: 'B1 Deliverable',
      docFileId: 'doc-b1',
      docUrl: 'https://docs.google.com/document/d/doc-b1/edit',
      sourceSurface: 'mcp',
      createdByUserId: OWNER_ID,
    });
    await markPlanCompleteIfAllDelivered(planB.id);

    const allDeliverables = await listDeliverablesForBrainlift(brainliftId);
    const planADeliverables = await listDeliverablesForBrainlift(brainliftId, { planId: planA.id });
    const planBDeliverables = await listDeliverablesForBrainlift(brainliftId, { planId: planB.id });

    expect(allDeliverables).toHaveLength(3);
    expect(planADeliverables).toHaveLength(2);
    expect(planBDeliverables).toHaveLength(1);
    expect(planADeliverables.every((row) => row.planId === planA.id)).toBe(true);
    expect(planBDeliverables.every((row) => row.planId === planB.id)).toBe(true);
  });

  it('lists hub deliverables with nullable task metadata and preserves task uniqueness', async () => {
    const brainliftId = await insertBrainlift('hub-deliverables');

    const { plan, tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-07-01',
      userId: OWNER_ID,
      tasks: [
        { scheduledDate: '2026-07-01', title: 'Task doc', description: 'Task desc' },
      ],
    });

    await createDeliverable({
      taskId: createdTasks[0].id,
      brainliftId,
      title: 'Task Deliverable',
      docFileId: 'doc-task',
      docUrl: 'https://docs.google.com/document/d/doc-task/edit',
      sourceSurface: 'ui',
      createdByUserId: OWNER_ID,
    });
    await createDeliverable({
      taskId: null,
      brainliftId,
      title: 'Hub Note',
      docFileId: 'doc-hub-1',
      docUrl: 'https://docs.google.com/document/d/doc-hub-1/edit',
      sourceSurface: 'mcp',
      createdByUserId: OWNER_ID,
    });
    await createDeliverable({
      taskId: null,
      brainliftId,
      title: 'Hub Note',
      docFileId: 'doc-hub-2',
      docUrl: 'https://docs.google.com/document/d/doc-hub-2/edit',
      sourceSurface: 'mcp',
      createdByUserId: OWNER_ID,
    });

    await expect(createDeliverable({
      taskId: createdTasks[0].id,
      brainliftId,
      title: 'Duplicate Task Deliverable',
      docFileId: 'doc-task-duplicate',
      docUrl: 'https://docs.google.com/document/d/doc-task-duplicate/edit',
      sourceSurface: 'ui',
      createdByUserId: OWNER_ID,
    })).rejects.toThrow('A deliverable already exists for this task');

    const allDeliverables = await listDeliverablesForBrainlift(brainliftId);
    const planDeliverables = await listDeliverablesForBrainlift(brainliftId, { planId: plan.id });
    const scopedPlanDeliverables = await listDeliverablesForBrainlift(brainliftId, { scope: 'plan' });
    const hubDeliverables = await listDeliverablesForBrainlift(brainliftId, { scope: 'hub' });

    expect(allDeliverables).toHaveLength(3);
    expect(planDeliverables).toHaveLength(1);
    expect(scopedPlanDeliverables).toHaveLength(1);
    expect(scopedPlanDeliverables[0].taskId).toBe(createdTasks[0].id);
    expect(hubDeliverables).toHaveLength(2);
    expect(hubDeliverables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        taskId: null,
        planId: null,
        taskTitle: null,
        scheduledDate: null,
      }),
    ]));
  });

  it('lists documents across owned and explicitly shared Brainlifts with filters and pagination', async () => {
    const otherOwnerId = `${OWNER_ID}-other`;
    const ownedBrainliftId = await insertBrainlift('owned-documents');
    const sharedBrainliftId = await insertBrainlift('shared-documents', otherOwnerId);
    const privateBrainliftId = await insertBrainlift('private-documents', otherOwnerId);

    await db.insert(brainliftShares).values({
      brainliftId: sharedBrainliftId,
      type: 'user',
      permission: 'viewer',
      userId: OWNER_ID,
      createdByUserId: otherOwnerId,
    });

    for (let index = 1; index <= 31; index += 1) {
      await createDeliverable({
        taskId: null,
        brainliftId: ownedBrainliftId,
        title: `Owned Alpha ${String(index).padStart(2, '0')}`,
        docFileId: `owned-alpha-${index}`,
        docUrl: `https://docs.google.com/document/d/owned-alpha-${index}/edit`,
        sourceSurface: 'mcp',
        createdByUserId: OWNER_ID,
      });
    }

    await createDeliverable({
      taskId: null,
      brainliftId: sharedBrainliftId,
      title: 'Shared Beta',
      docFileId: 'shared-beta',
      docUrl: 'https://docs.google.com/document/d/shared-beta/edit',
      sourceSurface: 'mcp',
      createdByUserId: otherOwnerId,
    });
    await createDeliverable({
      taskId: null,
      brainliftId: privateBrainliftId,
      title: 'Private Gamma',
      docFileId: 'private-gamma',
      docUrl: 'https://docs.google.com/document/d/private-gamma/edit',
      sourceSurface: 'mcp',
      createdByUserId: otherOwnerId,
    });

    const userDocuments = await listDocuments({
      userId: OWNER_ID,
      q: 'alpha',
      sort: 'title',
      order: 'asc',
      page: 2,
    });
    const inaccessibleFilter = await listDocuments({
      userId: OWNER_ID,
      brainliftId: privateBrainliftId,
    });
    const adminDocuments = await listDocuments({
      userId: OWNER_ID,
      isAdmin: true,
      brainliftId: privateBrainliftId,
    });

    expect(userDocuments.page).toBe(2);
    expect(userDocuments.pageSize).toBe(30);
    expect(userDocuments.total).toBe(31);
    expect(userDocuments.documents).toHaveLength(1);
    expect(userDocuments.documents[0]).toEqual(expect.objectContaining({
      brainliftId: ownedBrainliftId,
      title: 'Owned Alpha 31',
      taskId: null,
      planId: null,
    }));
    expect(inaccessibleFilter.documents).toEqual([]);
    expect(adminDocuments.documents).toEqual([
      expect.objectContaining({
        brainliftId: privateBrainliftId,
        title: 'Private Gamma',
      }),
    ]);
  });

  it('applies date/week/state/includePastDue filters for active-plan task queries', async () => {
    const brainliftId = await insertBrainlift('task-filters');

    const { tasks: createdTasks } = await createPlanWithTasks({
      brainliftId,
      startDate: '2026-06-01',
      userId: OWNER_ID,
      tasks: [
        { scheduledDate: '2026-06-02', title: 'Past incomplete', description: 'desc' },
        { scheduledDate: '2026-06-02', title: 'Past complete', description: 'desc' },
        { scheduledDate: '2026-06-05', title: 'Today', description: 'desc' },
      ],
    });

    await createDeliverable({
      taskId: createdTasks[1].id,
      brainliftId,
      title: 'Done',
      docFileId: 'doc-done',
      docUrl: 'https://docs.google.com/document/d/doc-done/edit',
      sourceSurface: 'ui',
      createdByUserId: OWNER_ID,
    });

    const onSpecificDate = await listTasksForBrainlift(brainliftId, { date: '2026-06-02' });
    const completeOnly = await listTasksForBrainlift(brainliftId, { state: 'complete' });
    const incompleteOnly = await listTasksForBrainlift(brainliftId, { state: 'incomplete' });
    const todayAndPastDue = await listTasksForBrainlift(brainliftId, {
      includePastDue: true,
      localDate: '2026-06-05',
    });

    expect(onSpecificDate).toHaveLength(2);
    expect(onSpecificDate[0].scheduledDate).toBe('2026-06-02');
    expect(onSpecificDate[1].scheduledDate).toBe('2026-06-02');

    expect(completeOnly).toHaveLength(1);
    expect(completeOnly[0].title).toBe('Past complete');

    expect(incompleteOnly.map((task) => task.title)).toEqual(['Past incomplete', 'Today']);
    expect(todayAndPastDue.map((task) => task.title)).toEqual(['Past incomplete', 'Today']);
  });
});
