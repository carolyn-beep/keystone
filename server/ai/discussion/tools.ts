import { tool } from 'ai';
import { z } from 'zod';
import { db, eq, sql, facts, learningStreamItems } from '../../storage/base';
import { storage } from '../../storage';
import { saveSingleDOK2Summary } from '../../storage/dok2';
import { withJob } from '../../utils/withJob';
import type { LearningStreamItem, Brainlift } from '../../storage/base';

/**
 * Build the 4 discussion tools, closing over request context.
 */
export function buildDiscussionTools(
  item: LearningStreamItem,
  brainlift: Pick<Brainlift, 'id' | 'displayPurpose' | 'description'>
) {
  // Track DOK1 facts saved this session for originalId sequencing
  let sessionFactSeq = 0;

  return {
    save_dok1_fact: tool({
      description:
        'Save a DOK1 fact that the user has articulated. Only call this after the user agrees to save it.',
      inputSchema: z.object({
        fact: z.string().describe('The objective, verifiable fact text'),
        category: z.string().describe('Category/topic this fact belongs to'),
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

        // Insert the fact
        const [inserted] = await db
          .insert(facts)
          .values({
            brainliftId: brainlift.id,
            originalId,
            category,
            source: item.url,
            fact,
            score: 0,
            isGradeable: true,
          })
          .returning();

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
        };
      },
    }),

    save_dok2_summary: tool({
      description:
        'Save a DOK2 summary — the user\'s synthesis of multiple DOK1 facts. Only call after the user articulates their interpretation and agrees to save.',
      inputSchema: z.object({
        summaryPoints: z
          .array(z.string())
          .describe('The summary points the user articulated'),
        relatedFactIds: z
          .array(z.number())
          .describe('Database IDs of DOK1 facts this summary synthesizes'),
        category: z
          .string()
          .describe('Category/topic for this summary'),
      }),
      execute: async ({ summaryPoints, relatedFactIds, category }) => {
        const summaryId = await saveSingleDOK2Summary({
          brainliftId: brainlift.id,
          category,
          sourceName: item.topic,
          sourceUrl: item.url,
          points: summaryPoints,
          relatedFactIds,
        });

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
          category,
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

        return {
          purpose: brainlift.displayPurpose || brainlift.description,
          topFacts: context.facts,
          followedExperts: context.experts,
          existingTopics: context.existingTopics,
        };
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
}
