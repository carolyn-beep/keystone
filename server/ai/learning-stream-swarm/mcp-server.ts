/**
 * HTTP MCP server for the Learning Stream Swarm.
 *
 * Serves tools over Streamable HTTP so both the orchestrator AND subagents
 * can access them. (In-process MCP servers are only visible to the orchestrator.)
 *
 * Lifecycle: call startMcpServer() before the swarm, stopMcpServer() after.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import http from 'http';
import { z } from 'zod';
import { storage } from '../../storage';

export interface McpServerHandle {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Start a local HTTP MCP server exposing brainlift context, duplicate check,
 * and save_learning_item tools. Returns the URL and a stop function.
 */
/**
 * Register all learning-stream tools on an McpServer instance.
 */
function registerTools(mcpServer: McpServer) {
  mcpServer.tool(
    'get_brainlift_context',
    'Get brainlift context including title, purpose, top facts, experts, and existing topics for research targeting',
    { brainliftId: z.number().describe('The brainlift ID to get context for') },
    async (args) => {
      const context = await storage.getLearningStreamContext(args.brainliftId);
      if (!context) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Brainlift not found: ${args.brainliftId}` }) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
      };
    },
  );

  mcpServer.tool(
    'check_duplicate',
    'Check if a URL already exists in the learning stream for this brainlift',
    {
      brainliftId: z.number().describe('The brainlift ID'),
      url: z.string().describe('The URL to check for duplicates'),
    },
    async (args) => {
      const trimmedUrl = args.url.trim();
      const isDuplicate = await storage.checkLearningStreamDuplicate(args.brainliftId, trimmedUrl);
      return {
        content: [{ type: 'text', text: JSON.stringify({ isDuplicate, url: trimmedUrl }) }],
      };
    },
  );

  mcpServer.tool(
    'save_learning_item',
    'Save a researched learning resource to the learning stream',
    {
      brainliftId: z.number().describe('The brainlift ID'),
      type: z.enum(['Substack', 'Twitter', 'Academic Paper', 'Podcast', 'Video', 'News']).describe('Type of resource'),
      author: z.string().describe('Author name'),
      topic: z.string().describe('Brief title or topic (max 100 chars)'),
      time: z.string().describe('Estimated consumption time (e.g., "5 min", "15 min", "1 hour")'),
      facts: z.string().describe('2-3 sentence summary of key insights'),
      url: z.string().describe('URL of the resource'),
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
          url: args.url.trim(),
          source: 'swarm-research',
          relevanceScore: args.relevanceScore,
          aiRationale: args.aiRationale,
        });

        return {
          content: [{ type: 'text', text: JSON.stringify({ success: true, itemId: item.id, topic: item.topic, url: item.url }) }],
        };
      } catch (error: any) {
        // Handle duplicate constraint violation gracefully
        const pgCode = error.cause?.code ?? error.code;
        if (pgCode === '23505') {
          return {
            content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'duplicate', message: 'URL already exists for this brainlift', url: args.url }) }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'unknown', message: error.message }) }],
        };
      }
    },
  );
}

export async function startMcpServer(): Promise<McpServerHandle> {
  const app = express();
  app.use(express.json());

  // McpServer can only connect() once, so we create a fresh instance per request
  app.post('/mcp', async (req, res) => {
    const server = new McpServer(
      { name: 'learning-stream', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    registerTools(server);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Health check for debugging
  app.get('/mcp', (_req, res) => {
    res.json({ status: 'ok', server: 'learning-stream-mcp' });
  });

  const httpServer = http.createServer(app);

  return new Promise<McpServerHandle>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}/mcp`;
      console.log(`[Swarm MCP] HTTP server listening on ${url}`);

      resolve({
        url,
        stop: () =>
          new Promise<void>((res, rej) => {
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
