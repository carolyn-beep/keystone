import { tool } from 'ai';
import { z } from 'zod';
import { db, eq, sql, facts, learningStreamItems } from '../../storage/base';
import { storage } from '../../storage';
import { pangramAssessmentsStorage } from '../../storage/pangramAssessments';
import { saveSingleDOK2Summary } from '../../storage/dok2';
import { autoBookmarkIfPending } from '../../storage/knowledge-tree';
import { withJob } from '../../utils/withJob';
import { ensureItemTextContent } from '../../utils/item-text-content';
import { buildSecondBrainChatTools } from '../chat/tools/second-brain';
import { AI_WRITING_SIGNAL_TOOL_WARNING } from '../chat/tools/curation';
import type { AuthContext, LearningStreamItem, Brainlift } from '../../storage/base';

interface BuilderContext {
  mode: 'builder';
}

/**
 * Build the discussion tools, closing over request context.
 *
 * Tool surface branches on `brainlift.phase`, mirroring the native chat agent
 * (see server/ai/chat/tools/index.ts):
 * - 'research' phase: drop the DOK extraction tools (save_dok1_fact,
 *   save_dok2_summary). The student isn't doing DOK work yet; they're building
 *   a Second Brain. Keep the context/read tools so the agent can still ground
 *   the conversation in the source.
 * - 'authoring' phase: keep all existing DOK extraction tools.
 *
 * Second Brain tools (save_source, save_note, create_category, list/edit/delete)
 * are available in BOTH phases, same as native chat — students save notes and
 * sources regardless of where they are in the pyramid.
 *
 * When builderContext is provided, DOK tools branch to builder-mode behavior:
 * - save_dok1_fact: sets learningStreamItemId, category optional
 * - save_dok2_summary: sets learningStreamItemId, category optional
 * - get_brainlift_context: includes item extraction state
 */
