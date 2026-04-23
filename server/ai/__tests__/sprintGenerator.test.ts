import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SPRINT_PLAN_DAY_COUNT } from '../../lib/sprintSchedule';

const { mockCallModelWithFallback, mockStorage } = vi.hoisted(() => ({
  mockCallModelWithFallback: vi.fn(),
  mockStorage: {
    getSprintPlanContext: vi.fn(),
  },
}));

vi.mock('../client', () => ({
  callModelWithFallback: (...args: unknown[]) => mockCallModelWithFallback(...args),
}));

vi.mock('../../storage', () => ({
  storage: mockStorage,
}));

import { generateSprintPlan } from '../sprintGenerator';

const BASE_CONTEXT = {
  brainlift: {
    id: 42,
    title: 'Scope Breaker',
    description: 'Build a tight 30-day sprint from this brainlift.',
    displayPurpose: 'Turn learning into execution.',
  },
  creator: {
    userId: 'user-1',
    email: 'user@example.com',
    name: 'User One',
  },
  experts: [
    { name: 'Expert A', rankScore: 9, rationale: 'Strong domain depth' },
  ],
  spovs: [
    { id: 10, text: 'Execution beats endless planning.', score: 4.5, status: 'graded' },
  ],
  sources: [
    {
      displayTitle: 'Primary source',
      sourceName: 'example.com',
      grade: 5,
      points: ['Point one', 'Point two'],
    },
  ],
};

const BASE_DIAGNOSIS = {
  goalRaw: 'Turn my brainlift into a shipped product in 30 days.',
  currentState: 'Early thesis with a few interviews; no MVP yet.',
};

type TaskPayload = { title: string; description: string; milestone: 'weekly_artifact' | null };

const WEEKLY_ARTIFACT_DAYS: Record<number, TaskPayload> = {
  7: { title: 'Week 1 Key Artifact', description: 'Exploration synthesis.', milestone: 'weekly_artifact' },
  14: { title: 'Week 2 Key Artifact', description: 'Thesis document.', milestone: 'weekly_artifact' },
  21: { title: 'Week 3 Key Artifact', description: 'Validation report.', milestone: 'weekly_artifact' },
  30: { title: 'Week 4 Key Artifact', description: 'Execution consolidation.', milestone: 'weekly_artifact' },
};

function buildGeneratedDays(overrides: Record<number, TaskPayload[]> = {}) {
  return Array.from({ length: SPRINT_PLAN_DAY_COUNT }, (_, index) => {
    const dayNumber = index + 1;
    if (overrides[dayNumber]) {
      return { day_number: dayNumber, tasks: overrides[dayNumber] };
    }
    const weeklyArtifact = WEEKLY_ARTIFACT_DAYS[dayNumber];
    const defaultTask: TaskPayload = weeklyArtifact ?? {
      title: `Task ${dayNumber}`,
      description: `Deliverable for day ${dayNumber}.`,
      milestone: null,
    };
    return { day_number: dayNumber, tasks: [defaultTask] };
  });
}

