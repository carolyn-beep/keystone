import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { brandId } from '../../../brand';
import type { AuthContext } from '../../../storage/base';
import {
  createBrainliftExperts,
  createDok1Item,
  createDok2Item,
  createDok3Item,
  createDok4Item,
  deleteBrainliftExpert,
  deleteDokItem,
  dismissStaleDokItem,
  editDokItem,
  linkDok3Evidence,
  linkDok4Evidence,
  listBrainliftExperts,
  listStaleDokItems,
} from '../../../services/brainlift-curation';

const isKeystone = brandId === 'alphax';

/**
 * Warning sentence appended to the description of every write tool that
 * creates or edits DOK2/3/4 prose. The signal is informational; the
 * platform grader does NOT use it. See features/integrity/pangram-ai-detection
 * decisions.md (Section 11). The word "Pangram" is the internal codename for
 * the third-party API and must NEVER appear in any agent-facing string.
 *
 * Single source of truth: this same literal is duplicated in
 * server/ai/discussion/tools.ts for save_dok2_summary. Both copies must stay
 * byte-identical. Tests in both files assert the exact sentence; copy drift
 * fails the suite.
 */
export const AI_WRITING_SIGNAL_TOOL_WARNING =
  'Submitted text is analyzed for AI writing signals; the signal is visible to reviewers who may act on it off-platform.';

const DOK1_DESCRIPTION = isKeystone
  ? "Save a DOK1 fact to a brainlift. Triggers verification grading. The `fact` MUST be extracted from a source you actually fetched THIS session via `fetch_url_content` or `get_youtube_transcript`, AND you must have already read load-bearing passages of that source aloud with the student and heard their reactions before saving. Do not silently mine a fetched source for facts and dump them in — the conversation around the source is where the student gets hooked into the material. If you have not yet discussed the source with the student, do that first; then save facts. Do not invent facts from your own training data."
  : 'Add a new DOK1 fact to an existing brainlift. Triggers verification grading.';

const DOK2_DESCRIPTION = (isKeystone
  ? "Save a DOK2 summary to a brainlift. The `points` you pass MUST be the user's own words for this source — what THEY said the summary is, captured from this conversation. Do not pass your phrasing of what you think the summary should be. Do not silently summarise a source and save it. If you have not yet pulled the user's summary out through questions, do that first and call this tool with what they articulate. Triggers DOK2 grading."
  : 'Add a new DOK2 summary to an existing brainlift. Triggers DOK2 grading.')
  + ' ' + AI_WRITING_SIGNAL_TOOL_WARNING;

const DOK2_POINTS_DESCRIPTION = isKeystone
  ? "Summary points in the USER's own words from this conversation, not your phrasing"
  : 'Summary points in your own words';

const DOK3_DESCRIPTION = (isKeystone
  ? "Save a DOK3 cross-source insight to a brainlift. The `text` MUST be the user's articulation of the pattern they see across their sources, captured from this conversation. Do not pass a pattern YOU noticed; do not invent the insight and save it. If you have not yet asked the user what pattern they see, do that first and call this tool with their words. Must link to at least 2 DOK2 summaries from at least 2 different sources."
  : 'Add a new DOK3 insight to an existing brainlift. Must link to at least 2 DOK2 summaries from at least 2 different sources.')
  + ' ' + AI_WRITING_SIGNAL_TOOL_WARNING;

const DOK3_TEXT_DESCRIPTION = isKeystone
  ? "The cross-source pattern as the USER articulated it, in their own words from this conversation"
  : 'A cross-source analytical claim';

const DOK4_DESCRIPTION = (isKeystone
  ? "Save a DOK4 SPOV to a brainlift. The `text` MUST be the user's stated position — a stance they actually hold and have articulated in this conversation, in their own words. Do not propose a SPOV and save it. Do not phrase a position you think they would agree with. If the user has not stated the SPOV, ask the question that surfaces it. Must link to DOK3 insights with one designated as primary."
  : 'Add a new DOK4 SPOV to an existing brainlift. Must link to DOK3 insights with one designated as primary.')
  + ' ' + AI_WRITING_SIGNAL_TOOL_WARNING;

const DOK4_TEXT_DESCRIPTION = isKeystone
  ? "The SPOV as the USER stated it, in their own words from this conversation — a position they actually hold"
  : 'A spiky point of view where informed people could disagree';

const EDIT_DOK_ITEM_DESCRIPTION = (isKeystone
  ? "Edit the text of a DOK item and trigger regrading. For DOK2/3/4, the replacement `text` MUST come from the user — either a wording-level cleanup they asked for (grammar, filler) or a rewrite they articulated in this conversation. Do not rephrase a DOK2/3/4 item with your own framing or sharpen a position the user has not restated themselves. For DOK1, mechanical correction against the actual fetched source content is fine. For DOK2, put each summary point on its own line."
  : 'Edit the text of a DOK item and trigger regrading. For DOK2, put each summary point on its own line.')
  + ' ' + AI_WRITING_SIGNAL_TOOL_WARNING;

const EDIT_DOK_ITEM_TEXT_DESCRIPTION = isKeystone
  ? "Replacement text — for DOK2/3/4, the USER's own words from this conversation"
  : 'Replacement text';

type ChatToolAuthContext = AuthContext | string;

const dokLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

