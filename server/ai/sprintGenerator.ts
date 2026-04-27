import { z } from 'zod';
import { callModelWithFallback } from './client';
import { storage } from '../storage';
import {
  buildSprintDaySlots,
  getFirstScheduledDateOnOrAfter,
  SPRINT_PLAN_DAY_COUNT,
} from '../lib/sprintSchedule';
import type { SprintTaskMilestone } from '@shared/schema';
import {
  buildSprintGeneratorSystemPrompt,
  buildSprintGeneratorUserPrompt,
  SPRINT_GENERATOR_RESPONSE_JSON_SCHEMA,
} from './prompts/sprint-generator';

export interface SprintGenerationInput {
  brainliftId: number;
  localDate: string;
  diagnosis: {
    goalRaw: string;
    currentState: string;
  };
}

export interface SprintGenerationResult {
  startDate: string;
  tasks: Array<{
    scheduledDate: string;
    title: string;
    description: string;
    milestone: SprintTaskMilestone | null;
  }>;
  modelUsed: string;
}

const ISO_LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SPRINT_GENERATOR_TIMEOUT_MS = 600_000;
const SPRINT_GENERATOR_RETRIES = 0;

const STAGE_WEEK_RANGES: Array<{ week: number; firstDay: number; lastDay: number }> = [
  { week: 1, firstDay: 1, lastDay: 7 },
  { week: 2, firstDay: 8, lastDay: 14 },
  { week: 3, firstDay: 15, lastDay: 21 },
  { week: 4, firstDay: 22, lastDay: SPRINT_PLAN_DAY_COUNT },
];

const sprintGenerationOutputSchema = z.object({
  days: z.array(z.object({
    day_number: z.number().int().min(1).max(SPRINT_PLAN_DAY_COUNT),
    tasks: z.array(z.object({
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      milestone: z.union([z.literal('weekly_artifact'), z.null()]),
    })).min(1),
  })).length(SPRINT_PLAN_DAY_COUNT),
});

function parseLocalDate(value: string, label: string): Date {
  if (!ISO_LOCAL_DATE_REGEX.test(value)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid calendar date`);
  }
  return parsed;
}

function normalizeGeneratedDays(days: Array<{
  day_number: number;
  tasks: Array<{ title: string; description: string; milestone: SprintTaskMilestone | null }>;
}>): Array<{
  day_number: number;
  tasks: Array<{ title: string; description: string; milestone: SprintTaskMilestone | null }>;
}> {
  const sorted = [...days].sort((left, right) => left.day_number - right.day_number);

  sorted.forEach((day, index) => {
    const expectedDayNumber = index + 1;
    if (day.day_number !== expectedDayNumber) {
      throw new Error(
        `Sprint generator must return each day_number exactly once from 1 through ${SPRINT_PLAN_DAY_COUNT}`,
      );
    }
  });

  return sorted;
}

function validateWeeklyArtifactCoverage(days: Array<{
  day_number: number;
  tasks: Array<{ milestone: SprintTaskMilestone | null }>;
}>): void {
  const countsByWeek = new Map<number, number>();
  for (const range of STAGE_WEEK_RANGES) {
    countsByWeek.set(range.week, 0);
  }

  for (const day of days) {
    const range = STAGE_WEEK_RANGES.find(
      (candidate) => day.day_number >= candidate.firstDay && day.day_number <= candidate.lastDay,
    );
    if (!range) continue;

    for (const task of day.tasks) {
      if (task.milestone === 'weekly_artifact') {
        countsByWeek.set(range.week, (countsByWeek.get(range.week) ?? 0) + 1);
      }
    }
  }

  for (const range of STAGE_WEEK_RANGES) {
    const count = countsByWeek.get(range.week) ?? 0;
    if (count !== 1) {
      throw new Error(
        `Sprint generator must produce exactly one weekly_artifact task in week ${range.week} (days ${range.firstDay}-${range.lastDay}); got ${count}`,
      );
    }
  }
}

function warnDensityOverflows(tasks: Array<{ scheduledDate: string }>): void {
  const countsByDate = new Map<string, number>();
  for (const task of tasks) {
    countsByDate.set(task.scheduledDate, (countsByDate.get(task.scheduledDate) ?? 0) + 1);
  }

  countsByDate.forEach((count, scheduledDate) => {
    if (count > 5) {
      console.warn(
        `[SprintGenerator] Soft density guardrail exceeded for ${scheduledDate}: ${count} tasks`,
      );
    }
  });
}

export async function generateSprintPlan(input: SprintGenerationInput): Promise<SprintGenerationResult> {
  parseLocalDate(input.localDate, 'localDate');

  const context = await storage.getSprintPlanContext(input.brainliftId);
  if (!context) {
    throw new Error(`Sprint generation context not found for brainlift ${input.brainliftId}`);
  }

  const system = buildSprintGeneratorSystemPrompt();
  const userPrompt = buildSprintGeneratorUserPrompt({
    context,
    diagnosis: input.diagnosis,
  });
  const startDate = getFirstScheduledDateOnOrAfter(input.localDate);
  const sprintDaySlots = buildSprintDaySlots(startDate);

  const startedAt = Date.now();
  console.info('[SprintGenerator] Starting generation', {
    brainliftId: input.brainliftId,
    localDate: input.localDate,
    startDate,
    title: context.brainlift.title,
    expertCount: context.experts.length,
    spovCount: context.spovs.length,
    sourceCount: context.sources.length,
    timeoutMs: SPRINT_GENERATOR_TIMEOUT_MS,
  });

  try {
    const llmResult = await callModelWithFallback({
      models: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6'],
      system,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
      timeout: SPRINT_GENERATOR_TIMEOUT_MS,
      retries: SPRINT_GENERATOR_RETRIES,
      caller: 'scopeBreaker.sprintGenerator',
      responseFormat: {
        type: 'json_schema',
        jsonSchema: SPRINT_GENERATOR_RESPONSE_JSON_SCHEMA,
      },
    });

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(llmResult.content);
    } catch {
      throw new Error('Sprint generator returned non-JSON output');
    }

    const parsed = sprintGenerationOutputSchema.parse(parsedPayload);
    const generatedDays = normalizeGeneratedDays(parsed.days);
    validateWeeklyArtifactCoverage(generatedDays);

    const tasks = generatedDays.flatMap((day) => {
      const slot = sprintDaySlots[day.day_number - 1];
      return day.tasks.map((task) => ({
        scheduledDate: slot.scheduledDate,
        title: task.title.trim(),
        description: task.description.trim(),
        milestone: task.milestone,
      }));
    });

    warnDensityOverflows(tasks);

    console.info('[SprintGenerator] Generation completed', {
      brainliftId: input.brainliftId,
      localDate: input.localDate,
      startDate,
      endDate: sprintDaySlots[sprintDaySlots.length - 1]?.scheduledDate,
      modelUsed: llmResult.model,
      taskCount: tasks.length,
      weeklyArtifactCount: tasks.filter((task) => task.milestone === 'weekly_artifact').length,
      durationMs: Date.now() - startedAt,
    });

    return {
      startDate,
      tasks,
      modelUsed: llmResult.model,
    };
  } catch (error) {
    console.error('[SprintGenerator] Generation failed', {
      brainliftId: input.brainliftId,
      localDate: input.localDate,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
