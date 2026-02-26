import { Router } from 'express';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import fs from 'fs/promises';
import path from 'path';
import pLimit from 'p-limit';
import { storage } from '../storage';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { requireBrainliftAccess, requireBrainliftModify } from '../middleware/brainlift-auth';
import { buildImportAgentSystemPrompt } from '../ai/import-agent/system-prompt';
import { buildImportAgentTools } from '../ai/import-agent/tools';
import { importLog, importError } from '../ai/import-agent/logger';
import { createSSEResponse } from '../utils/sse';
import { summarizeFact } from '../ai/factSummarizer';
import { fetchEvidenceForFact } from '../ai/evidenceFetcher';
import { verifyFactWithAllModels } from '../ai/factVerifier';
import { gradeDOK2Summary } from '../ai/dok2Grader';
import { gradeDOK3Insight } from '../ai/dok3Grader';
import { recomputeBrainliftScore, runPostProcessingPipeline } from '../services/brainlift';
import { createBrainliftForAgent } from '../services/import-agent';
import { STAGE_LABELS } from '@shared/import-progress';
import type { ImportPhase } from '@shared/schema';

export const importAgentRouter = Router();

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * POST /api/brainlifts/create-for-agent
 * Create a brainlift from a Workflowy URL with full metadata extraction.
 * Used by the production AddBrainliftModal to prepare a brainlift for agent import.
 */