describe('sprintGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('generates a sprint plan with structured output and expected model contract', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(BASE_CONTEXT);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        days: buildGeneratedDays({
          1: [
            {
              title: 'Define outcome',
              description: 'Write the sprint target in one page.',
              milestone: null,
            },
          ],
          2: [
            {
              title: 'Draft milestone map',
              description: 'Define weekly checkpoints.',
              milestone: null,
            },
          ],
        }),
      }),
      model: 'anthropic/claude-opus-4.6',
      durationMs: 300,
      attempts: 1,
    });

    const result = await generateSprintPlan({
      brainliftId: 42,
      localDate: '2026-04-25',
      diagnosis: BASE_DIAGNOSIS,
    });

    expect(result.startDate).toBe('2026-04-27');
    expect(result.modelUsed).toBe('anthropic/claude-opus-4.6');
    expect(result.tasks).toHaveLength(SPRINT_PLAN_DAY_COUNT);
    expect(result.tasks[0]).toEqual({
      scheduledDate: '2026-04-27',
      title: 'Define outcome',
      description: 'Write the sprint target in one page.',
      milestone: null,
    });
    expect(result.tasks.filter((task) => task.milestone === 'weekly_artifact')).toHaveLength(4);

    expect(mockCallModelWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6'],
        caller: 'scopeBreaker.sprintGenerator',
        timeout: 600_000,
        retries: 0,
      }),
    );

    const callArgs = mockCallModelWithFallback.mock.calls[0]?.[0];
    expect(callArgs.maxTokens).toBeUndefined();
    expect(callArgs.messages[0].content).toContain(BASE_DIAGNOSIS.goalRaw);
    expect(callArgs.messages[0].content).toContain(BASE_DIAGNOSIS.currentState);
    expect(callArgs.messages[0].content).toContain('Primary source');
  });

  it('throws when sprint generation context is missing', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(null);

    await expect(
      generateSprintPlan({
        brainliftId: 999,
        localDate: '2026-04-21',
        diagnosis: BASE_DIAGNOSIS,
      }),
    ).rejects.toThrow('Sprint generation context not found');
  });

  it('rejects duplicated or missing day numbers', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(BASE_CONTEXT);
    const invalidDays = buildGeneratedDays();
    invalidDays[SPRINT_PLAN_DAY_COUNT - 1] = {
      day_number: SPRINT_PLAN_DAY_COUNT - 1,
      tasks: [
        {
          title: 'Duplicate day number',
          description: 'This payload should fail validation.',
          milestone: null,
        },
      ],
    };

    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        days: invalidDays,
      }),
      model: 'anthropic/claude-sonnet-4.6',
      durationMs: 120,
      attempts: 1,
    });

    await expect(
      generateSprintPlan({
        brainliftId: 42,
        localDate: '2026-04-21',
        diagnosis: BASE_DIAGNOSIS,
      }),
    ).rejects.toThrow('each day_number exactly once');
  });

  it('rejects plans that are missing a weekly_artifact for a stage week', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(BASE_CONTEXT);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        days: buildGeneratedDays({
          21: [
            { title: 'Regular task', description: 'No milestone here.', milestone: null },
          ],
        }),
      }),
      model: 'anthropic/claude-sonnet-4.6',
      durationMs: 120,
      attempts: 1,
    });

    await expect(
      generateSprintPlan({
        brainliftId: 42,
        localDate: '2026-04-21',
        diagnosis: BASE_DIAGNOSIS,
      }),
    ).rejects.toThrow('weekly_artifact task in week 3');
  });

  it('rejects plans that overuse weekly_artifact in one stage week', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(BASE_CONTEXT);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        days: buildGeneratedDays({
          3: [
            { title: 'Extra artifact', description: 'Second weekly artifact.', milestone: 'weekly_artifact' },
          ],
        }),
      }),
      model: 'anthropic/claude-sonnet-4.6',
      durationMs: 120,
      attempts: 1,
    });

    await expect(
      generateSprintPlan({
        brainliftId: 42,
        localDate: '2026-04-21',
        diagnosis: BASE_DIAGNOSIS,
      }),
    ).rejects.toThrow('weekly_artifact task in week 1');
  });

  it('logs guardrail warnings for dense days but still returns the plan', async () => {
    mockStorage.getSprintPlanContext.mockResolvedValue(BASE_CONTEXT);
    mockCallModelWithFallback.mockResolvedValue({
      content: JSON.stringify({
        days: buildGeneratedDays({
          2: Array.from({ length: 6 }).map((_, index) => ({
            title: `Task ${index + 1}`,
            description: 'Concrete output.',
            milestone: null,
          })),
        }),
      }),
      model: 'anthropic/claude-sonnet-4.6',
      durationMs: 90,
      attempts: 1,
    });

    const result = await generateSprintPlan({
      brainliftId: 42,
      localDate: '2026-04-21',
      diagnosis: BASE_DIAGNOSIS,
    });

    expect(result.tasks.filter((task) => task.scheduledDate === '2026-04-22')).toHaveLength(6);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Soft density guardrail exceeded'),
    );
  });
});
