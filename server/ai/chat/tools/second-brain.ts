import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { ConversationContext } from '../../../brand/types';
import { BadRequestError } from '../../../middleware/error-handler';
import type { AuthContext } from '../../../storage/base';

const REQUIRES_PROJECT = 'Requires a research project bound to this conversation. If none is bound yet, call `create_blank_project` first in the same turn, then call this tool.';

const SAVE_SOURCE_DESCRIPTION = [
  'Save a source to the bound research project Second Brain.',
  REQUIRES_PROJECT,
  'Required fields: title, url, author, categoryId. Category must already exist; call create_category first if no existing category fits.',
  "Do not use 'Unknown' for author. Infer from byline, organization, publication, or domain; ask the student only when authorship cannot be inferred.",
  "When known, also pass `type`, `keyInsights`, `length`, and `whyMatters` so the saved source carries the same shape as the Research Stream cards.",
  'Idempotent: if this URL is already saved for the project, this returns the existing source.',
].join('\n');

const SAVE_NOTE_DESCRIPTION = [
  "Save anything the student said in this conversation that would be lost if it ended now. Use AGGRESSIVELY — every user message is signal: project direction, reasoning, picks from options, constraints, reactions to sources, tangents, half-formed takes. The bar is not 'profound reflection'; the bar is 'future-me starting fresh tomorrow needs this'. Default to saving. Fire multiple times per turn when one user message contains multiple distinct signals.",
  REQUIRES_PROJECT,
  "Content MUST be the student's own words quoted from the conversation. Never compose, summarize, or paraphrase.",
  "If their message is too thin to quote meaningfully, draw the elaboration out naturally — react to what they said, name what you noticed in it, connect it to their project, then ask a question that gets them articulating. Never break the spell with 'can you elaborate so I can save a note'. The note is a byproduct of a real conversation, not the goal of an extraction interview.",
  'Link to sourceId when the reflection is about a specific saved source; omit sourceId for free-form thoughts and rambling.',
].join('\n');

const CREATE_CATEGORY_DESCRIPTION = [
  'Create a category to organize research sources and notes.',
  REQUIRES_PROJECT,
  'Call this before saving the first source for a new topic area.',
  'Use short, concrete names that reflect the student\'s research direction.',
].join('\n');

const LIST_SOURCES_DESCRIPTION = [
  "List the sources saved to the bound research project's Second Brain. Paginated (30 per page).",
  REQUIRES_PROJECT,
  'Optional `q` filters by title, url, author, or category name (case-insensitive substring match).',
  'Use this before save_source when you want to check if a URL is already saved, or to recall what the student has been reading.',
].join('\n');

const LIST_NOTES_DESCRIPTION = [
  "List the notes saved to the bound research project's Second Brain. Paginated (30 per page).",
  REQUIRES_PROJECT,
  'Optional `q` filters by note content (case-insensitive substring match).',
  'Pass `sourceId` to scope the listing to notes attached to one source.',
  'Pass `unlinkedOnly: true` to scope the listing to free-form notes (not tied to any source).',
  "Use this to recall what the student has been writing without re-asking them.",
].join('\n');

const LIST_CATEGORIES_DESCRIPTION = [
  "List the categories in the bound research project's Second Brain, with a count of sources in each.",
  REQUIRES_PROJECT,
  'Returns all categories (no pagination) since categories are intentionally few.',
  'Use this before create_category to check for an existing fit, or before save_source to pick the right categoryId.',
].join('\n');

function requireBoundBrainlift(conversation: ConversationContext): number {
  if (conversation.brainliftId == null) {
    throw new BadRequestError(
      'No research project is bound to this conversation. Call `create_blank_project` first to create one, then retry this tool.',
    );
  }

  return conversation.brainliftId;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '23505' || maybeError.cause?.code === '23505';
}

async function getStorage() {
  return (await import('../../../storage')).storage;
}

const sourcePatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  url: z.string().trim().url().optional(),
  author: z.string().trim().min(1).optional(),
  categoryId: z.number().int().positive().optional(),
  extractedContent: z.unknown().optional(),
  learningStreamItemId: z.number().int().positive().nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'patch must not be empty',
});

const notePatchSchema = z.object({
  content: z.string().trim().min(1).optional(),
  sourceId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'patch must not be empty',
});

const categoryPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'patch must not be empty',
});

