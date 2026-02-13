import { Router } from 'express';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-handler';
import { requireBrainliftAccess } from '../middleware/brainlift-auth';
import { buildDiscussionSystemPrompt } from '../ai/discussion/system-prompt';
import { buildDiscussionTools } from '../ai/discussion/tools';

export const discussionRouter = Router();

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * POST /api/brainlifts/:slug/discussion
 * Streaming discussion endpoint using Vercel AI SDK + Anthropic Sonnet.
 * Accepts UIMessage[] from the frontend, streams SSE tokens back.
 */
discussionRouter.post(
  '/api/brainlifts/:slug/discussion',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const { messages, itemId } = req.body as {
      messages: UIMessage[];
      itemId: number;
    };

    if (!messages || !Array.isArray(messages)) {
      throw new BadRequestError('messages array is required');
    }

    if (!itemId || typeof itemId !== 'number') {
      throw new BadRequestError('itemId (number) is required');
    }

    // Validate item exists and belongs to this brainlift
    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Learning stream item not found');
    }

    const systemPrompt = buildDiscussionSystemPrompt(item, brainlift);
    const tools = buildDiscussionTools(item, brainlift);

    const result = streamText({
      model: anthropic('claude-sonnet-4-5'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(5),
    });

    result.pipeUIMessageStreamToResponse(res);
  })
);

/**
 * GET /api/brainlifts/:slug/discussion/suggestions?itemId=123
 * Returns 3 AI-generated discussion starter suggestions for a learning stream item.
 * Uses Haiku for fast, cheap generation (~500ms).
 */
discussionRouter.get(
  '/api/brainlifts/:slug/discussion/suggestions',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const itemId = parseInt(req.query.itemId as string);

    if (isNaN(itemId)) {
      throw new BadRequestError('itemId query parameter is required');
    }

    const item = await storage.getLearningStreamItemById(itemId, brainlift.id);
    if (!item) {
      throw new NotFoundError('Learning stream item not found');
    }

    const purpose = brainlift.displayPurpose || brainlift.description || 'General learning';

    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      prompt: `You are generating discussion starter suggestions for a student studying a resource.

BRAINLIFT PURPOSE: ${purpose}

RESOURCE:
- Title: ${item.topic}
- Type: ${item.type}
- Author: ${item.author}
${item.facts ? `- Key Insights: ${item.facts}` : ''}
${item.aiRationale ? `- Why This Matters: ${item.aiRationale}` : ''}

Generate exactly 3 short discussion prompts that a student might ask to start learning from this resource. Follow the DOK framework progression:
1. First prompt: Help extract a specific fact from this resource (DOK1 level)
2. Second prompt: Explore a connection or pattern in the resource (DOK1→DOK2 bridge)
3. Third prompt: Connect the resource to the brainlift purpose (DOK2 level)

Rules:
- Each prompt should be 8-15 words, written as a natural question or request
- Be specific to THIS resource — reference actual topics/concepts from it
- Don't be generic (no "summarize this article" or "what is this about")

Return ONLY a JSON array of 3 objects with "text" (short label, 4-8 words) and "prompt" (the full question). No other text.
Example: [{"text":"Key finding on retention","prompt":"What was the main finding about retention rates in this study?"}]`,
    });

    try {
      // Strip markdown code fences if Haiku wraps the JSON
      const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      const suggestions = JSON.parse(cleaned);
      res.json({ suggestions });
    } catch (err) {
      console.error('[discussion/suggestions] Failed to parse Haiku response:', text);
      res.json({ suggestions: [] });
    }
  })
);
