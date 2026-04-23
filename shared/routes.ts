import { z } from 'zod';
import { insertBrainliftSchema, brainlifts, insertFactSchema, insertContradictionClusterSchema, type SprintTaskMilestone } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  brainlifts: {
    list: {
      method: 'GET' as const,
      path: '/api/brainlifts',
      responses: {
        200: z.array(z.custom<typeof brainlifts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/brainlifts/:slug',
      responses: {
        200: z.custom<typeof brainlifts.$inferSelect & {
          facts: any[],
          contradictionClusters: any[]
        }>(),
        404: errorSchemas.notFound,
      },
    },
    // Useful for seeding or admin, though primarily we seed from file
    create: {
      method: 'POST' as const,
      path: '/api/brainlifts',
      input: z.object({
        slug: z.string(),
        title: z.string(),
        description: z.string(),
        author: z.string().optional(),
        summary: z.any(),
        facts: z.array(insertFactSchema.omit({ brainliftId: true })),
        contradictionClusters: z.array(insertContradictionClusterSchema.omit({ brainliftId: true })),
      }),
      responses: {
        201: z.custom<typeof brainlifts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    }
  },
};

// Native brainlift validation schemas
export const createNativeBrainliftInputSchema = z.object({
  topic: z.string().trim().min(10),
  purpose: z.string().trim().min(20),
  owner: z.string().trim().nullable().optional(),
});

export const patchNativeDetailsInputSchema = z.object({
  topic: z.string().trim().min(10).optional(),
  purpose: z.string().trim().min(20).optional(),
  owner: z.string().trim().nullable().optional(),
  lastActivePhase: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).optional(),
});

// Purpose suggestion validation schema
export const purposeSuggestionInputSchema = z.object({
  topic: z.string().trim().min(10),
});

// Builder expert validation schemas
export const createBuilderExpertInputSchema = z.object({
  name: z.string().trim().min(1),
  who: z.string().trim().min(1),
  focus: z.string().trim().nullable().optional(),
  why: z.string().trim().nullable().optional(),
  where: z.string().trim().min(1),
});

export const patchBuilderExpertInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  who: z.string().trim().min(1).optional(),
  focus: z.string().trim().nullable().optional(),
  why: z.string().trim().nullable().optional(),
  where: z.string().trim().min(1).optional(),
  status: z.literal('saved').optional(),
});

// Response type for native details
export interface NativeDetailsResponse {
  topic: string;
  purpose: string;
  owner: string | null;
  phaseProgress: import('./schema').NativePhaseProgress;
  lastActivePhase: 1 | 2 | 3 | 4 | 5;
  suggestionStatus: import('./schema').BuilderSuggestionStatus;
  suggestionError: string | null;
  phase3CelebratedAt: string | null;
}

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type BrainliftListResponse = z.infer<typeof api.brainlifts.list.responses[200]>;
export type BrainliftDetailResponse = z.infer<typeof api.brainlifts.get.responses[200]>;

const ISO_LOCAL_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidLocalDate(value: string): boolean {
  if (!ISO_LOCAL_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const localDateSchema = z
  .string()
  .regex(ISO_LOCAL_DATE_REGEX, 'Expected YYYY-MM-DD')
  .refine(isValidLocalDate, 'Expected valid calendar date');

const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const queryIntegerSchema = z.preprocess((value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return value;
}, z.number().int().positive());

const weekQuerySchema = z.preprocess((value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0) return Number(value);
  return value;
}, z.number().int().min(1));

export const generatePlanDiagnosisSchema = z.object({
  goalRaw: z.string().trim().min(1).max(2000),
  currentState: z.string().trim().min(1).max(4000),
});

export type GeneratePlanDiagnosis = z.infer<typeof generatePlanDiagnosisSchema>;

export const generatePlanRequestSchema = z.object({
  localDate: localDateSchema,
  diagnosis: generatePlanDiagnosisSchema,
});

export type GeneratePlanRequest = z.infer<typeof generatePlanRequestSchema>;

export interface PlanHistoryItem {
  id: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'complete' | 'generating' | 'failed';
  taskCount: number;
  completedTaskCount: number;
  generationError?: string | null;
}

export interface TaskListItem {
  id: number;
  planId: number;
  scheduledDate: string;
  weekNumber: number;
  dayInWeek: number;
  title: string;
  description: string;
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

export interface TaskDetailResponse extends TaskListItem {
  plan: {
    id: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'complete' | 'generating' | 'failed';
  };
}

export interface GeneratedPlanResponse {
  plan: PlanHistoryItem;
  tasks: TaskListItem[];
}

export const listTasksQuerySchema = z
  .object({
    date: localDateSchema.optional(),
    week: weekQuerySchema.optional(),
    state: z.enum(['all', 'complete', 'incomplete']).optional().default('all'),
    includePastDue: queryBooleanSchema.optional().default(false),
    localDate: localDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.includePastDue && !value.localDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['localDate'],
        message: 'localDate is required when includePastDue=true',
      });
    }
  });

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const taskIdParamsSchema = z.object({
  taskId: queryIntegerSchema,
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

export const createDeliverableRequestSchema = z.object({
  title: z.string().trim().min(1),
  markdown: z.string(),
});

export type CreateDeliverableRequest = z.infer<typeof createDeliverableRequestSchema>;

export interface ReadDeliverableResponse {
  title: string;
  contentMarkdown: string;
  docUrl: string;
}

export const updateDeliverableRequestSchema = z.object({
  markdown: z.string(),
});

export type UpdateDeliverableRequest = z.infer<typeof updateDeliverableRequestSchema>;

export interface DeliverableListItem {
  id: number;
  taskId: number;
  planId: number;
  title: string;
  taskTitle: string;
  scheduledDate: string;
  createdAt: string;
  docUrl: string;
}

export interface DeliverableListResponse {
  plans: PlanHistoryItem[];
  deliverables: DeliverableListItem[];
}

export const listDeliverablesQuerySchema = z.object({
  planId: queryIntegerSchema.optional(),
});

export type ListDeliverablesQuery = z.infer<typeof listDeliverablesQuerySchema>;
