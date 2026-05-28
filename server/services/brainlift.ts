import { storage } from "../storage";
import { generateUniqueSlug } from "../utils/slug";
import { summarizeFact } from "../ai/factSummarizer";
import { verifyFactWithAllModels } from "../ai/factVerifier";
import { fetchEvidenceForFact, type EvidenceResult } from "../ai/evidenceFetcher";
import { resolveYouTubeTranscript } from "../utils/resolve-youtube-transcript";
import { extractAndRankExperts, diagnoseExpertFormat } from "../ai/experts";
import { analyzeFactRedundancy } from "../ai/redundancyAnalyzer";
import { gradeDOK2Summary, type DOK2GradeResult } from "../ai/dok2Grader";
import { type BrainliftOutput } from "../ai/brainliftExtractor";
import { type BrainliftData } from "@shared/schema";
import { type ImportProgress, STAGE_LABELS } from "@shared/import-progress";
import { recordBrainliftScoreEvent } from "./analytics-score-events";
import { formatBrainliftOverallScore } from "./brainlift-score";
import type { PersistFactVerificationInput, ScoreEventContext } from "@shared/analytics-types";
import { persistFactVerification } from "./persist-fact-verification";
import pLimit from "p-limit";
import { withRetryTimeout } from "../utils/timeout";
import { enqueuePangramAnalysis } from "../ai/pangram/enqueue";

interface PostProcessingInput {
  brainliftId: number;
  slug: string;
  title: string;
  description: string;
  author: string | null;
  facts: Array<{ id?: number; fact: string; source?: string | null; note?: string | null; score?: number }>;
  originalContent: string;
}

type ProgressCallback = (event: ImportProgress) => void;

type GradedFactSummary = {
  originalId: string;
  category: string | null;
  source: string | null;
  fact: string;
  summary: string;
  score: number;
  contradicts: string | null;
  note: string | null;
  flags: string[];
  isGradeable: boolean;
  evidence?: PersistFactVerificationInput['evidence'];
  verification?: PersistFactVerificationInput['verification'];
};

async function enqueuePangramAnalysisFromImport(input: {
  entityType: 'dok2_summary' | 'dok3_insight' | 'dok4_spov';
  entityId: number;
  brainliftId: number;
}): Promise<void> {
  try {
    await enqueuePangramAnalysis(input);
  } catch (err) {
    console.error(
      `[Auto-Grade] Failed to enqueue pangram:analyze for ${input.entityType} ${input.entityId}:`,
      err,
    );
  }
}

export async function extractBrainliftExperts(
  input: PostProcessingInput,
  onProgress?: ProgressCallback,
): Promise<void> {
  try {
    onProgress?.({ stage: 'experts', message: STAGE_LABELS.experts });
    const expertData = await extractAndRankExperts({
      brainliftId: input.brainliftId,
      title: input.title,
      description: input.description,
      author: input.author,
      facts: input.facts as any[],
      originalContent: input.originalContent,
    });

    if (expertData.length > 0) {
      await storage.saveExperts(input.brainliftId, expertData);
    }
  } catch (err) {
    console.error('Expert extraction failed during post-processing:', err);
  }
}

export async function analyzeBrainliftRedundancy(
  input: PostProcessingInput,
  onProgress?: ProgressCallback,
): Promise<void> {
  try {
    onProgress?.({ stage: 'redundancy', message: STAGE_LABELS.redundancy });
    const savedFacts = await storage.getFactsForBrainlift(input.brainliftId);
    const redundancyResult = await analyzeFactRedundancy(savedFacts);

    if (redundancyResult.redundancyGroups.length > 0) {
      await storage.saveRedundancyGroups(input.brainliftId, redundancyResult.redundancyGroups.map(g => ({
        groupName: g.groupName,
        factIds: g.factIds,
        primaryFactId: g.primaryFactId,
        similarityScore: g.similarityScore,
        reason: g.reason,
        status: 'pending' as const,
      })));
    }
  } catch (err) {
    console.error('Redundancy analysis failed during post-processing:', err);
  }
}