export function buildDiscussionTools(
  item: LearningStreamItem,
  brainlift: Pick<Brainlift, 'id' | 'displayPurpose' | 'description' | 'phase'>,
  authContext: AuthContext,
  builderContext?: BuilderContext
) {
  const isBuilder = builderContext?.mode === 'builder';
  const isResearch = brainlift.phase === 'research';
  // Track DOK1 facts saved this session for originalId sequencing
  let sessionFactSeq = 0;

  // Second Brain tools reuse the native chat builder. The discussion agent has
  // no real ConversationContext (no conversation row), so we synthesize one
  // with the brainlift binding — that's all `requireBoundBrainlift` checks.
  const rawSecondBrainTools = buildSecondBrainChatTools(authContext, {
    conversationId: 0,
    brainliftId: brainlift.id,
    brainlift: null,
  });

  // Wrap save_source so it auto-links to the learning stream item the user is
  // reading. The agent has the open item in context — never make it pass the
  // item id manually.
  const wrappedSaveSource = tool({
    description: (rawSecondBrainTools.save_source as any).description,
    inputSchema: (rawSecondBrainTools.save_source as any).inputSchema,
    execute: async (args: any, ctx: any) => {
      const merged = {
        ...args,
        learningStreamItemId: args?.learningStreamItemId ?? item.id,
      };
      return (rawSecondBrainTools.save_source as any).execute(merged, ctx);
    },
  });

  // Wrap save_note so it auto-links to the Second Brain source for the current
  // item when one exists. Without this, "save a note about this article" ends
  // up as a free-floating note instead of landing on the source the user has
  // open right in front of them.
  const wrappedSaveNote = tool({
    description: (rawSecondBrainTools.save_note as any).description,
    inputSchema: (rawSecondBrainTools.save_note as any).inputSchema,
    execute: async (args: any, ctx: any) => {
      let sourceId = args?.sourceId;
      if (sourceId == null) {
        const sourcesForBrainlift = await storage.getSourcesByBrainlift(brainlift.id);
        const linked = sourcesForBrainlift.find(
          (s) => s.learningStreamItemId === item.id,
        );
        if (linked) {
          sourceId = linked.id;
        }
      }
      return (rawSecondBrainTools.save_note as any).execute(
        { ...args, sourceId },
        ctx,
      );
    },
  });

  const secondBrainTools = {
    ...rawSecondBrainTools,
    save_source: wrappedSaveSource,
    save_note: wrappedSaveNote,
  };

  const dokTools = {
    save_dok1_fact: tool({
      description:
        'Save a DOK1 fact that the user has articulated. Only call this after the user agrees to save it.',
      inputSchema: z.object({
        fact: z.string().describe('The objective, verifiable fact text'),
        category: z.string().optional().describe('Category/topic this fact belongs to (optional in builder mode)'),
      }),
      execute: async ({ fact, category }) => {
        // Compute next originalId: MAX integer prefix + 1, with session sequence suffix
        const [maxResult] = await db
          .select({
            maxId: sql<string>`MAX(
              CASE
                WHEN ${facts.originalId} ~ '^[0-9]+'
                THEN CAST(substring(${facts.originalId} from '^[0-9]+') AS integer)
                ELSE 0
              END
            )`,
          })
          .from(facts)
          .where(eq(facts.brainliftId, brainlift.id));

        const maxPrefix = parseInt(maxResult?.maxId ?? '0') || 0;
        sessionFactSeq++;
        const originalId = `${maxPrefix + sessionFactSeq}`;

        // Insert the fact — builder mode sets learningStreamItemId
        const [inserted] = await db
          .insert(facts)
          .values({
            brainliftId: brainlift.id,
            originalId,
            category: category ?? null,
            source: item.url,
            fact,
            score: 0,
            isGradeable: true,
            ...(isBuilder ? { learningStreamItemId: item.id } : {}),
          })
          .returning();

        // Auto-bookmark if item was still pending
        if (isBuilder) {
          await autoBookmarkIfPending(item.id);
        }

        // Queue verification job (fire-and-forget)
        withJob('discussion:verify-fact')
          .forPayload({ factId: inserted.id, brainliftId: brainlift.id })
          .queue()
          .catch((err) =>
            console.error('[Discussion] Failed to queue fact verification:', err)
          );

        return {
          factId: inserted.id,
          fact: inserted.fact,
          category: inserted.category,
          originalId: inserted.originalId,
          ...(isBuilder ? {
            learningStreamItemId: item.id,
            categoryLabel: inserted.category || 'Uncategorized',
          } : {}),
        };
      },
    }),

    save_dok2_summary: tool({
      description:
        'Save a DOK2 summary — the user\'s synthesis of multiple DOK1 facts. Only call after the user articulates their interpretation and agrees to save. '
        + AI_WRITING_SIGNAL_TOOL_WARNING,
      inputSchema: z.object({
        summaryPoints: z
          .array(z.string())
          .describe('The summary points the user articulated'),
        relatedFactIds: z
          .array(z.number())
          .describe('Database IDs of DOK1 facts this summary synthesizes'),
        category: z
          .string()
          .optional()
          .describe('Category/topic for this summary (optional in builder mode)'),
      }),
      execute: async ({ summaryPoints, relatedFactIds, category }) => {
        const summaryId = await saveSingleDOK2Summary({
          brainliftId: brainlift.id,
          category: category ?? 'Uncategorized',
          sourceName: item.topic,
          sourceUrl: item.url,
          points: summaryPoints,
          relatedFactIds,
          ...(isBuilder ? { learningStreamItemId: item.id } : {}),
        });

        // Auto-bookmark if item was still pending
        if (isBuilder) {
          await autoBookmarkIfPending(item.id);
        }

        // Queue DOK2 grading job (fire-and-forget)
        withJob('discussion:grade-dok2')
          .forPayload({ summaryId, brainliftId: brainlift.id })
          .queue()
          .catch((err) =>
            console.error('[Discussion] Failed to queue DOK2 grading:', err)
          );

        return {
          summaryId,
          points: summaryPoints,
          relatedFactCount: relatedFactIds.length,
          category: category ?? null,
          ...(isBuilder ? {
            learningStreamItemId: item.id,
            categoryLabel: category || 'Uncategorized',
          } : {}),
        };
      },
    }),

    get_brainlift_context: tool({
      description:
        'Get existing BrainLift knowledge — top-scoring facts, followed experts, and topics already covered. Use to cross-reference what the user is learning.',
      inputSchema: z.object({}),
      execute: async () => {
        const context = await storage.getLearningStreamContext(brainlift.id);
        if (!context) {
          return { error: 'Could not load BrainLift context' };
        }

        const baseResult = {
          purpose: brainlift.displayPurpose || brainlift.description,
          topFacts: context.facts,
          followedExperts: context.experts,
          existingTopics: context.existingTopics,
        };

        // In builder mode, include item-specific extraction state
        if (isBuilder) {
          const itemDetail = await storage.getItemDetail(item.id, brainlift.id);
          // AI Writing Signal labels for the DOK2 summaries linked to this
          // learning stream item. Empty array short-circuits with empty Map
          // (no SQL issued) per pangramAssessmentsStorage contract. Field
          // travels as snake_case `ai_writing_signal` per decisions §15.
          const summaryIds = itemDetail
            ? itemDetail.summaries.map(s => s.id)
            : [];
          const aiWritingSignals = await pangramAssessmentsStorage.getLabelsByEntities(
            'dok2_summary',
            summaryIds,
          );
          return {
            ...baseResult,
            itemExtraction: itemDetail ? {
              itemId: item.id,
              facts: itemDetail.facts.map(f => ({
                id: f.id,
                originalId: f.originalId,
                fact: f.fact,
              })),
              summaries: itemDetail.summaries.map(s => ({
                id: s.id,
                preview: s.text[0] || '(empty)',
                ai_writing_signal: aiWritingSignals.get(s.id) ?? null,
              })),
            } : {
              itemId: item.id,
              facts: [],
              summaries: [],
            },
          };
        }

        return baseResult;
      },
    }),

    read_article_section: tool({
      description:
        'Read the extracted content of the article/source the user is studying. Returns markdown text if available.',
      inputSchema: z.object({}),
      execute: async () => {
        // Re-fetch item to get latest extractedContent (may have been extracted since conversation started)
        const freshItem = await storage.getLearningStreamItemById(
          item.id,
          brainlift.id
        );

        if (!freshItem) {
          return { error: 'Item not found' };
        }

        const content = freshItem.extractedContent;

        if (!content) {
          // Trigger on-demand extraction
          withJob('learning-stream:extract-content')
            .forPayload({
              itemId: item.id,
              brainliftId: brainlift.id,
              url: item.url,
            })
            .withOptions({ jobKey: `extract-content-${item.id}` })
            .queue()
            .catch((err) =>
              console.error('[Discussion] Failed to queue content extraction:', err)
            );

          return {
            status: 'pending',
            message:
              'Content extraction has been triggered. It may take a moment. For now, work from the article metadata or ask the user to share relevant passages.',
          };
        }

        if (content.contentType === 'article') {
          let markdown = content.markdown;
          // Cap at ~3000 words
          const words = markdown.split(/\s+/);
          if (words.length > 3000) {
            markdown =
              words.slice(0, 3000).join(' ') +
              '\n\n[Content truncated — approximately 3000 words shown]';
          }
          return {
            contentType: 'article',
            title: content.title || item.topic,
            markdown,
          };
        }

        if (content.contentType === 'embed') {
          // YouTube embeds: fetch transcript on demand
          if (content.embedType === 'youtube') {
            const transcript = await ensureItemTextContent(freshItem);
            if (transcript) {
              let markdown = transcript;
              const words = markdown.split(/\s+/);
              if (words.length > 3000) {
                markdown =
                  words.slice(0, 3000).join(' ') +
                  '\n\n[Content truncated — approximately 3000 words shown]';
              }
              return {
                contentType: 'transcript',
                title: freshItem.topic,
                markdown,
              };
            }
          }

          return {
            contentType: 'embed',
            embedType: content.embedType,
            message: `This is a ${content.embedType} embed. You cannot read the media content directly — work from the metadata and what the user tells you.`,
          };
        }

        if (content.contentType === 'pdf') {
          return {
            contentType: 'pdf',
            message:
              'This is a PDF document. The raw content may not be fully extractable. Work with what the user shares.',
          };
        }

        if (content.contentType === 'fallback') {
          return {
            contentType: 'fallback',
            reason: content.reason,
            message:
              'Content extraction failed. Work from the article metadata and what the user shares.',
          };
        }

        return {
          contentType: 'unknown',
          message: 'Content format not recognized. Work from metadata and user input.',
        };
      },
    }),
  };

  if (isResearch) {
    // Research phase: drop DOK extraction tools, keep context/read + Second Brain.
    const { save_dok1_fact, save_dok2_summary, ...researchSafe } = dokTools;
    return { ...researchSafe, ...secondBrainTools };
  }

  return { ...dokTools, ...secondBrainTools };
}
