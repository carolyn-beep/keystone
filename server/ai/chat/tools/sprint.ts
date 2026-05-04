import { tool } from 'ai';
import { z } from 'zod';
import type { AuthContext, BrainliftData } from '@shared/schema';
import {
  localDateSchema,
} from '@shared/routes';
import { NotFoundError } from '../../../middleware/error-handler';
import { storage } from '../../../storage';
import {
  createSprintDeliverable,
  generateSprintPlanNow,
  getCurrentSprintPlan,
  getSprintTaskOrThrow,
  listSprintDeliverables,
  listSprintTasks,
  readSprintDeliverable,
  updateSprintDeliverable,
} from '../../../services/sprint';

type BrainliftAccess = 'access' | 'modify';

export interface SprintChatToolContext {
  authContext: AuthContext;
}

const brainliftSlugSchema = z.object({
  brainliftSlug: z.string().trim().min(1),
});

const positiveIntSchema = z.number().int().positive();

const generatePlanInputSchema = brainliftSlugSchema.extend({
  localDate: localDateSchema,
  goalRaw: z.string().trim().min(1).optional(),
  currentState: z.string().trim().min(1).optional(),
});

const listTasksInputSchema = brainliftSlugSchema.extend({
  date: localDateSchema.optional(),
  week: z.number().int().min(1).optional(),
  state: z.enum(['all', 'complete', 'incomplete']).optional().default('all'),
  includePastDue: z.boolean().optional().default(false),
  localDate: localDateSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.includePastDue && !value.localDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['localDate'],
      message: 'localDate is required when includePastDue=true',
    });
  }
});

const getTaskInputSchema = brainliftSlugSchema.extend({
  taskId: positiveIntSchema,
});

const createDeliverableInputSchema = brainliftSlugSchema.extend({
  taskId: positiveIntSchema,
  title: z.string().trim().min(1),
  markdown: z.string(),
});

const updateDeliverableInputSchema = brainliftSlugSchema.extend({
  taskId: positiveIntSchema,
  markdown: z.string(),
});

const listDeliverablesInputSchema = brainliftSlugSchema.extend({
  planId: positiveIntSchema.optional(),
});

async function resolveScopedBrainlift(
  authContext: AuthContext,
  slug: string,
  requiredAccess: BrainliftAccess,
): Promise<BrainliftData> {
  const brainlift = await storage.getBrainliftBySlug(slug);
  if (!brainlift) {
    throw new NotFoundError('Brainlift not found');
  }

  const hasAccess = requiredAccess === 'modify'
    ? await storage.canModifyBrainlift(brainlift, authContext)
    : await storage.canAccessBrainlift(brainlift, authContext);

  if (!hasAccess) {
    throw new NotFoundError('Brainlift not found');
  }

  return brainlift;
}

function pickDeliverableBrainlift(brainlift: BrainliftData) {
  return {
    id: brainlift.id,
    title: brainlift.title,
    gdriveRootFolderId: brainlift.gdriveRootFolderId ?? null,
  };
}

export function buildSprintChatTools({ authContext }: SprintChatToolContext) {
  return {
    generate_plan: tool({
      description:
        'Generate a sprint plan for a brainlift. Provide goalRaw and currentState when the conversation already established them; otherwise the backend derives a fallback diagnosis from the brainlift context.',
      inputSchema: generatePlanInputSchema,
      execute: async ({ brainliftSlug, localDate, goalRaw, currentState }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'modify');
        const diagnosis = goalRaw || currentState
          ? { goalRaw, currentState }
          : undefined;

        return generateSprintPlanNow({
          brainliftId: brainlift.id,
          userId: authContext.userId,
          localDate,
          diagnosis,
        });
      },
    }),

    get_plan: tool({
      description: 'Get the current active or generating sprint plan for a brainlift.',
      inputSchema: brainliftSlugSchema,
      execute: async ({ brainliftSlug }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        return getCurrentSprintPlan(brainlift.id);
      },
    }),

    list_tasks: tool({
      description: 'List sprint tasks for a brainlift with optional filters for date, week, state, and overdue handling.',
      inputSchema: listTasksInputSchema,
      execute: async ({ brainliftSlug, date, week, state, includePastDue, localDate }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        return listSprintTasks(brainlift.id, {
          date,
          week,
          state,
          includePastDue,
          localDate,
        });
      },
    }),

    get_task: tool({
      description: 'Get one sprint task and its current deliverable state for a scoped brainlift.',
      inputSchema: getTaskInputSchema,
      execute: async ({ brainliftSlug, taskId }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        return getSprintTaskOrThrow(brainlift.id, taskId);
      },
    }),

    save_deliverable: tool({
      description: 'Create a deliverable for a sprint task and return the stable Google Doc URL.',
      inputSchema: createDeliverableInputSchema,
      execute: async ({ brainliftSlug, taskId, title, markdown }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'modify');
        return createSprintDeliverable({
          brainlift: pickDeliverableBrainlift(brainlift),
          userId: authContext.userId,
          taskId,
          title,
          markdown,
          sourceSurface: 'ui',
        });
      },
    }),

    read_deliverable: tool({
      description: 'Read the current markdown body and document URL for a sprint deliverable.',
      inputSchema: getTaskInputSchema,
      execute: async ({ brainliftSlug, taskId }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        return readSprintDeliverable({
          brainliftId: brainlift.id,
          taskId,
        });
      },
    }),

    update_deliverable: tool({
      description: 'Replace the markdown content of an existing sprint deliverable and return the stable Google Doc URL.',
      inputSchema: updateDeliverableInputSchema,
      execute: async ({ brainliftSlug, taskId, markdown }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'modify');
        return updateSprintDeliverable({
          brainliftId: brainlift.id,
          taskId,
          markdown,
        });
      },
    }),

    list_deliverables: tool({
      description: 'List deliverables for a brainlift, optionally filtered to one plan id.',
      inputSchema: listDeliverablesInputSchema,
      execute: async ({ brainliftSlug, planId }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        return listSprintDeliverables(brainlift.id, { planId });
      },
    }),
  };
}
