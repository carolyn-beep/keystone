/**
 * In-process MCP server for the Learning Stream Swarm.
 * Provides tools for brainlift context, duplicate checking, and item saving.
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { storage } from '../../storage';

/**
 * Get brainlift context for research.
 * Returns title, purpose, top facts, top experts, and existing topics.
 */
const getBrainliftContextTool = tool(
  'get_brainlift_context',
  'Get brainlift context including title, purpose, top facts, experts, and existing topics for research targeting',
  {
    brainliftId: z.number().describe('The brainlift ID to get context for'),
  },
  async (args) => {
    const context = await storage.getLearningStreamContext(args.brainliftId);

    if (!context) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `Brainlift not found: ${args.brainliftId}` }),
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(context, null, 2),
      }],
    };
  }
);

/**
 * Check if a URL already exists in the learning stream for a brainlift.
 */
const checkDuplicateTool = tool(
  'check_duplicate',
  'Check if a URL already exists in the learning stream for this brainlift',
  {
    brainliftId: z.number().describe('The brainlift ID'),
    url: z.url().describe('The URL to check for duplicates'),
  },
  async (args) => {
    const isDuplicate = await storage.checkLearningStreamDuplicate(args.brainliftId, args.url);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ isDuplicate, url: args.url }),
      }],
    };
  }
);

/**
 * Save a learning resource item to the database.
 */
const saveLearningItemTool = tool(
  'save_learning_item',
  'Save a researched learning resource to the learning stream',
  {
    brainliftId: z.number().describe('The brainlift ID'),
    type: z.enum(['Substack', 'Twitter', 'Academic Paper', 'Podcast', 'Video'])
      .describe('Type of resource'),
    author: z.string().describe('Author name'),
    topic: z.string().max(100).describe('Brief title or topic (max 100 chars)'),
    time: z.string().describe('Estimated consumption time (e.g., "5 min", "15 min", "1 hour")'),
    facts: z.string().describe('2-3 sentence summary of key insights'),
    url: z.url().describe('URL of the resource'),
    relevanceScore: z.string().describe('Relevance score as string (e.g., "0.85")'),
    aiRationale: z.string().describe('Why this resource is valuable for learning'),
  },
  async (args) => {
    try {
      const item = await storage.addLearningStreamItem(args.brainliftId, {
        type: args.type,
        author: args.author,
        topic: args.topic.substring(0, 100),
        time: args.time,
        facts: args.facts,
        url: args.url,
        source: 'swarm-research',
        relevanceScore: args.relevanceScore,
        aiRationale: args.aiRationale,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            itemId: item.id,
            topic: item.topic,
            url: item.url,
          }),
        }],
      };
    } catch (error: any) {
      // Handle duplicate constraint violation gracefully
      if (error.code === '23505') {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: 'duplicate',
              message: 'URL already exists for this brainlift',
              url: args.url,
            }),
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: 'unknown',
            message: error.message,
          }),
        }],
      };
    }
  }
);

/**
 * Create the MCP server instance for the learning stream swarm.
 */
export function createLearningStreamMcpServer() {
  return createSdkMcpServer({
    name: 'learning-stream',
    version: '1.0.0',
    tools: [
      getBrainliftContextTool,
      checkDuplicateTool,
      saveLearningItemTool,
    ],
  });
}
