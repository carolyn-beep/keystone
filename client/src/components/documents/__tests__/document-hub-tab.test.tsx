import { describe, expect, it } from 'vitest';
import type { DeliverableListItem, PlanHistoryItem } from '@shared/routes';
import { sortDeliverablesNewestFirst } from '@/hooks/useDeliverables';
import {
  formatDeliverableCreatedDate,
  getPlanDisplayLabel,
  parsePlanFilterValue,
  shouldShowDocumentHubEmptyState,
} from '../DocumentHubTab';

describe('document hub helpers', () => {
  it('builds stable plan labels for filter options', () => {
    const plan: PlanHistoryItem = {
      id: 3,
      startDate: '2026-04-21',
      endDate: '2026-05-20',
      status: 'active',
      taskCount: 12,
      completedTaskCount: 4,
    };

    expect(getPlanDisplayLabel(plan)).toBe('Plan 2026-04-21 to 2026-05-20');
  });

  it('parses plan filter select values safely', () => {
    expect(parsePlanFilterValue('all')).toBe('all');
    expect(parsePlanFilterValue('12')).toBe(12);
    expect(parsePlanFilterValue('bad')).toBe('all');
    expect(parsePlanFilterValue('-1')).toBe('all');
  });

  it('sorts deliverables newest-first and tie-breaks by id', () => {
    const rows: DeliverableListItem[] = [
      {
        id: 1,
        taskId: 101,
        planId: 10,
        title: 'Older',
        taskTitle: 'Task A',
        scheduledDate: '2026-04-21',
        createdAt: '2026-04-21T10:00:00.000Z',
        docUrl: 'https://docs.example/1',
      },
      {
        id: 2,
        taskId: 102,
        planId: 10,
        title: 'Newest',
        taskTitle: 'Task B',
        scheduledDate: '2026-04-22',
        createdAt: '2026-04-23T10:00:00.000Z',
        docUrl: 'https://docs.example/2',
      },
      {
        id: 3,
        taskId: 103,
        planId: 11,
        title: 'Same Timestamp Higher Id',
        taskTitle: 'Task C',
        scheduledDate: '2026-04-23',
        createdAt: '2026-04-23T10:00:00.000Z',
        docUrl: 'https://docs.example/3',
      },
    ];

    const sorted = sortDeliverablesNewestFirst(rows);
    expect(sorted.map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it('formats created dates for display with fallback on invalid input', () => {
    expect(formatDeliverableCreatedDate('not-a-date')).toBe('not-a-date');
    expect(formatDeliverableCreatedDate('2026-04-21T10:00:00.000Z')).not.toBe('');
  });

  it('returns empty-state visibility based on deliverable rows', () => {
    expect(shouldShowDocumentHubEmptyState([])).toBe(true);
    expect(shouldShowDocumentHubEmptyState([{
      id: 9,
      taskId: 99,
      planId: 8,
      title: 'Doc',
      taskTitle: 'Task',
      scheduledDate: '2026-04-21',
      createdAt: '2026-04-21T10:00:00.000Z',
      docUrl: 'https://docs.example/9',
    }])).toBe(false);
  });
});