function normalizeAuthContext(input: ChatToolAuthContext): AuthContext {
  if (typeof input === 'string') {
    return {
      userId: input,
      role: 'user',
      isAdmin: false,
    };
  }

  return input;
}

export function buildChatCurationTools(authContextInput: ChatToolAuthContext): ToolSet {
  const authContext = normalizeAuthContext(authContextInput);

  return {
    create_dok1: tool({
      description: DOK1_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        fact: z.string().describe('An atomic, verifiable factual claim tied to the source'),
        source: z.string().describe('A real, reachable source citation or URL'),
        category: z.string().optional().describe('Topic category'),
      }),
      execute: async (args) => createDok1Item(authContext, args),
    }),

    create_dok2: tool({
      description: DOK2_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        sourceName: z.string().describe('Name of the source being summarized'),
        sourceUrl: z.string().optional().describe('URL of the source'),
        points: z.array(z.string()).min(1).describe(DOK2_POINTS_DESCRIPTION),
        relatedFactIds: z.array(z.number().int()).describe('IDs of DOK1 facts this summary draws from'),
      }),
      execute: async (args) => createDok2Item(authContext, args),
    }),

    create_dok3: tool({
      description: DOK3_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        text: z.string().describe(DOK3_TEXT_DESCRIPTION),
        linkedDok2Ids: z.array(z.number().int()).min(2).describe('IDs of DOK2 summaries this insight synthesizes'),
      }),
      execute: async (args) => createDok3Item(authContext, args),
    }),

    create_dok4: tool({
      description: DOK4_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        text: z.string().describe(DOK4_TEXT_DESCRIPTION),
        linkedDok3Ids: z.array(z.number().int()).min(1).describe('IDs of DOK3 insights supporting this SPOV'),
        primaryDok3Id: z.number().int().describe('ID of the primary DOK3 insight'),
      }),
      execute: async (args) => createDok4Item(authContext, args),
    }),

    edit_dok_item: tool({
      description: EDIT_DOK_ITEM_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        dok: dokLevelSchema.describe('DOK level: 1=Fact, 2=Summary, 3=Insight, 4=SPOV'),
        itemId: z.number().int().describe('Item ID from assessment or stale results'),
        text: z.string().min(1).describe(EDIT_DOK_ITEM_TEXT_DESCRIPTION),
      }),
      execute: async (args) => editDokItem(authContext, args),
    }),

    delete_dok_item: tool({
      description: 'Delete a DOK item. Preview impact first; call again with confirm=true to execute.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        dok: dokLevelSchema.describe('DOK level: 1=Fact, 2=Summary, 3=Insight, 4=SPOV'),
        itemId: z.number().int().describe('Item ID to inspect or delete'),
        confirm: z.boolean().default(false).describe('False previews impact. True executes deletion.'),
      }),
      execute: async (args) => deleteDokItem(authContext, args),
    }),

    get_stale_items: tool({
      description: 'List stale items in a brainlift. Use after editing or deleting foundation items.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
      }),
      execute: async (args) => listStaleDokItems(authContext, args),
    }),

    dismiss_stale: tool({
      description: 'Dismiss the stale flag on an item after reviewing it.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        dok: dokLevelSchema.describe('DOK level: 1=Fact, 2=Summary, 3=Insight, 4=SPOV'),
        itemId: z.number().int().describe('Item ID to dismiss'),
      }),
      execute: async (args) => dismissStaleDokItem(authContext, args),
    }),

    link_dok3: tool({
      description: 'Attach additional DOK2 summaries to an existing DOK3 insight and regrade it.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        insightId: z.number().int().describe('ID of the existing DOK3 insight'),
        dok2Ids: z.array(z.number().int()).min(1).describe('DOK2 summary IDs to attach'),
      }),
      execute: async (args) => linkDok3Evidence(authContext, args),
    }),

    link_dok4: tool({
      description: 'Attach additional DOK3 insights to an existing DOK4 SPOV and optionally update the primary link.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        spovId: z.number().int().describe('ID of the existing DOK4 SPOV'),
        dok3Ids: z.array(z.number().int()).min(1).describe('DOK3 insight IDs to attach'),
        newPrimaryDok3Id: z.number().int().optional().describe('Optional replacement primary DOK3 insight ID'),
      }),
      execute: async (args) => linkDok4Evidence(authContext, args),
    }),

    list_experts: tool({
      description: 'List experts for an existing brainlift, including structured fields and current ranking.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
      }),
      execute: async (args) => listBrainliftExperts(authContext, args),
    }),

    create_expert: tool({
      description: 'Add one or more experts to an existing brainlift. Ranking refresh runs asynchronously after creation.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        experts: z.array(z.object({
          name: z.string().min(1).describe('Expert name'),
          who: z.string().min(1).describe('One-line description of who they are'),
          why: z.string().min(1).describe('Why this expert matters for the brainlift'),
          focus: z.string().min(1).optional().describe('Optional topic focus'),
          where: z.string().min(1).optional().describe('Optional handle or location'),
        })).min(1),
      }),
      execute: async (args) => createBrainliftExperts(authContext, args),
    }),

    delete_expert: tool({
      description: 'Delete one expert from an existing brainlift. Ranking refresh runs asynchronously after deletion.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        expertId: z.number().int().describe('Expert ID from list_experts'),
      }),
      execute: async (args) => deleteBrainliftExpert(authContext, args),
    }),
  };
}
