import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { TaskListItem } from '@shared/routes';
import { formatLocalDate } from '@/lib/date';
import { pollForActivePlanUntilAvailable } from '@/hooks/useSprint';
import { buildCalendarDays } from '../CalendarView';
import { parseTaskViewId, resolveSelectedTask, shouldShowSprintEmptyState } from '../SprintTab';
import { splitTodayAndOverdueTasks } from '../DayWidget';

const baseTask: TaskListItem = {
  id: 1,
  planId: 11,
  scheduledDate: '2026-04-21',
  weekNumber: 1,
  dayInWeek: 1,
  title: 'Draft section',
  description: 'Write first draft',
  milestone: null,
  isComplete: false,
  isPastDue: false,
  deliverable: null,
};

describe('sprint helpers', () => {
  it('dashboard source registers sprint and document hub tabs', () => {
    const dashboardSource = fs.readFileSync(
      new URL('../../../pages/Dashboard.tsx', import.meta.url),
      'utf8',
    );

    expect(dashboardSource).toContain("'sprint'");
    expect(dashboardSource).toContain("'document-hub'");
  });

  it('parses task view ids from dashboard query state', () => {
    expect(parseTaskViewId('task-42')).toBe(42);
    expect(parseTaskViewId('42')).toBeNull();
    expect(parseTaskViewId('task-abc')).toBeNull();
    expect(parseTaskViewId(null)).toBeNull();
  });

  it('resolves selected task from view id then falls back to today and first task', () => {
    const tasks: TaskListItem[] = [
      { ...baseTask, id: 1, title: 'One' },
      { ...baseTask, id: 2, title: 'Two' },
    ];
    const activePlan = {
      plan: {
        id: 11,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active' as const,
        taskCount: 2,
        completedTaskCount: 0,
      },
      tasks,
    };

    expect(resolveSelectedTask(activePlan, [], 2)?.id).toBe(2);
    expect(resolveSelectedTask(activePlan, [tasks[1]], null)?.id).toBe(2);
    expect(resolveSelectedTask(activePlan, [], null)?.id).toBe(1);
    expect(resolveSelectedTask(null, [], null)).toBeNull();
  });

  it('flags sprint empty state when no active plan exists', () => {
    expect(shouldShowSprintEmptyState(null)).toBe(true);
    expect(shouldShowSprintEmptyState({
      plan: {
        id: 11,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active',
        taskCount: 1,
        completedTaskCount: 0,
      },
      tasks: [baseTask],
    })).toBe(false);
  });

  it('builds calendar day buckets with per-day completion counts', () => {
    const tasks: TaskListItem[] = [
      { ...baseTask, id: 1, scheduledDate: '2026-04-21', isComplete: true },
      { ...baseTask, id: 2, scheduledDate: '2026-04-21', isComplete: false },
      { ...baseTask, id: 3, scheduledDate: '2026-04-22', isComplete: true },
    ];

    const days = buildCalendarDays('2026-04-21', '2026-04-23', tasks);
    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({ date: '2026-04-21', totalCount: 2, completedCount: 1 });
    expect(days[1]).toMatchObject({ date: '2026-04-22', totalCount: 1, completedCount: 1 });
    expect(days[2]).toMatchObject({ date: '2026-04-23', totalCount: 0, completedCount: 0 });
  });

  it('splits backend today payload into today and overdue buckets', () => {
    const tasks: TaskListItem[] = [
      { ...baseTask, id: 1, scheduledDate: '2026-04-21', isPastDue: false, isComplete: false },
      { ...baseTask, id: 2, scheduledDate: '2026-04-19', isPastDue: true, isComplete: false },
      { ...baseTask, id: 3, scheduledDate: '2026-04-18', isPastDue: true, isComplete: true },
    ];

    const buckets = splitTodayAndOverdueTasks(tasks, '2026-04-21');
    expect(buckets.today.map((task) => task.id)).toEqual([1]);
    expect(buckets.overdue.map((task) => task.id)).toEqual([2]);
  });

  it('formats browser-local date as YYYY-MM-DD', () => {
    expect(formatLocalDate(new Date('2026-04-21T14:12:00'))).toBe('2026-04-21');
  });

  it('polls active-plan endpoint with a delayed start and stops when plan appears', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ plan: null, tasks: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          plan: { id: 11, startDate: '2026-04-21', endDate: '2026-05-20', status: 'active', taskCount: 1, completedTaskCount: 0 },
          tasks: [{ ...baseTask, id: 99 }],
        }),
      } as Response);

    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const recovered = await pollForActivePlanUntilAvailable({
      slug: 'demo-slug',
      attempts: 4,
      initialDelayMs: 25,
      intervalMs: 10,
      maxIntervalMs: 10,
      fetchImpl,
      sleepImpl,
    });

    expect(recovered?.plan.id).toBe(11);
    expect(recovered?.tasks[0]?.id).toBe(99);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenNthCalledWith(1, 25);
    expect(sleepImpl).toHaveBeenNthCalledWith(2, 10);
  });
});
