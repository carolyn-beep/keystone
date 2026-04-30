import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
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
      description: 'Add a new DOK1 fact to an existing brainlift. Triggers verification grading.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        fact: z.string().describe('An atomic, verifiable factual claim tied to the source'),
        source: z.string().describe('A real, reachable source citation or URL'),
        category: z.string().optional().describe('Topic category'),
      }),
      execute: async (args) => createDok1Item(authContext, args),
    }),

    create_dok2: tool({
      description: 'Add a new DOK2 summary to an existing brainlift. Triggers DOK2 grading.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        sourceName: z.string().describe('Name of the source being summarized'),
        sourceUrl: z.string().optional().describe('URL of the source'),
        points: z.array(z.string()).min(1).describe('Summary points in your own words'),
        relatedFactIds: z.array(z.number().int()).describe('IDs of DOK1 facts this summary draws from'),
      }),
      execute: async (args) => createDok2Item(authContext, args),
    }),

    create_dok3: tool({
      description: 'Add a new DOK3 insight to an existing brainlift. Must link to at least 2 DOK2 summaries from at least 2 different sources.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        text: z.string().describe('A cross-source analytical claim'),
        linkedDok2Ids: z.array(z.number().int()).min(2).describe('IDs of DOK2 summaries this insight synthesizes'),
      }),
      execute: async (args) => createDok3Item(authContext, args),
    }),

    create_dok4: tool({
      description: 'Add a new DOK4 SPOV to an existing brainlift. Must link to DOK3 insights with one designated as primary.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        text: z.string().describe('A spiky point of view where informed people could disagree'),
        linkedDok3Ids: z.array(z.number().int()).min(1).describe('IDs of DOK3 insights supporting this SPOV'),
        primaryDok3Id: z.number().int().describe('ID of the primary DOK3 insight'),
      }),
      execute: async (args) => createDok4Item(authContext, args),
    }),

    edit_dok_item: tool({
      description: 'Edit the text of a DOK item and trigger regrading. For DOK2, put each summary point on its own line.',
      inputSchema: z.object({
        slug: z.string().describe('Brainlift slug'),
        dok: dokLevelSchema.describe('DOK level: 1=Fact, 2=Summary, 3=Insight, 4=SPOV'),
        itemId: z.number().int().describe('Item ID from assessment or stale results'),
        text: z.string().min(1).describe('Replacement text'),
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
