import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { processGradeRequest } from '../../../services/internal-grading';
import {
  buildDefaultChatAuthContext,
  buildGradingQueuedResponse,
  getBrainliftAssessmentForAuthContext,
  getBrainliftStatusForAuthContext,
  getBrainliftTemplatePayload,
  listBrainliftsForAuthContext,
} from '../../../services/brainlift-grading-surface';

const getTemplateInputSchema = z.object({});

const gradeBrainliftInputSchema = z.object({
  markdown: z
    .string()
    .trim()
    .min(1)
    .describe('Complete Brainlift in markdown format. Use get_template first to see the required format.'),
  title: z
    .string()
    .optional()
    .describe('Optional title override. If omitted, extracted from the # heading in the markdown.'),
});

const listBrainliftsInputSchema = z.object({
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page number. Default: 1'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Items per page. Default: 10, max: 20'),
});

const getBrainliftAssessmentInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .describe('The brainlift slug returned by grade_brainlift.'),
  dok: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe('DOK level to retrieve: 1=Facts, 2=Summaries, 3=Insights, 4=SPOVs'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page number for pagination. Default: 1'),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Items per page. Default: 20, max: 50'),
  itemId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Filter to a single item by its numeric ID.'),
  statusOnly: z
    .boolean()
    .optional()
    .describe('If true, returns only grading status and progress without items. Use this for polling before grading completes.'),
  sortBy: z
    .enum(['id', 'score', 'updatedAt'])
    .optional()
    .describe('Sort field. Use score to find weak items or updatedAt for recent changes.'),
  order: z
    .enum(['asc', 'desc'])
    .optional()
    .describe('Sort direction. Default depends on the chosen sort field.'),
  status: z
    .enum(['regrading', 'grading', 'graded', 'error'])
    .optional()
    .describe('Filter by grading status.'),
  detail: z
    .enum(['summary', 'full'])
    .optional()
    .describe('Level of detail for DOK3/DOK4 items. Default: summary.'),
});

function normalizeOptionalTitle(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildChatGradingTools(userId: string): ToolSet {
  const authContext = buildDefaultChatAuthContext(userId);

  return {
    get_template: tool({
      description: 'Return the Brainlift markdown template with format rules and quality guidelines.',
      inputSchema: getTemplateInputSchema,
      execute: async () => getBrainliftTemplatePayload(),
    }),

    grade_brainlift: tool({
      description: 'Submit a Brainlift for grading. Returns the slug immediately while grading continues asynchronously.',
      inputSchema: gradeBrainliftInputSchema,
      execute: async ({ markdown, title }) => {
        const result = await processGradeRequest(
          markdown,
          normalizeOptionalTitle(title),
          userId,
        );

        return buildGradingQueuedResponse(result);
      },
    }),

    list_brainlifts: tool({
      description: 'List Brainlifts the current user can access — both owned and shared with them. Each entry includes a `permission` field: `owner` (full access, created by user), `editor` (full access via share, can read + edit/create/delete DOK items), or `viewer` (read-only via share, cannot mutate). Respect the permission when picking next actions: only `owner` and `editor` may call edit/create/delete tools on a brainlift.',
      inputSchema: listBrainliftsInputSchema,
      execute: async ({ page, pageSize }) =>
        listBrainliftsForAuthContext(authContext, { page, pageSize }),
    }),

    get_brainlift_assessment: tool({
      description: 'Read grading progress or paginated assessment results for a Brainlift. For DOK1, score is 1-5 when scoreState="scored"; scoreState="non_gradeable" means the fact could not be graded from available evidence and should not be treated as a zero score or automatically rewritten for score improvement.',
      inputSchema: getBrainliftAssessmentInputSchema,
      execute: async ({ statusOnly, ...options }) => {
        if (statusOnly) {
          return getBrainliftStatusForAuthContext(authContext, options.slug);
        }

        return getBrainliftAssessmentForAuthContext(authContext, {
          ...options,
          dok: options.dok as 1 | 2 | 3 | 4,
        });
      },
    }),
  };
}
