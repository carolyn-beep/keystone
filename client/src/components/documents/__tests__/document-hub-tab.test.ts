import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DeliverableListItem, PlanHistoryItem } from '@shared/routes';
import { buildDeliverablesUrl, sortDeliverablesNewestFirst } from '@/hooks/useDeliverables';
import {
  DeliverableRow,
  formatDeliverableCreatedDate,
  getPlanFilterDisplayLabel,
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
    expect(parsePlanFilterValue('plan')).toBe('plan');
    expect(parsePlanFilterValue('standalone')).toBe('standalone');
    expect(parsePlanFilterValue('12')).toBe(12);
    expect(parsePlanFilterValue('0')).toBe('all');
    expect(parsePlanFilterValue('bad')).toBe('all');
    expect(parsePlanFilterValue('-1')).toBe('all');
    expect(parsePlanFilterValue('2.5')).toBe('all');
  });

  it('formats active plan filter labels for the filter control', () => {
    const plans: PlanHistoryItem[] = [
      {
        id: 3,
        startDate: '2026-04-21',
        endDate: '2026-05-20',
        status: 'active',
        taskCount: 12,
        completedTaskCount: 4,
      },
    ];

    expect(getPlanFilterDisplayLabel('all', plans)).toBe('All Documents');
    expect(getPlanFilterDisplayLabel('plan', plans)).toBe('Plan Documents');
    expect(getPlanFilterDisplayLabel('standalone', plans)).toBe('Standalone Documents');
    expect(getPlanFilterDisplayLabel(3, plans)).toBe('Plan 2026-04-21 to 2026-05-20');
    expect(getPlanFilterDisplayLabel(99, plans)).toBe('Selected plan');
  });

  it('builds deliverable list urls for all, plan scope, standalone scope, and specific plan filters', () => {
    expect(buildDeliverablesUrl('demo-slug', 'all')).toBe('/api/brainlifts/demo-slug/deliverables');
    expect(buildDeliverablesUrl('demo-slug', 'plan')).toBe('/api/brainlifts/demo-slug/deliverables?scope=plan');
    expect(buildDeliverablesUrl('demo-slug', 12)).toBe('/api/brainlifts/demo-slug/deliverables?planId=12');
    expect(buildDeliverablesUrl('demo-slug', 'standalone')).toBe('/api/brainlifts/demo-slug/deliverables?scope=hub');
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
        taskId: null,
        planId: null,
        title: 'Hub Doc Same Timestamp Higher Id',
        taskTitle: null,
        scheduledDate: null,
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

  it('renders task rows with task metadata', () => {
    const row: DeliverableListItem = {
      id: 9,
      taskId: 99,
      planId: 8,
      title: 'Task Document',
      taskTitle: 'Draft the memo',
      scheduledDate: '2026-04-21',
      createdAt: '2026-04-21T10:00:00.000Z',
      docUrl: 'https://docs.example/9',
    };

    const markup = renderToStaticMarkup(createElement(DeliverableRow, { deliverable: row }));

    expect(markup).toContain('Task Document');
    expect(markup).toContain('Draft the memo');
    expect(markup).toContain('2026-04-21');
    expect(markup).toContain('Open Doc');
    expect(markup).toContain('https://docs.example/9');
  });

  it('renders hub rows without task placeholders', () => {
    const row: DeliverableListItem = {
      id: 10,
      taskId: null,
      planId: null,
      title: 'Standalone Research Doc',
      taskTitle: null,
      scheduledDate: null,
      createdAt: '2026-04-22T10:00:00.000Z',
      docUrl: 'https://docs.example/10',
    };

    const markup = renderToStaticMarkup(createElement(DeliverableRow, { deliverable: row }));

    expect(markup).toContain('Standalone Research Doc');
    expect(markup).toContain('Created');
    expect(markup).toContain('Open Doc');
    expect(markup).not.toContain('null');
    expect(markup).not.toContain('No task');
    expect(markup).not.toContain('No scheduled date');
  });

  it('contains all-documents copy and the DOK-style plan filter affordance', () => {
    const componentSource = fs.readFileSync(
      new URL('../DocumentHubTab.tsx', import.meta.url),
      'utf8',
    );

    expect(componentSource).toContain('All Documents');
    expect(componentSource).toContain('DOCUMENT SCOPE');
    expect(componentSource).toContain('PLANS');
    expect(componentSource).toContain('Plan Documents');
    expect(componentSource).toContain('Standalone Documents');
    expect(componentSource).toContain('SlidersHorizontal');
    expect(componentSource).not.toContain('<select');
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