importAgentRouter.post(
  '/api/brainlifts/create-for-agent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { url, sourceType } = req.body as { url?: string; sourceType?: string };

    if (!url || typeof url !== 'string') {
      throw new BadRequestError('Missing or invalid "url" parameter');
    }

    if (sourceType !== 'workflowy') {
      throw new BadRequestError('Only Workflowy imports are supported for agent mode');
    }

    const userId = req.authContext?.userId;
    const data = await createBrainliftForAgent(url, userId);

    res.json(data);
  })
);

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

    const userName = req.session?.user?.name || undefined;
    const userRole = req.authContext?.role || undefined;

    importLog(brainlift.id, 'User context for prompt', {
      userName,
      userRole,
      sessionUser: req.session?.user ? { id: req.session.user.id, name: req.session.user.name, email: req.session.user.email } : null,
      brainliftAuthor: brainlift.author,
    });

    const systemPrompt = buildImportAgentSystemPrompt({
      brainlift,
      currentPhase,
      confirmedSources,
      savedFactsCount,
      savedDOK2Count,
      savedDOK3Count,
      userName,
      userRole,
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

/**
 * POST /api/brainlifts/:slug/start-grading
 * SSE endpoint that runs the full grading cascade on agent-imported (ungraded) data.
 * DOK1 verify → DOK2 grade → DOK3 grade → score recompute → experts → redundancy
 * NOT wrapped in asyncHandler — SSE endpoints manage their own response lifecycle.
 */
importAgentRouter.post(
  '/api/brainlifts/:slug/start-grading',
  requireAuth,
  requireBrainliftModify,
  async (req, res) => {
    const brainlift = req.brainlift!;
    const sse = createSSEResponse(res);

    importLog(brainlift.id, 'Starting grading cascade');

    try {
      // ── 1. DOK1 Verification ──────────────────────────────────────────
      const allFacts = await storage.getFactsForBrainlift(brainlift.id);
      const ungradedFacts = allFacts.filter(f => f.score === 0);

      importLog(brainlift.id, 'DOK1 grading', {
        total: allFacts.length,
        ungraded: ungradedFacts.length,
      });

      const failedUrlCache = new Map<string, string>();
      const dok1Limit = pLimit(60);
      let dok1Completed = 0;
      const dok1Total = ungradedFacts.length;

      sse.send({
        stage: 'grading',
        message: STAGE_LABELS.grading,
        completed: 0,
        total: dok1Total,
      });

      await Promise.all(ungradedFacts.map(fact => dok1Limit(async () => {
        try {
          const summary = await summarizeFact(fact.fact);

          // Extract URL from fact.source — agent stores as "SourceName (https://...)"
          let sourceUrl: string | null = null;
          if (fact.source) {
            const urlMatch = fact.source.match(/\((https?:\/\/[^\s)]+)\)/);
            if (urlMatch) {
              sourceUrl = urlMatch[1];
            } else {
              // Try bare URL in source field
              const bareMatch = fact.source.match(/https?:\/\/[^\s]+/);
              if (bareMatch) sourceUrl = bareMatch[0];
            }
          }

          let evidenceContent = '';
          let linkFailed = false;

          if (sourceUrl) {
            try {
              const evidence = await fetchEvidenceForFact(fact.fact, sourceUrl, failedUrlCache);
              evidenceContent = evidence.content || '';
              if (!evidenceContent) linkFailed = true;
            } catch {
              linkFailed = true;
            }
          }

          const verification = await verifyFactWithAllModels(
            fact.fact,
            fact.source || '',
            evidenceContent,
            linkFailed
          );

          let finalScore = verification.consensus.consensusScore;
          let rationale = verification.consensus.verificationNotes;
          let isGradeable = true;

          if (verification.consensus.isNonGradeable) {
            rationale = `As the source link is not accessible, this DOK1 could not be graded - ${rationale}`;
            isGradeable = false;
            finalScore = 0;
          }

          // Format note with source hyperlink
          let sourceHyperlink = '';
          if (sourceUrl) {
            sourceHyperlink = `Source: [${sourceUrl}](${sourceUrl})`;
          } else {
            sourceHyperlink = 'No sources have been linked to this fact';
          }
          const note = `${rationale}\n\n${sourceHyperlink}`;

          await storage.updateFactGrading(fact.id, brainlift.id, {
            score: finalScore,
            note,
            isGradeable,
            summary,
          });
        } catch (err: any) {
          console.error(`[Cascade] DOK1 fact ${fact.id} failed:`, err.message);
          await storage.updateFactGrading(fact.id, brainlift.id, {
            score: 0,
            note: 'Verification failed due to a system error.',
            isGradeable: false,
            summary: fact.fact.substring(0, 100),
          });
        }

        dok1Completed++;
        sse.send({
          stage: 'grading',
          message: STAGE_LABELS.grading,
          completed: dok1Completed,
          total: dok1Total,
        });
      })));

      // ── 2. DOK2 Grading ───────────────────────────────────────────────
      const allDok2s = await storage.getDOK2Summaries(brainlift.id);
      const ungradedDok2s = allDok2s.filter(s => s.grade === null);

      importLog(brainlift.id, 'DOK2 grading', {
        total: allDok2s.length,
        ungraded: ungradedDok2s.length,
      });

      const dok2Limit = pLimit(10);
      let dok2Completed = 0;
      const dok2Total = ungradedDok2s.length;
      const dok2FailedUrlCache = new Map<string, string>();

      // Get brainlift purpose for grading context
      const brainliftData = await storage.getBrainliftById(brainlift.id);
      const brainliftPurpose = brainliftData?.description || brainliftData?.title || '';

      sse.send({
        stage: 'grading_dok2',
        message: STAGE_LABELS.grading_dok2,
        completed: 0,
        total: dok2Total,
      });

      // Reload facts (now graded) for DOK2 context
      const gradedFacts = await storage.getFactsForBrainlift(brainlift.id);

      await Promise.all(ungradedDok2s.map(dok2 => dok2Limit(async () => {
        const relatedDOK1s = dok2.relatedFactIds
          .map(fid => gradedFacts.find(f => f.id === fid))
          .filter((f): f is NonNullable<typeof f> => f !== undefined)
          .map(f => ({ fact: f.fact, source: f.source }));

        const summaryPoints = dok2.points.map(p => p.text);

        try {
          const gradeResult = await gradeDOK2Summary(
            summaryPoints,
            relatedDOK1s,
            brainliftPurpose,
            dok2.sourceUrl,
            dok2FailedUrlCache
          );

          await storage.updateDOK2Grading(dok2.id, brainlift.id, {
            displayTitle: gradeResult.displayTitle,
            grade: gradeResult.score,
            diagnosis: gradeResult.diagnosis,
            feedback: gradeResult.feedback,
            failReason: gradeResult.failReason,
            sourceVerified: gradeResult.sourceVerified,
          });
        } catch (err: any) {
          console.error(`[Cascade] DOK2 summary ${dok2.id} failed:`, err.message);
          await storage.updateDOK2Grading(dok2.id, brainlift.id, {
            displayTitle: null,
            grade: 3,
            diagnosis: 'Grading failed due to a system error.',
            feedback: 'Please try re-importing this BrainLift.',
            failReason: null,
            sourceVerified: false,
          });
        }

        dok2Completed++;
        sse.send({
          stage: 'grading_dok2',
          message: STAGE_LABELS.grading_dok2,
          completed: dok2Completed,
          total: dok2Total,
        });
      })));

      // ── 3. DOK3 Grading ───────────────────────────────────────────────
      const allInsights = await storage.getDOK3Insights(brainlift.id);
      const linkedInsights = allInsights.filter(i => i.status === 'linked');

      importLog(brainlift.id, 'DOK3 grading', {
        total: allInsights.length,
        linked: linkedInsights.length,
      });

      if (linkedInsights.length > 0) {
        const dok3Limit = pLimit(5);
        let dok3Completed = 0;
        const dok3Total = linkedInsights.length;

        sse.send({
          stage: 'grading_dok3',
          message: STAGE_LABELS.grading_dok3,
          completed: 0,
          total: dok3Total,
        });

        await Promise.all(linkedInsights.map(insight => dok3Limit(async () => {
          try {
            await gradeDOK3Insight(insight.id, brainlift.id);
          } catch (err: any) {
            console.error(`[Cascade] DOK3 insight ${insight.id} failed:`, err.message);
          }

          dok3Completed++;
          sse.send({
            stage: 'grading_dok3',
            message: STAGE_LABELS.grading_dok3,
            completed: dok3Completed,
            total: dok3Total,
          });
        })));
      }

      // ── 4. Score Recomputation ────────────────────────────────────────
      await recomputeBrainliftScore(brainlift.id);

      // ── 5. Post-processing (experts + redundancy + image job) ─────────
      const finalFacts = await storage.getFactsForBrainlift(brainlift.id);
      await runPostProcessingPipeline(
        {
          brainliftId: brainlift.id,
          slug: brainlift.slug,
          title: brainlift.title,
          description: brainliftData?.description || '',
          author: brainliftData?.author || null,
          facts: finalFacts,
          originalContent: brainlift.originalContent || '',
        },
        (event) => sse.send(event)
      );

      // ── 6. Finalize ──────────────────────────────────────────────────
      await storage.updateImportStatus(brainlift.id, 'complete');
      await storage.deleteImportConversation(brainlift.id);

      importLog(brainlift.id, 'Grading cascade complete');

      sse.send({
        stage: 'complete',
        message: 'Import complete!',
        slug: brainlift.slug,
      });
      sse.close();
    } catch (err: any) {
      importError(brainlift.id, 'Grading cascade failed', err);
      sse.error(err.message || 'Grading cascade failed');
    }
  }
);
