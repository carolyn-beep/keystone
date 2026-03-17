import { z } from 'zod';
import { insertBrainliftSchema, brainlifts, insertFactSchema, insertContradictionClusterSchema } from './schema';

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

// Response type for native details
export interface NativeDetailsResponse {
  topic: string;
  purpose: string;
  owner: string | null;
  phaseProgress: import('./schema').NativePhaseProgress;
  lastActivePhase: 1 | 2 | 3 | 4 | 5;
  suggestionStatus: import('./schema').BuilderSuggestionStatus;
  suggestionError: string | null;
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
