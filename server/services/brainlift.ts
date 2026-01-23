import { storage } from "../storage";
import { generateUniqueSlug } from "../utils/slug";
import { summarizeFact } from "../ai/factSummarizer";
import { verifyFactWithAllModels } from "../ai/factVerifier";
import { fetchEvidenceForFact } from "../ai/evidenceFetcher";
import { extractAndRankExperts, diagnoseExpertFormat } from "../ai/experts";
import { analyzeFactRedundancy } from "../ai/redundancyAnalyzer";
import { gradeDOK2Summary, type DOK2GradeResult } from "../ai/dok2Grader";
import { type BrainliftOutput } from "../ai/brainliftExtractor";
import { type BrainliftData } from "@shared/schema";
import { type ImportProgress, STAGE_LABELS } from "@shared/import-progress";
import pLimit from "p-limit";

interface PostProcessingInput {
  brainliftId: number;
  title: string;
  description: string;
  author: string | null;
  facts: Array<{ id?: number; fact: string; source?: string | null; note?: string | null; score?: number }>;
  originalContent: string;
  readingList: Array<{ author?: string; topic?: string }>;
}

type ProgressCallback = (event: ImportProgress) => void;

/**
 * Run post-processing pipeline (expert extraction + redundancy analysis) after brainlift creation/update.
 * Both tasks run in parallel and errors are logged but don't fail the main operation.
 */
export async function runPostProcessingPipeline(
  input: PostProcessingInput,
  onProgress?: ProgressCallback
): Promise<void> {
  await Promise.all([
    // Expert extraction
    (async () => {
      try {
        onProgress?.({ stage: 'experts', message: STAGE_LABELS.experts });
        const expertData = await extractAndRankExperts({
          brainliftId: input.brainliftId,
          title: input.title,
          description: input.description,
          author: input.author,
          facts: input.facts as any[],
          originalContent: input.originalContent,
          readingList: input.readingList,
        });

        if (expertData.length > 0) {
          await storage.saveExperts(input.brainliftId, expertData);
        }
      } catch (err) {
        console.error("Expert extraction failed during post-processing:", err);
      }
    })(),

    // Redundancy analysis
    (async () => {
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
        console.error("Redundancy analysis failed during post-processing:", err);
      }
    })(),
  ]);
}

