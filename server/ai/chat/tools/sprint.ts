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
  listDocumentsForUser,
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
  taskId: positiveIntSchema.optional(),
  title: z.string().trim().min(1),
  markdown: z.string(),
});

function requireExactlyOneDeliverableSelector(
  value: { taskId?: number; deliverableId?: number },
  ctx: z.RefinementCtx,
) {
  const selectorCount = Number(value.taskId != null) + Number(value.deliverableId != null);
  if (selectorCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskId'],
      message: 'Provide exactly one of taskId or deliverableId',
    });
  }
}

const deliverableSelectorSchema = brainliftSlugSchema.extend({
  taskId: positiveIntSchema.optional(),
  deliverableId: positiveIntSchema.optional(),
}).superRefine(requireExactlyOneDeliverableSelector);

const updateDeliverableInputSchema = brainliftSlugSchema.extend({
  taskId: positiveIntSchema.optional(),
  deliverableId: positiveIntSchema.optional(),
  markdown: z.string(),
}).superRefine(requireExactlyOneDeliverableSelector);

const listDocumentsInputSchema = z.object({
  brainliftSlug: z.string().trim().min(1).optional(),
  brainliftId: positiveIntSchema.optional(),
  taskId: positiveIntSchema.optional(),
  q: z.string().trim().min(1).optional(),
  sort: z.enum(['createdAt', 'title']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  page: positiveIntSchema.optional(),
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

function pickDeliverableSelector(input: { taskId?: number; deliverableId?: number }) {
  const selectorCount = Number(input.taskId != null) + Number(input.deliverableId != null);
  if (selectorCount !== 1) {
    throw new Error('Provide exactly one of taskId or deliverableId');
  }

  return input.taskId != null
    ? { taskId: input.taskId }
    : { deliverableId: input.deliverableId };
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
      description: 'Create a sprint task deliverable when taskId is provided, or save a standalone Document Hub document when taskId is omitted. Returns the deliverable id and stable Google Doc URL.',
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
      description: 'Read the current markdown body and document URL for a deliverable by taskId or deliverableId.',
      inputSchema: deliverableSelectorSchema,
      execute: async ({ brainliftSlug, taskId, deliverableId }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'access');
        const selector = pickDeliverableSelector({ taskId, deliverableId });
        return readSprintDeliverable({
          brainliftId: brainlift.id,
          ...selector,
        });
      },
    }),

    update_deliverable: tool({
      description: 'Replace the markdown content of an existing deliverable by taskId or deliverableId and return its id plus stable Google Doc URL.',
      inputSchema: updateDeliverableInputSchema,
      execute: async ({ brainliftSlug, taskId, deliverableId, markdown }) => {
        const brainlift = await resolveScopedBrainlift(authContext, brainliftSlug, 'modify');
        const selector = pickDeliverableSelector({ taskId, deliverableId });
        return updateSprintDeliverable({
          brainliftId: brainlift.id,
          ...selector,
          markdown,
          sourceSurface: 'ui',
        });
      },
    }),

    list_documents: tool({
      description: 'List accessible Document Hub documents and sprint deliverables with optional Brainlift, task, search, sort, order, and page filters.',
      inputSchema: listDocumentsInputSchema,
      execute: async (query) => {
        return listDocumentsForUser(authContext.userId, authContext.isAdmin, query);
      },
    }),
  };
}