export function buildSecondBrainChatTools(
  _authContext: AuthContext,
  conversation: ConversationContext,
): ToolSet {
  return {
    save_source: tool({
      description: SAVE_SOURCE_DESCRIPTION,
      inputSchema: z.object({
        title: z.string().trim().min(1),
        url: z.string().trim().url(),
        author: z.string().trim().min(1).describe("Author, publication, organization, or domain. Never 'Unknown'."),
        categoryId: z.number().int().positive(),
        extractedContent: z.unknown().optional(),
        learningStreamItemId: z.number().int().positive().optional(),
        type: z.string().optional().describe("Source type if known: 'Podcast' | 'AcademicPaper' | 'Video' | 'Substack' | 'News' | 'Twitter'."),
        keyInsights: z.string().optional().describe("1-3 sentence summary of the source's key insights, in your own words."),
        length: z.string().optional().describe("Reading or watching time if known. Free-form: '5 min', '48 min', '2 hr'."),
        whyMatters: z.string().optional().describe("Why this source is relevant to the student's project. Specific, not generic."),
      }),
      execute: async ({ title, url, author, categoryId, extractedContent, learningStreamItemId, type, keyInsights, length, whyMatters }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        try {
          return await storage.createSource(brainliftId, {
            title,
            url,
            author,
            categoryId,
            extractedContent: extractedContent as any,
            learningStreamItemId,
            type,
            keyInsights,
            length,
            whyMatters,
          });
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }

          const existing = (await storage.getSourcesByBrainlift(brainliftId))
            .find((source) => source.url === url);
          if (!existing) {
            throw error;
          }

          return existing;
        }
      },
    }),

    save_note: tool({
      description: SAVE_NOTE_DESCRIPTION,
      inputSchema: z.object({
        content: z.string().trim().min(1).describe("The student's own words. Never agent-authored prose."),
        sourceId: z.number().int().positive().optional(),
        categoryId: z.number().int().positive().optional(),
      }),
      execute: async ({ content, sourceId, categoryId }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.createNote(brainliftId, {
          content,
          sourceId,
          categoryId,
        });
      },
    }),

    create_category: tool({
      description: CREATE_CATEGORY_DESCRIPTION,
      inputSchema: z.object({
        name: z.string().trim().min(1),
        sortOrder: z.number().int().optional(),
      }),
      execute: async ({ name, sortOrder }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        const category = await storage.createCategory(brainliftId, name);
        if (sortOrder === undefined) {
          return category;
        }

        return storage.updateCategory(category.id, brainliftId, { sortOrder });
      },
    }),

    edit_source: tool({
      description: 'Update fields on an existing saved source. Use only for explicit cleanup or correction requests.',
      inputSchema: z.object({
        id: z.number().int().positive(),
        patch: sourcePatchSchema,
      }),
      execute: async ({ id, patch }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.updateSourceForBrainlift(id, brainliftId, patch as any);
      },
    }),

    edit_note: tool({
      description: "Update an existing note. Only edit note content when the student explicitly asks, because notes are the student's words.",
      inputSchema: z.object({
        id: z.number().int().positive(),
        patch: notePatchSchema,
      }),
      execute: async ({ id, patch }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.updateNoteForBrainlift(id, brainliftId, patch);
      },
    }),

    edit_category: tool({
      description: 'Rename or reorder a category. Use edit_source to move sources between categories.',
      inputSchema: z.object({
        id: z.number().int().positive(),
        patch: categoryPatchSchema,
      }),
      execute: async ({ id, patch }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.updateCategory(id, brainliftId, patch);
      },
    }),

    delete_source: tool({
      description: 'Delete a saved source. Use only when the student explicitly asks.',
      inputSchema: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.deleteSourceForBrainlift(id, brainliftId);
      },
    }),

    delete_note: tool({
      description: 'Delete a saved note. Use only when the student explicitly asks.',
      inputSchema: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.deleteNoteForBrainlift(id, brainliftId);
      },
    }),

    delete_category: tool({
      description: 'Delete an empty category. This can fail when sources still reference the category.',
      inputSchema: z.object({
        id: z.number().int().positive(),
      }),
      execute: async ({ id }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        return storage.deleteCategory(id, brainliftId);
      },
    }),

    list_sources: tool({
      description: LIST_SOURCES_DESCRIPTION,
      inputSchema: z.object({
        q: z.string().trim().min(1).optional(),
        page: z.number().int().min(1).optional(),
      }),
      execute: async ({ q, page }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        const result = await storage.listSources(brainliftId, { q, page });
        return {
          items: result.items.map((source) => ({
            id: source.id,
            title: source.title,
            url: source.url,
            author: source.author,
            categoryId: source.categoryId,
            categoryName: source.categoryName,
            createdAt: source.createdAt instanceof Date
              ? source.createdAt.toISOString()
              : source.createdAt,
          })),
          pagination: result.pagination,
        };
      },
    }),

    list_notes: tool({
      description: LIST_NOTES_DESCRIPTION,
      inputSchema: z.object({
        q: z.string().trim().min(1).optional(),
        page: z.number().int().min(1).optional(),
        sourceId: z.number().int().positive().optional(),
        unlinkedOnly: z.boolean().optional(),
      }),
      execute: async ({ q, page, sourceId, unlinkedOnly }) => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        const result = await storage.listNotes(brainliftId, {
          q,
          page,
          sourceId,
          unlinkedOnly,
        });
        return {
          items: result.items.map((note) => ({
            id: note.id,
            content: note.content,
            sourceId: note.sourceId,
            categoryId: note.categoryId,
            createdAt: note.createdAt instanceof Date
              ? note.createdAt.toISOString()
              : note.createdAt,
          })),
          pagination: result.pagination,
        };
      },
    }),

    list_categories: tool({
      description: LIST_CATEGORIES_DESCRIPTION,
      inputSchema: z.object({}),
      execute: async () => {
        const brainliftId = requireBoundBrainlift(conversation);
        const storage = await getStorage();
        const items = await storage.listCategories(brainliftId);
        return {
          items: items.map((category) => ({
            id: category.id,
            name: category.name,
            sortOrder: category.sortOrder,
            sourceCount: category.sourceCount,
          })),
        };
      },
    }),
  };
}
