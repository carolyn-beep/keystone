import { tool, type ToolSet } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ConversationContext } from '../../../brand/types';
import { NotFoundError } from '../../../middleware/error-handler';
import type { AuthContext } from '../../../storage/base';
import { brainlifts, chatConversations } from '@shared/schema';

const CREATE_BLANK_PROJECT_DESCRIPTION = [
  'Create a new blank research project and bind this conversation to it.',
  'Use this ONLY after the student explicitly commits to a domain or topic.',
  'The project is created in research phase with no DOK content. Do not call it preemptively during topic discovery.',
].join('\n');

const CHANGE_CONVERSATION_PROJECT_DESCRIPTION = [
  'Switch this conversation to an existing brainlift.',
  'Use only when the student explicitly asks to work on a different project.',
  'Call list_brainlifts first; pass the resulting `slug` as the `slug` argument here. Slugs are the canonical identifier — `brainliftId` is accepted as a fallback only if you already have a numeric id from a prior tool result.',
  'This tool cannot unbind the conversation.',
].join('\n');

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug || 'research-project';
}

function slugForAttempt(baseSlug: string, attempt: number): string {
  return attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const maybeError = error as { code?: string; cause?: { code?: string } };
  return maybeError.code === '23505' || maybeError.cause?.code === '23505';
}

async function createBlankProjectAndBind(args: {
  userId: string;
  conversationId: number;
  title: string;
  description?: string;
}) {
  const title = args.title.trim();
  const description = args.description?.trim() ?? '';
  const baseSlug = slugifyTitle(title);
  const maxAttempts = 25;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const { db } = await import('../../../db');
      return await db.transaction(async (tx) => {
        const [brainlift] = await tx
          .insert(brainlifts)
          .values({
            slug: slugForAttempt(baseSlug, attempt),
            title,
            description,
            createdByUserId: args.userId,
            phase: 'research',
            summary: {
              totalFacts: 0,
              meanScore: '0',
              score5Count: 0,
              contradictionCount: 0,
            },
          })
          .returning();

        const [conversation] = await tx
          .update(chatConversations)
          .set({
            brainliftId: brainlift.id,
            updatedAt: new Date(),
          })
          .where(and(
            eq(chatConversations.id, args.conversationId),
            eq(chatConversations.userId, args.userId),
          ))
          .returning();

        if (!conversation) {
          throw new NotFoundError('Conversation not found');
        }

        return {
          brainliftId: brainlift.id,
          slug: brainlift.slug,
          title: brainlift.title,
          phase: brainlift.phase,
        };
      });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error('Unable to create a unique research project slug');
}

/**
 * Tools that may only be invoked while the conversation is in research mode.
 * Per FEATURE.md tool matrix: `create_blank_project` is research-only.
 */
export function buildResearchOnlyProjectChatTools(
  authContext: AuthContext,
  conversation: ConversationContext,
): ToolSet {
  return {
    create_blank_project: tool({
      description: CREATE_BLANK_PROJECT_DESCRIPTION,
      inputSchema: z.object({
        title: z.string().trim().min(1).describe('Working title for the research project.'),
        description: z.string().trim().optional().describe('Optional one-line description of the research direction.'),
      }),
      execute: async ({ title, description }) => createBlankProjectAndBind({
        userId: authContext.userId,
        conversationId: conversation.conversationId,
        title,
        description,
      }),
    }),
  };
}

/**
 * Tools that may be invoked regardless of mode. Per FEATURE.md tool matrix:
 * `change_conversation_project` is available in BOTH research and authoring
 * modes so the agent can switch the conversation off a legacy/imported
 * authoring brainlift without forcing the user to leave chat for the picker.
 */
export function buildSharedProjectChatTools(
  authContext: AuthContext,
  conversation: ConversationContext,
): ToolSet {
  return {
    change_conversation_project: tool({
      description: CHANGE_CONVERSATION_PROJECT_DESCRIPTION,
      inputSchema: z.object({
        slug: z.string().trim().min(1)
          .describe('Slug from list_brainlifts (preferred — slugs are the canonical identifier).')
          .optional(),
        brainliftId: z.number().int().positive()
          .describe('Numeric brainlift id (fallback when you already have one from a prior tool result).')
          .optional(),
      }).refine((patch) => Boolean(patch.slug ?? patch.brainliftId), {
        message: 'Provide either `slug` (preferred) or `brainliftId`.',
      }),
      execute: async ({ slug, brainliftId }) => {
        const { storage } = await import('../../../storage');

        let targetBrainliftId = brainliftId ?? null;
        if (targetBrainliftId == null && slug) {
          const target = await storage.getBrainliftBySlug(slug);
          if (!target) {
            throw new NotFoundError(`No brainlift found with slug "${slug}"`);
          }
          targetBrainliftId = target.id;
        }

        if (targetBrainliftId == null) {
          throw new NotFoundError('Provide either slug or brainliftId.');
        }

        const updated = await storage.setConversationBrainlift(
          conversation.conversationId,
          targetBrainliftId,
          authContext.userId,
        );
        const binding = await storage.getConversationBrainlift(conversation.conversationId);

        return {
          conversationId: updated.id,
          brainliftId: binding?.brainliftId ?? updated.brainliftId,
          slug: binding?.brainlift?.slug ?? null,
          phase: binding?.brainlift?.phase ?? null,
        };
      },
    }),
  };
}

/**
 * Back-compat wrapper. Returns the union of the research-only and shared
 * project tools — the same shape this module exposed before the split.
 * New callers should prefer the split functions so mode gating stays local
 * to the chat-tools index.
 */
export function buildProjectChatTools(
  authContext: AuthContext,
  conversation: ConversationContext,
): ToolSet {
  return {
    ...buildResearchOnlyProjectChatTools(authContext, conversation),
    ...buildSharedProjectChatTools(authContext, conversation),
  };
}
