import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { brandId } from '../../../brand';
import { processGradeRequest } from '../../../services/internal-grading';
import {
  buildDefaultChatAuthContext,
  buildGradingQueuedResponse,
  getBrainliftAssessmentForAuthContext,
  getBrainliftStatusForAuthContext,
  getBrainliftTemplatePayload,
  listBrainliftsForAuthContext,
} from '../../../services/brainlift-grading-surface';

const isAlphaX = brandId === 'alphax';

const CREATE_BRAINLIFT_MARKDOWN_DESCRIPTION = isAlphaX
  ? "Complete BrainLift in markdown format for a BRAND-NEW BrainLift. Use get_template first to see the required format. AUTHORSHIP RULE: every DOK2 summary, DOK3 insight, and DOK4 SPOV in this markdown MUST be the student's own words from this conversation — what THEY articulated when you asked. Do not generate DOK2/3/4 prose yourself and bundle it into this markdown. DOK1 facts may be extracted from sources you fetched with the student. If the student has not yet articulated their summaries/insights/SPOVs in conversation, DO NOT call this tool — ask the questions that surface them first, capture their words, then assemble the markdown from what they said. Do NOT pass markdown for a BrainLift that already exists — the backend will reject it."
  : 'Complete BrainLift in markdown format for a BRAND-NEW BrainLift. Use get_template first to see the required format. Do NOT pass markdown for a BrainLift that already exists — the backend will reject it.';

const CREATE_BRAINLIFT_DESCRIPTION = isAlphaX
  ? [
      'Creates a BRAND-NEW BrainLift from the supplied markdown and queues it for grading.',
      '',
      'AUTHORSHIP RULE — STRICTEST IN THE PLATFORM:',
      'This tool ships an entire brainlift in one call. If you pass markdown where you wrote the DOK2 summaries, DOK3 insights, or DOK4 SPOVs yourself, the student has not built a brainlift — you have, and they signed it. That is exactly what this platform refuses to do.',
      '- DOK2/3/4 content in the markdown MUST come from the student articulating it in THIS conversation, in their own words. Not your phrasing of what you think they would say. Not a draft for them to edit later. Their actual words.',
      '- DOK1 facts in the markdown may be extracted from sources you fetched with the student during this conversation, after you read load-bearing passages together and heard their reactions.',
      '- If the student has NOT yet articulated their DOK2/3/4 content in conversation, DO NOT call this tool. Ask the questions that surface their thinking first, capture their words, then assemble the markdown. The whole point of the Socratic posture collapses if you bypass it by writing the markdown yourself and shipping it.',
      '',
      'BEFORE CALLING — MANDATORY:',
      '1. Call `list_brainlifts` FIRST and check whether a BrainLift on this topic already exists for the user.',
      '2. If a similar BrainLift exists, DO NOT call `create_brainlift`. Use the edit tools instead:',
      '   `edit_dok_item`, `create_dok2`, `create_dok3`, `create_dok4`, `link_dok3`, `link_dok4`,',
      '   `delete_dok_item`, or `dismiss_stale`. Those mutate the existing BrainLift in place and trigger regrading automatically.',
      '3. Confirm with the user that they want a brand-new BrainLift created.',
      '',
      'BACKEND BEHAVIOUR:',
      '- The slug is derived from the title. If a BrainLift with that slug already exists, the call is REJECTED with the error: "This BrainLift already exists. Use the edit tools instead."',
      '- When you see that error: STOP. Do NOT retry with a slightly different title. Instead, call `list_brainlifts`, find the existing BrainLift, and use the edit tools on it.',
      '',
      'On success: returns the new slug immediately while grading continues asynchronously.',
    ].join('\n')
  : [
      'Creates a BRAND-NEW BrainLift from the supplied markdown and queues it for grading.',
      '',
      'BEFORE CALLING — MANDATORY:',
      '1. Call `list_brainlifts` FIRST and check whether a BrainLift on this topic already exists for the user.',
      '2. If a similar BrainLift exists, DO NOT call `create_brainlift`. Use the edit tools instead:',
      '   `edit_dok_item`, `create_dok2`, `create_dok3`, `create_dok4`, `link_dok3`, `link_dok4`,',
      '   `delete_dok_item`, or `dismiss_stale`. Those mutate the existing BrainLift in place and trigger regrading automatically.',
      '3. Confirm with the user that they want a brand-new BrainLift created.',
      '',
      'BACKEND BEHAVIOUR:',
      '- The slug is derived from the title. If a BrainLift with that slug already exists, the call is REJECTED with the error: "This BrainLift already exists. Use the edit tools instead."',
      '- When you see that error: STOP. Do NOT retry with a slightly different title. Instead, call `list_brainlifts`, find the existing BrainLift, and use the edit tools on it.',
      '',
      'On success: returns the new slug immediately while grading continues asynchronously.',
    ].join('\n');

const getTemplateInputSchema = z.object({});

const createBrainliftInputSchema = z.object({
  markdown: z
    .string()
    .trim()
    .min(1)
    .describe(CREATE_BRAINLIFT_MARKDOWN_DESCRIPTION),
  title: z
    .string()
    .optional()
    .describe('Optional title override. If omitted, extracted from the # heading in the markdown. The slug is derived from this title; if a BrainLift with the resulting slug already exists, the call will be rejected.'),
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
  search: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional case-insensitive search query. Matches partial substrings against the BrainLift title, the document author, and the creator\'s display name. Use this BEFORE create_brainlift to confirm no similar BrainLift already exists on the topic the user is bringing.'),
});

const getBrainliftAssessmentInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .describe('The brainlift slug returned by create_brainlift (or found via list_brainlifts).'),
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

    create_brainlift: tool({
      description: CREATE_BRAINLIFT_DESCRIPTION,
      inputSchema: createBrainliftInputSchema,
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
      description: 'List BrainLifts the caller can access — both owned and shared. Admins receive the system-wide list. Each entry includes a `permission` field: `owner` (full access, created by user), `editor` (full access via share, can read + edit/create/delete DOK items), or `viewer` (read-only via share, cannot mutate). Respect the permission when picking next actions: only `owner` and `editor` may call edit/create/delete tools on a brainlift. ALWAYS call this — with the `search` argument when applicable — before considering `create_brainlift`, to confirm no similar BrainLift already exists.',
      inputSchema: listBrainliftsInputSchema,
      execute: async ({ page, pageSize, search }) =>
        listBrainliftsForAuthContext(authContext, { page, pageSize, search }),
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
