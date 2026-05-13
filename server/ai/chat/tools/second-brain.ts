import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { ConversationContext } from '../../../brand/types';
import { BadRequestError } from '../../../middleware/error-handler';
import type { AuthContext } from '../../../storage/base';

const SAVE_SOURCE_DESCRIPTION = [
  'Save a source to the bound research project Second Brain.',
  'Required fields: title, url, author, categoryId. Category must already exist; call create_category first if no existing category fits.',
  "Do not use 'Unknown' for author. Infer from byline, organization, publication, or domain; ask the student only when authorship cannot be inferred.",
  'Idempotent: if this URL is already saved for the project, this returns the existing source.',
].join('\n');

const SAVE_NOTE_DESCRIPTION = [
  "Save the student's reflection as a note.",
  "Never compose notes yourself. The content must be the student's own words from this conversation.",
  'Link to sourceId when the reflection is about a specific saved source; omit sourceId for free-form thoughts.',
].join('\n');

const CREATE_CATEGORY_DESCRIPTION = [
  'Create a category to organize research sources and notes.',
  'Call this before saving the first source for a new topic area.',
  'Use short, concrete names that reflect the student\'s research direction.',
].join('\n');

function requireBoundBrainlift(conversation: ConversationContext): number {
  if (conversation.brainliftId == null) {
    throw new BadRequestError('A research project must be bound before using Second Brain tools');
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
  const brainliftId = requireBoundBrainlift(conversation);

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
      }),
      execute: async ({ title, url, author, categoryId, extractedContent, learningStreamItemId }) => {
        const storage = await getStorage();
        try {
          return await storage.createSource(brainliftId, {
            title,
            url,
            author,
            categoryId,
            extractedContent: extractedContent as any,
            learningStreamItemId,
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
        const storage = await getStorage();
        return storage.deleteCategory(id, brainliftId);
      },
    }),
  };
}