export async function saveBrainliftFromAI(
  data: BrainliftOutput,
  originalContent?: string,
  sourceType?: string,
  userId?: string,
  retryCount = 0,
  onProgress?: ProgressCallback
): Promise<BrainliftData> {
  const MAX_RETRIES = 3;
  const slug = await generateUniqueSlug(data.title, retryCount);

  const batchStart = Date.now();
  const memStart = process.memoryUsage();
  console.log(`[Auto-Grade] === Starting saveBrainliftFromAI ===`);
  console.log(`[Auto-Grade] Title: "${data.title}", Facts count: ${data.facts.length}`);
  console.log(`[Auto-Grade] Memory at start: ${Math.round(memStart.heapUsed / 1024 / 1024)}MB heap, ${Math.round(memStart.rss / 1024 / 1024)}MB RSS`);

  const limit = pLimit(60);
  let completedCount = 0;
  const totalFacts = data.facts.length;
  const skipGrading = process.env.SKIP_GRADING === 'true';

  if (skipGrading) {
    console.log(`[Auto-Grade] SKIP_GRADING=true - skipping evidence fetch and LLM verification`);
  }

  // Emit initial grading progress
  onProgress?.({
    stage: 'grading',
    message: skipGrading ? 'Skipping grading (SKIP_GRADING=true)' : STAGE_LABELS.grading,
    completed: 0,
    total: totalFacts,
  });

  // Cache failed URLs to avoid retrying the same 403/404 errors
  const failedUrlCache = new Map<string, string>();

  // Run fact processing, contradiction detection, and reading list extraction in parallel
  const [factsWithSummaries, contradictionClusters, extractedReadingList] = await Promise.all([
    Promise.all(data.facts.map(fact => limit(async () => {
      // Fast path: skip grading entirely
      if (skipGrading) {
        completedCount++;
        onProgress?.({ stage: 'grading', message: 'Skipping grading', completed: completedCount, total: totalFacts });
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

      const summary = await summarizeFact(fact.fact);

      // Auto-grading logic
      let evidenceContent = "";
      let finalScore = 0;
      let finalNote = fact.aiNotes || "";

      // If source exists, fetch evidence
      let linkFailed = false;
      const hasSource = fact.aiNotes && fact.aiNotes.includes("Source: ");
      console.log(`[Auto-Grade] Fact ${fact.id} hasSource check: ${hasSource}`);

      if (hasSource) {
        const sourceUrl = fact.aiNotes.split("Source: ")[1]?.trim();
        console.log(`[Auto-Grade] Fact ${fact.id} extracted source: "${sourceUrl?.substring(0, 80)}..."`);
        if (sourceUrl) {
          try {
            const evidence = await fetchEvidenceForFact(fact.fact, sourceUrl, failedUrlCache);
            evidenceContent = evidence.content || "";

            // Clear logging about what happened
            if (evidenceContent) {
              if (evidence.error) {
                console.log(`[Auto-Grade] Fact ${fact.id}: GOT ${evidenceContent.length} chars via AI fallback (direct fetch failed: ${evidence.error})`);
              } else {
                console.log(`[Auto-Grade] Fact ${fact.id}: GOT ${evidenceContent.length} chars from direct URL fetch`);
              }
            } else {
              console.log(`[Auto-Grade] Fact ${fact.id}: FAILED to get evidence - ${evidence.error || 'unknown error'}`);
              linkFailed = true;
            }
          } catch (err) {
            console.error(`[Auto-Grade] Fact ${fact.id}: EXCEPTION during evidence fetch:`, err);
            linkFailed = true;
          }
        }
      }

      // Verify with LLMs
      try {
        const verification = await verifyFactWithAllModels(fact.fact, fact.source || "", evidenceContent, linkFailed);
        finalScore = verification.consensus.consensusScore;

        // Get the rationale directly from consensus notes
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

        finalNote = `${rationale}\n\n${sourceHyperlink}`;

        completedCount++;
        onProgress?.({
          stage: 'grading',
          message: STAGE_LABELS.grading,
          completed: completedCount,
          total: totalFacts,
        });
        const factElapsed = ((Date.now() - factStart) / 1000).toFixed(1);
        console.log(`[Auto-Grade] DONE fact ${fact.id} in ${factElapsed}s - score: ${finalScore}/5 (${completedCount}/${data.facts.length})`);

        return {
          originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary,
          score: finalScore,
          contradicts: fact.contradicts,
          note: finalNote,
          flags: fact.flags || [],
          isGradeable,
        };
      } catch (err) {
        completedCount++;
        onProgress?.({
          stage: 'grading',
          message: STAGE_LABELS.grading,
          completed: completedCount,
          total: totalFacts,
        });
        const factElapsed = ((Date.now() - factStart) / 1000).toFixed(1);
        console.error(`[Auto-Grade] FAILED fact ${fact.id} in ${factElapsed}s:`, err);
        return {
          originalId: fact.id,
          category: fact.category,
          source: fact.source || null,
          fact: fact.fact,
          summary,
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
    })(),
    // Parallel reading list extraction
    (async () => {
      const { extractReadingList } = await import("../ai/brainliftExtractor");
      return extractReadingList(data.title, data.description, data.facts);
    })()
  ]);

  // Emit contradictions progress (already completed in parallel)
  onProgress?.({ stage: 'contradictions', message: STAGE_LABELS.contradictions });

  // Emit reading list progress (already completed in parallel)
  onProgress?.({ stage: 'readingList', message: STAGE_LABELS.readingList });

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

  // Use either the extracted reading list or the one from input data (if any)
  const finalReadingList = extractedReadingList.length > 0 ? extractedReadingList : (data.readingList || []).map((r) => ({
    type: r.type,
    author: r.author,
    topic: r.topic,
    time: r.time,
    facts: r.facts,
    url: r.url,
  }));

  // Run expert format diagnostics on the original content
  const expertDiagnostics = originalContent ? await diagnoseExpertFormat(originalContent) : null;

  // Emit saving progress
  onProgress?.({ stage: 'saving', message: STAGE_LABELS.saving });

  let brainlift;
  try {
    brainlift = await storage.createBrainlift(
      {
        slug,
        title: data.title,
        description: data.description,
        author: data.owner || null,
        summary: dynamicSummary,
        classification: data.classification,
        improperlyFormatted: data.improperlyFormatted ?? false,
        rejectionReason: data.rejectionReason || null,
        rejectionSubtype: data.rejectionSubtype || null,
        rejectionRecommendation: data.rejectionRecommendation || null,
        originalContent: originalContent || null,
        sourceType: sourceType || null,
        expertDiagnostics: expertDiagnostics || null,
      },
      factsWithSummaries,
      clusters,
      finalReadingList,
      userId
    );

    // Save DOK2 summaries if present (with grading)
    if (data.dok2Summaries && data.dok2Summaries.length > 0) {
      console.log(`[Auto-Grade] Grading and saving ${data.dok2Summaries.length} DOK2 summaries...`);

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
        message: STAGE_LABELS.grading_dok2,
        completed: 0,
        total: totalDOK2,
      });

      const gradedDOK2Summaries = await Promise.all(data.dok2Summaries.map(summary => dok2Limit(async () => {
        // Get related DOK1 facts for this summary
        type FactType = typeof data.facts[number];
        const relatedDOK1s = summary.relatedDOK1Ids
          .map((id: string) => data.facts.find((f: FactType) => f.id === id))
          .filter((f: FactType | undefined): f is FactType => f !== undefined)
          .map((f: FactType) => ({ fact: f.fact, source: f.source }));

        // Get summary point texts
        const summaryPoints = summary.points.map((p: { text: string }) => p.text);

        let gradeResult: DOK2GradeResult;
        try {
          gradeResult = await gradeDOK2Summary(
            summaryPoints,
            relatedDOK1s,
            brainliftPurpose,
            summary.sourceUrl,
            dok2FailedUrlCache
          );
        } catch (err: any) {
          console.error(`[Auto-Grade] DOK2 grading failed for "${summary.sourceName}":`, err.message);
          gradeResult = {
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

        console.log(`[Auto-Grade] DOK2 graded "${summary.sourceName}": score=${gradeResult.score} (${dok2CompletedCount}/${totalDOK2})`);

        return {
          ...summary,
          grade: gradeResult.score,
          diagnosis: gradeResult.diagnosis,
          feedback: gradeResult.feedback,
          failReason: gradeResult.failReason,
          sourceVerified: gradeResult.sourceVerified,
        };
      })));

      await storage.saveDOK2Summaries(brainlift.id, gradedDOK2Summaries, factIdMap);
      console.log(`[Auto-Grade] DOK2 summaries saved successfully with grades`);
    }
  } catch (err: any) {
    // Handle duplicate slug error with retry
    if (err.code === '23505' && err.constraint === 'brainlifts_slug_unique' && retryCount < MAX_RETRIES) {
      console.log(`[Auto-Grade] Duplicate slug detected, retrying with retry count: ${retryCount + 1}`);
      return saveBrainliftFromAI(data, originalContent, sourceType, userId, retryCount + 1, onProgress);
    }
    throw err;
  }

  // Run expert extraction and redundancy analysis in parallel after save
  await runPostProcessingPipeline({
    brainliftId: brainlift.id,
    title: data.title,
    description: data.description,
    author: data.owner || null,
    facts: factsWithSummaries,
    originalContent: originalContent || '',
    readingList: finalReadingList,
  }, onProgress);

  return storage.getBrainliftBySlug(slug) as Promise<BrainliftData>;
}