export async function queueBrainliftAssetJobs(input: Pick<PostProcessingInput, 'brainliftId' | 'slug'>): Promise<void> {
  try {
    const { withJob } = await import('../utils/withJob');

    await withJob('brainlift:generate-image')
      .forPayload({
        brainliftId: input.brainliftId,
      })
      .queue();

    console.log(`[Brainlift Image] Image generation job queued for brainlift ${input.slug}`);
  } catch (jobErr) {
    // Don't fail the import if job queuing fails
    console.error('[Brainlift Image] Failed to queue image generation job:', jobErr);
  }
}

/**
 * Recompute the combined BrainLift meanScore from fresh DB data.
 * Formula:
 *   - If all 4 DOK levels: DOK1 * 0.25 + DOK2 * 0.25 + DOK3 * 0.25 + DOK4 * 0.25
 *   - If DOK1+DOK2+DOK3 (no DOK4): DOK1 * 0.33 + DOK2 * 0.34 + DOK3 * 0.33
 *   - If DOK1+DOK2 only: (DOK1 + DOK2) / 2  (50/50)
 *   - If only one category: use that single mean
 */
export async function recomputeBrainliftScore(
  brainliftId: number,
  analyticsContext: Omit<ScoreEventContext, 'brainliftId'> = { trigger: 'pipeline' }
): Promise<void> {
  const [dok1Mean, dok2Mean, dok3Mean, dok4Mean] = await Promise.all([
    storage.getDOK1MeanScore(brainliftId),
    storage.getDOK2MeanScore(brainliftId),
    storage.getDOK3MeanScore(brainliftId),
    storage.getDOK4MeanScore(brainliftId),
  ]);

  const brainlift = await storage.getBrainliftById(brainliftId);
  if (!brainlift) return;

  const combinedMeanScore = formatBrainliftOverallScore({
    dok1: dok1Mean,
    dok2: dok2Mean,
    dok3: dok3Mean,
    dok4: dok4Mean,
  });

  const existingSummary = (brainlift.summary as Record<string, unknown>) || {};
  await storage.updateBrainliftFields(brainliftId, {
    summary: {
      totalFacts: (existingSummary.totalFacts as number) || 0,
      meanScore: combinedMeanScore,
      score5Count: (existingSummary.score5Count as number) || 0,
      contradictionCount: (existingSummary.contradictionCount as number) || 0,
    },
  });

  try {
    await recordBrainliftScoreEvent({
      brainliftId,
      ...analyticsContext,
    });
  } catch (err) {
    console.error(`[Score] Analytics logging failed for brainlift ${brainliftId}:`, err);
  }

  console.log(`[Score] Recomputed brainlift ${brainliftId}: DOK1=${dok1Mean?.toFixed(2) ?? 'n/a'}, DOK2=${dok2Mean?.toFixed(2) ?? 'n/a'}, DOK3=${dok3Mean?.toFixed(2) ?? 'n/a'}, DOK4=${dok4Mean?.toFixed(2) ?? 'n/a'}, Combined=${combinedMeanScore}`);
}

