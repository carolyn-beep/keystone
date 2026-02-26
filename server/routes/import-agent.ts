import { Router } from 'express';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { buildImportAgentSystemPrompt } from '../ai/import-agent/system-prompt';
import { buildImportAgentTools } from '../ai/import-agent/tools';
import { importLog, importError } from '../ai/import-agent/logger';
import type { ImportPhase } from '@shared/schema';

export const importAgentRouter = Router();

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * POST /api/brainlifts/:slug/import-agent
 * Streaming import agent endpoint using Vercel AI SDK + Anthropic Sonnet.
 * Accepts UIMessage[] from the frontend, streams SSE tokens back.
 * After streaming: saves conversation to DB for cross-session persistence.
 */
importAgentRouter.post(
  '/api/brainlifts/:slug/import-agent',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    const { messages } = req.body as { messages: UIMessage[] };

    if (!messages || !Array.isArray(messages)) {
      throw new BadRequestError('messages array is required');
    }

    importLog(brainlift.id, 'POST request received', {
      slug: brainlift.slug,
      messageCount: messages.length,
      lastMessageRole: messages[messages.length - 1]?.role,
    });

    // Load existing conversation for phase context
    const conversation = await storage.getImportConversation(brainlift.id);
    const currentPhase: ImportPhase = (conversation?.currentPhase as ImportPhase) || 'init';

    importLog(brainlift.id, 'Conversation loaded', {
      hasExisting: !!conversation,
      currentPhase,
      savedMessageCount: Array.isArray(conversation?.messages) ? conversation.messages.length : 0,
    });

    // Create mutable phase ref so tools can update the phase during execution
    const phaseRef: { value: ImportPhase } = { value: currentPhase };

    // Load context based on current phase
    const confirmedSources = currentPhase !== 'init' && currentPhase !== 'sources'
      ? await storage.getBrainliftSources(brainlift.id, 'confirmed')
      : undefined;

    if (confirmedSources) {
      importLog(brainlift.id, 'Loaded confirmed sources for context', {
        count: confirmedSources.length,
      });
    }

    // Load entity counts for system prompt (skip unnecessary queries for early phases)
    const pastSources = currentPhase !== 'init' && currentPhase !== 'sources';
    const pastDok1 = pastSources && currentPhase !== 'dok1';
    const inDok3OrLater = currentPhase === 'dok3' || currentPhase === 'dok3_linking' || currentPhase === 'final';

    const savedFactsCount = pastSources
      ? (await storage.getFactsForBrainlift(brainlift.id)).length
      : undefined;
    const savedDOK2Count = pastDok1
      ? (await storage.getDOK2Summaries(brainlift.id)).length
      : undefined;
    const savedDOK3Count = inDok3OrLater
      ? (await storage.getDOK3Insights(brainlift.id, [])).length
      : undefined;

    const systemPrompt = buildImportAgentSystemPrompt({
      brainlift,
      currentPhase,
      confirmedSources,
      savedFactsCount,
      savedDOK2Count,
      savedDOK3Count,
    });

    importLog(brainlift.id, 'System prompt built', {
      promptLength: systemPrompt.length,
      hasContent: !!brainlift.originalContent,
      contentWords: brainlift.originalContent?.split(/\s+/).length ?? 0,
    });

    // Write brainlift content to temp file for the bash tool
    const contentDir = `/tmp/import-agent/${brainlift.id}`;
    await fs.mkdir(contentDir, { recursive: true });
    await fs.writeFile(path.join(contentDir, 'brainlift.md'), brainlift.originalContent || '');

    const tools = buildImportAgentTools(brainlift, conversation, phaseRef, contentDir);

    importLog(brainlift.id, 'Starting streamText', {
      model: 'claude-sonnet-4-6',
      toolCount: Object.keys(tools).length,
      toolNames: Object.keys(tools),
    });

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(40),
      onFinish: async ({ finishReason, usage }) => {
        importLog(brainlift.id, 'Stream finished', {
          finishReason,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        });

        // Save conversation to DB after stream completes (use phaseRef for latest phase)
        try {
          await storage.saveImportConversation(
            brainlift.id,
            messages,
            phaseRef.value
          );
          importLog(brainlift.id, 'Conversation saved to DB', {
            phase: phaseRef.value,
            messageCount: messages.length,
          });
        } catch (err) {
          importError(brainlift.id, 'Failed to save conversation', err);
        }

        // Clean up temp file
        try {
          await fs.rm(contentDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      },
    });

    result.pipeUIMessageStreamToResponse(res);
  })
);

/**
 * GET /api/brainlifts/:slug/import-agent/conversation
 * Load the saved conversation for a brainlift (for session resume).
 */
importAgentRouter.get(
  '/api/brainlifts/:slug/import-agent/conversation',
  requireAuth,
  requireBrainliftAccess,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    importLog(brainlift.id, 'GET conversation');

    const conversation = await storage.getImportConversation(brainlift.id);

    importLog(brainlift.id, 'Conversation loaded', {
      found: !!conversation,
      phase: conversation?.currentPhase ?? null,
    });

    res.json({
      conversation: conversation
        ? {
            messages: conversation.messages,
            currentPhase: conversation.currentPhase,
            updatedAt: conversation.updatedAt,
          }
        : null,
    });
  })
);

/**
 * DELETE /api/brainlifts/:slug/import-agent/conversation
 * Discard the saved conversation (start fresh).
 */
importAgentRouter.delete(
  '/api/brainlifts/:slug/import-agent/conversation',
  requireAuth,
  requireBrainliftModify,
  asyncHandler(async (req, res) => {
    const brainlift = req.brainlift!;
    importLog(brainlift.id, 'DELETE conversation');

    await storage.deleteImportConversation(brainlift.id);

    importLog(brainlift.id, 'Conversation deleted');
    res.json({ deleted: true });
  })
);