export async function saveBrainliftFromAI(
  data: BrainliftOutput,
  originalContent?: string,
  sourceType?: string,
  userId?: string,
  retryCount = 0,
  onProgress?: ProgressCallback,
  autoLink?: boolean,
  existingBrainlift?: { id: number; slug: string },
): Promise<BrainliftData> {
  const shouldAutoLink = autoLink !== false; // default: true
  const MAX_RETRIES = 3;
  const slug = existingBrainlift?.slug ?? await generateUniqueSlug(data.title, retryCount);

  const batchStart = Date.now();
  const memStart = process.memoryUsage();
  console.log(`[Auto-Grade] === Starting saveBrainliftFromAI ===`);
  console.log(`[Auto-Grade] Title: "${data.title}", Facts count: ${data.facts.length}`);
  console.log(`[Auto-Grade] Memory at start: ${Math.round(memStart.heapUsed / 1024 / 1024)}MB heap, ${Math.round(memStart.rss / 1024 / 1024)}MB RSS`);

  const limit = pLimit(30);
  let completedCount = 0;
  const totalFacts = data.facts.length;
  const skipGrading = process.env.SKIP_GRADING === 'true';
  const skipDok1Grading = skipGrading || process.env.SKIP_DOK1_GRADING === 'true';

  if (skipDok1Grading) {
    console.log(`[Auto-Grade] ${skipGrading ? 'SKIP_GRADING' : 'SKIP_DOK1_GRADING'}=true - skipping DOK1 evidence fetch and LLM verification`);
  }

  // Emit initial grading progress
  onProgress?.({
    stage: 'grading',
    message: skipDok1Grading ? 'Skipping DOK1 grading' : STAGE_LABELS.grading,
    completed: 0,
    total: totalFacts,
  });

  // Cache failed URLs to avoid retrying the same 403/404 errors
  const failedUrlCache = new Map<string, string>();
  const transcriptCache = new Map<string, string | null>();

  // Run fact processing and contradiction detection in parallel
  const [factsWithSummaries, contradictionClusters] = await Promise.all([
    Promise.all(data.facts.map(fact => limit(async (): Promise<GradedFactSummary> => {
      // Fast path: skip DOK1 grading entirely
        if (skipDok1Grading) {
          completedCount++;
          onProgress?.({ stage: 'grading', message: 'Skipping DOK1 grading', completed: completedCount, total: totalFacts });
          return {
            originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary: fact.fact.substring(0, 100),
          score: 0,
            contradicts: fact.contradicts,
            note: fact.aiNotes || 'Grading skipped',
            flags: fact.flags || [],
            isGradeable: false,
          };
      }

      const factStart = Date.now();
      console.log(`[Auto-Grade] START fact ${fact.id} (${completedCount}/${data.facts.length} done)`);

      try {
        const result = await withRetryTimeout(async () => {
          const summary = await summarizeFact(fact.fact);

          // Auto-grading logic
          let evidence: EvidenceResult = {
            url: fact.source || null,
            content: null as string | null,
            error: null as string | null,
            fetchedAt: new Date(),
            mode: 'none',
            originalSourceUrl: fact.source || null,
          };

          // If source exists, fetch evidence
          let linkFailed = false;
          const hasSource = fact.aiNotes && fact.aiNotes.includes("Source: ");

          if (hasSource) {
            const sourceUrl = fact.aiNotes.split("Source: ")[1]?.trim();
            if (sourceUrl) {
              try {
                const cachedTranscript = await resolveYouTubeTranscript(sourceUrl, transcriptCache);
                const evidenceResult = await fetchEvidenceForFact(fact.fact, sourceUrl, failedUrlCache, cachedTranscript);
                evidence = evidenceResult;
                if (!evidence.content) linkFailed = true;
              } catch {
                evidence = {
                  url: sourceUrl,
                  content: null,
                  error: 'Evidence fetch failed',
                  fetchedAt: new Date(),
                  mode: 'none',
                  originalSourceUrl: sourceUrl,
                };
                linkFailed = true;
              }
            }
          }

          const verification = await verifyFactWithAllModels(fact.fact, fact.source || "", evidence, linkFailed);
          let finalScore = verification.consensus.consensusScore;
          let rationale = verification.consensus.verificationNotes;
          let isGradeable = true;

          if (verification.consensus.isNonGradeable) {
            rationale = `As the source link is not accessible, this DOK1 could not be graded - ${rationale}`;
            isGradeable = false;
            finalScore = 0;
          }

          // Format note: Rationale first, then hyperlinked source at the end
          let sourceHyperlink = "";
          if (fact.aiNotes && fact.aiNotes.includes("Source: ")) {
            const sourceUrl = fact.aiNotes.split("Source: ")[1]?.trim();
            if (sourceUrl) {
              sourceHyperlink = `Source: [${sourceUrl}](${sourceUrl})`;
            }
          } else if (fact.source && fact.source.startsWith("http")) {
            sourceHyperlink = `Source: [${fact.source}](${fact.source})`;
          } else {
            sourceHyperlink = "No sources have been linked to this fact";
          }

          return {
            originalId: fact.id,
            category: fact.category,
            source: fact.source || null,
            fact: fact.fact,
            summary,
            score: finalScore,
            contradicts: fact.contradicts,
            note: `${rationale}\n\n${sourceHyperlink}`,
            flags: fact.flags || [],
            isGradeable,
            evidence,
            verification,
          };
        }, 30_000, `fact ${fact.id}`);

        completedCount++;
        onProgress?.({ stage: 'grading', message: STAGE_LABELS.grading, completed: completedCount, total: totalFacts });
        const factElapsed = ((Date.now() - factStart) / 1000).toFixed(1);
        console.log(`[Auto-Grade] DONE fact ${fact.id} in ${factElapsed}s - score: ${result.score}/5 (${completedCount}/${data.facts.length})`);
        return result;
      } catch (err) {
        completedCount++;
        onProgress?.({ stage: 'grading', message: STAGE_LABELS.grading, completed: completedCount, total: totalFacts });
        const factElapsed = ((Date.now() - factStart) / 1000).toFixed(1);
        console.error(`[Auto-Grade] FAILED fact ${fact.id} in ${factElapsed}s:`, err);
        return {
          originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary: fact.fact.substring(0, 100),
          score: 0,
          contradicts: fact.contradicts,
          note: `Verification failed due to a system error.\n\n${fact.aiNotes || "No sources have been linked to this fact"}`,
          flags: fact.flags || [],
          isGradeable: false,
        };
      }
    }))),
    // Move findContradictions call here to run in parallel with fact processing
    (async () => {
      const { findContradictions } = await import("../ai/brainliftExtractor");
      return findContradictions(data.facts);
    })()
  ]);

  // Emit contradictions progress (already completed in parallel)
  onProgress?.({ stage: 'contradictions', message: STAGE_LABELS.contradictions });

  const batchElapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
  const memEnd = process.memoryUsage();
  const heapDelta = Math.round((memEnd.heapUsed - memStart.heapUsed) / 1024 / 1024);
  console.log(`[Auto-Grade] COMPLETE: ${data.facts.length} facts in ${batchElapsed}s`);
  console.log(`[Auto-Grade] Memory at end: ${Math.round(memEnd.heapUsed / 1024 / 1024)}MB heap (+${heapDelta}MB), ${Math.round(memEnd.rss / 1024 / 1024)}MB RSS`);

  // Calculate dynamic summary stats
  const totalFactsProcessed = factsWithSummaries.length;
  const gradeableFacts = factsWithSummaries.filter(f => f.isGradeable);
  const sumScores = gradeableFacts.reduce((sum, f) => sum + f.score, 0);
  const meanScore = gradeableFacts.length > 0 ? (sumScores / gradeableFacts.length).toFixed(2) : "0";
  const score5Count = factsWithSummaries.filter(f => f.score === 5).length;

  const clusters = contradictionClusters.map((c: any) => ({
    name: c.name,
    tension: c.tension,
    status: c.status,
    factIds: c.factIds,
    claims: c.claims,
  }));

  const dynamicSummary = {
    totalFacts: totalFactsProcessed,
    meanScore,
    score5Count,
    contradictionCount: factsWithSummaries.filter(f => f.contradicts).length || clusters.length
  };

  // Run expert format diagnostics on the original content
  const expertDiagnostics = originalContent ? await diagnoseExpertFormat(originalContent) : null;

  let brainlift: { id: number; slug: string };
  try {
    if (existingBrainlift) {
      // Update path: brainlift already exists (internal grade flow)
      // Update each fact's grade from the verification results
      const existingFacts = await storage.getFactsForBrainlift(existingBrainlift.id);
      const factIdMap = new Map(existingFacts.map(f => [f.originalId, f.id]));

      await Promise.all(factsWithSummaries.map(async (graded) => {
        const dbId = factIdMap.get(graded.originalId);
        if (dbId) {
          await storage.updateFactGrading(dbId, existingBrainlift.id, {
            score: graded.score,
            note: graded.note ?? '',
            isGradeable: graded.isGradeable,
            summary: graded.summary,
          });
        }
      }));

      // Update brainlift summary and diagnostics
      await storage.updateBrainliftFields(existingBrainlift.id, {
        summary: dynamicSummary,
        expertDiagnostics: expertDiagnostics || null,
      });

      brainlift = existingBrainlift;
    } else {
      // Create path: new brainlift (web UI import flow)
      brainlift = await storage.createBrainlift(
        {
          slug,
          title: data.title,
          description: data.description,
          displayPurpose: data.displayPurpose || null,  // Short UI-friendly summary
          author: data.owner || null,
          summary: dynamicSummary,
          classification: data.classification,
          improperlyFormatted: data.improperlyFormatted ?? false,
          rejectionReason: data.rejectionReason || null,
          rejectionSubtype: data.rejectionSubtype || null,
          rejectionRecommendation: data.rejectionRecommendation || null,
          originalContent: originalContent || null,
          sourceType: sourceType || null,
          origin: 'ui',
          expertDiagnostics: expertDiagnostics || null,
        },
        factsWithSummaries,
        clusters,
        userId
      );
    }

    const savedFacts = await storage.getFactsForBrainlift(brainlift.id);
    const factIdMap = new Map(savedFacts.map(f => [f.originalId, f.id]));

    await Promise.all(factsWithSummaries.map(async (graded) => {
      if (!graded.evidence || !graded.verification) {
        return;
      }

      const dbFactId = factIdMap.get(graded.originalId);
      if (!dbFactId) {
        return;
      }

      try {
        await persistFactVerification({
          factId: dbFactId,
          evidence: graded.evidence,
          verification: graded.verification,
        });
      } catch (err) {
        console.error(`[Auto-Grade] Failed to persist verification for fact ${graded.originalId}:`, err);
      }
    }));

    // Save DOK2 summaries if present (with grading)
    if (data.dok2Summaries && data.dok2Summaries.length > 0) {
      console.log(`[Auto-Grade] ${skipGrading ? 'Skipping grading and saving' : 'Grading and saving'} ${data.dok2Summaries.length} DOK2 summaries...`);

      // Build fact ID map: originalId -> database ID
      const savedFacts = await storage.getFactsForBrainlift(brainlift.id);
      const factIdMap = new Map(savedFacts.map(f => [f.originalId, f.id]));

      // Get brainlift purpose for grading context
      const brainliftPurpose = data.description || data.title;

      // Cache failed URLs to avoid retrying the same errors
      const dok2FailedUrlCache = new Map<string, string>();

      // Grade DOK2 summaries in parallel (with concurrency limit)
      const dok2Limit = pLimit(10); // More conservative limit for DOK2 grading
      let dok2CompletedCount = 0;
      const totalDOK2 = data.dok2Summaries.length;

      // Emit initial DOK2 grading progress
      onProgress?.({
        stage: 'grading_dok2',
        message: skipGrading ? 'Skipping DOK2 grading (SKIP_GRADING=true)' : STAGE_LABELS.grading_dok2,
        completed: 0,
        total: totalDOK2,
      });

      const gradedDOK2Summaries = await Promise.all(data.dok2Summaries.map(summary => dok2Limit(async () => {
        const dok2Start = Date.now();
        // Get related DOK1 facts for this summary
        type FactType = typeof data.facts[number];
        const relatedDOK1s = summary.relatedDOK1Ids
          .map((id: string) => data.facts.find((f: FactType) => f.id === id))
          .filter((f: FactType | undefined): f is FactType => f !== undefined)
          .map((f: FactType) => ({ fact: f.fact, source: f.source }));

        // Get summary point texts
        const summaryPoints = summary.points.map((p: { text: string }) => p.text);

        let gradeResult: DOK2GradeResult;

        // Fast path: skip DOK2 grading if SKIP_GRADING=true
        if (skipGrading) {
          dok2CompletedCount++;
          onProgress?.({ stage: 'grading_dok2', message: 'Skipping DOK2 grading', completed: dok2CompletedCount, total: totalDOK2 });
          return {
            ...summary,
            displayTitle: null,
            grade: 0,
            diagnosis: 'Grading skipped (SKIP_GRADING=true)',
            feedback: 'Grading skipped',
            failReason: null,
            sourceVerified: false,
          };
        }

        try {
          const dok2Transcript = summary.sourceUrl
            ? await resolveYouTubeTranscript(summary.sourceUrl, transcriptCache)
            : null;
          gradeResult = await gradeDOK2Summary(
            summaryPoints,
            relatedDOK1s,
            brainliftPurpose,
            summary.sourceUrl,
            dok2FailedUrlCache,
            dok2Transcript,
          );
        } catch (err: any) {
          console.error(`[Auto-Grade] DOK2 grading failed for "${summary.sourceName}":`, err.message);
          gradeResult = {
            displayTitle: null,
            score: 3,
            diagnosis: 'Grading failed due to a system error.',
            feedback: 'Please try re-importing this BrainLift.',
            failReason: null,
            sourceVerified: false,
          };
        }

        dok2CompletedCount++;
        onProgress?.({
          stage: 'grading_dok2',
          message: STAGE_LABELS.grading_dok2,
          completed: dok2CompletedCount,
          total: totalDOK2,
        });

        const dok2Elapsed = ((Date.now() - dok2Start) / 1000).toFixed(1);
        console.log(`[Auto-Grade] DOK2 graded "${summary.sourceName}" in ${dok2Elapsed}s: score=${gradeResult.score}, title="${gradeResult.displayTitle}" (${dok2CompletedCount}/${totalDOK2})`);

        return {
          ...summary,
          displayTitle: gradeResult.displayTitle,
          grade: gradeResult.score,
          diagnosis: gradeResult.diagnosis,
          feedback: gradeResult.feedback,
          failReason: gradeResult.failReason,
          sourceVerified: gradeResult.sourceVerified,
        };
      })));

      const savedDOK2SummaryIds = await storage.saveDOK2Summaries(brainlift.id, gradedDOK2Summaries, factIdMap);
      console.log(`[Auto-Grade] DOK2 summaries saved successfully with grades`);
      await Promise.all(savedDOK2SummaryIds.map((summaryId) => enqueuePangramAnalysisFromImport({
        entityType: 'dok2_summary',
        entityId: summaryId,
        brainliftId: brainlift.id,
      })));

      // Save DOK3 insights if present (both modes need them saved as pending_linking)
      if (data.dok3Insights && data.dok3Insights.length > 0) {
        console.log(`[Auto-Grade] Saving ${data.dok3Insights.length} DOK3 insights (pending_linking)...`);
        await storage.saveDOK3Insights(
          brainlift.id,
          data.dok3Insights.map((insight: { text: string; workflowyNodeId: string }) => ({
            text: insight.text,
            workflowyNodeId: insight.workflowyNodeId,
          }))
        );
        console.log(`[Auto-Grade] DOK3 insights saved successfully`);
      }

      // Save DOK4 SPOVs if present (both modes need them saved as pending_linking)
      console.log(`[Auto-Grade] DOK4 SPOVs in extraction output: ${data.dok4Spovs?.length ?? 0}`);
      if (data.dok4Spovs && data.dok4Spovs.length > 0) {
        console.log(`[Auto-Grade] Saving ${data.dok4Spovs.length} DOK4 SPOVs (pending_linking)...`);
        await storage.saveDOK4Spovs(
          brainlift.id,
          data.dok4Spovs.map(spov => ({
            text: spov.text,
            workflowyNodeId: spov.workflowyNodeId,
          }))
        );
        console.log(`[Auto-Grade] DOK4 SPOVs saved`);
      }

      // ── Conditional pipeline: auto vs manual mode ──
      if (shouldAutoLink) {
        // Auto mode: run full DOK3+DOK4 auto-link and grading pipeline inline
        console.log(`[Auto-Grade] Auto-link mode: running DOK3/DOK4 pipeline...`);
        const { runDOK3DOK4Pipeline } = await import('./grading-pipeline');

        // Thread explicit back-references from extraction data to skip LLM-based auto-linking
        const extractionData = (data.dok3Insights || data.dok4Spovs) ? {
          dok3ExplicitRefs: (data.dok3Insights || []).map((i: { explicitDok2Refs?: number[] | null }) => i.explicitDok2Refs ?? null),
          dok4ExplicitRefs: (data.dok4Spovs || []).map((s: { explicitDok3Refs?: number[] | null }) => s.explicitDok3Refs ?? null),
        } : undefined;

        await runDOK3DOK4Pipeline(brainlift.id, slug, onProgress, extractionData);
        // Pipeline calls recomputeBrainliftScore internally
      } else {
        // Manual mode: DOK3 insights stay pending_linking, emit info event for linking UI
        // DOK4 SPOVs stay pending_linking (NO auto-linking — deferred to DOK4LinkingUI)
        console.log(`[Auto-Grade] Manual mode: DOK3/DOK4 stay pending_linking`);

        if (data.dok3Insights && data.dok3Insights.length > 0) {
          // Rank sources for insights before emitting dok3_linking
          try {
            const { rankSourcesForInsights } = await import('../ai/dok3SourceRanker');
            const savedInsights = await storage.getDOK3Insights(brainlift.id, []);
            const insightInputs = savedInsights.map(i => ({ id: i.id, text: i.text }));

            const dok2s = await storage.getDOK2Summaries(brainlift.id);
            const sourceMap = new Map<string, { sourceName: string; dok2Titles: string[] }>();
            for (const d of dok2s) {
              const key = d.sourceName.toLowerCase().trim();
              if (!sourceMap.has(key)) {
                sourceMap.set(key, { sourceName: d.sourceName, dok2Titles: [] });
              }
              const title = d.displayTitle || d.category;
              if (title) {
                sourceMap.get(key)!.dok2Titles.push(title);
              }
            }
            const sourceInputs = Array.from(sourceMap.values());

            if (sourceInputs.length >= 2 && insightInputs.length > 0) {
              await rankSourcesForInsights(insightInputs, sourceInputs);
            }
          } catch (err) {
            console.error('[Auto-Grade] Source ranking failed (non-blocking):', err);
          }

          // Emit dok3_linking event — triggers DOK3LinkingUI in modal
          onProgress?.({
            stage: 'dok3_linking',
            message: 'DOK3 insights ready for linking',
            dok3Count: data.dok3Insights.length,
            slug,
          });
        }

        if (data.dok4Spovs && data.dok4Spovs.length > 0) {
          // Pre-compute DOK3 insight relevance rankings for DOK4 linking UI
          try {
            const savedSpovs = await storage.getDOK4Spovs(brainlift.id);
            const savedInsights = await storage.getDOK3Insights(brainlift.id, []);
            if (savedSpovs.length > 0 && savedInsights.length > 0) {
              const { rankInsightsForSpovs } = await import('../ai/dok4InsightRanker');
              const spovInputs = savedSpovs.map(s => ({ id: s.id, text: s.text }));
              const insightInputs = savedInsights.map(i => ({ id: i.id, text: i.text }));
              await rankInsightsForSpovs(spovInputs, insightInputs);
            }
          } catch (err) {
            console.error('[Auto-Grade] DOK4 insight ranking failed (non-blocking):', err);
          }

          onProgress?.({
            stage: 'dok4_extraction',
            message: `DOK4 SPOVs extracted: ${data.dok4Spovs.length}`,
            dok4Count: data.dok4Spovs.length,
          });
        }

        // Recompute score (DOK1+DOK2 only in manual mode)
        await recomputeBrainliftScore(brainlift.id, { trigger: 'import' });
      }
    }
  } catch (err: any) {
    // Handle duplicate slug error with retry (only for create path, not update path)
    if (!existingBrainlift) {
      const pgCode = err.code || err.cause?.code;
      const pgConstraint = err.constraint || err.cause?.constraint;
      if (pgCode === '23505' && pgConstraint === 'brainlifts_slug_unique' && retryCount < MAX_RETRIES) {
        console.log(`[Auto-Grade] Duplicate slug detected, retrying with retry count: ${retryCount + 1}`);
        return saveBrainliftFromAI(data, originalContent, sourceType, userId, retryCount + 1, onProgress, autoLink);
      }
    }
    throw err;
  }

  const postProcessingInput = {
    brainliftId: brainlift.id,
    slug,
    title: data.title,
    description: data.description,
    author: data.owner || null,
    facts: factsWithSummaries,
    originalContent: originalContent || '',
  };

  await Promise.all([
    extractBrainliftExperts(postProcessingInput, onProgress),
    analyzeBrainliftRedundancy(postProcessingInput, onProgress),
  ]);
  await queueBrainliftAssetJobs(postProcessingInput);

  return storage.getBrainliftBySlug(slug) as Promise<BrainliftData>;
}
