import { storage } from "../storage";
import { generateUniqueSlug } from "../utils/slug";
import { summarizeFact } from "../ai/factSummarizer";
import { verifyFactWithAllModels } from "../ai/factVerifier";
import { fetchEvidenceForFact } from "../ai/evidenceFetcher";
import { extractAndRankExperts, diagnoseExpertFormat } from "../ai/expertExtractor";
import { type BrainliftOutput } from "../ai/brainliftExtractor";
import { type BrainliftData } from "@shared/schema";
import pLimit from "p-limit";

export async function saveBrainliftFromAI(data: BrainliftOutput, originalContent?: string, sourceType?: string, userId?: string, retryCount = 0): Promise<BrainliftData> {
  const MAX_RETRIES = 3;
  const slug = await generateUniqueSlug(data.title, retryCount);

  console.log(`[Auto-Grade] === Starting saveBrainliftFromAI ===`);
  console.log(`[Auto-Grade] Title: "${data.title}", Facts count: ${data.facts.length}`);

  const limit = pLimit(5); // Process 5 facts concurrently

  // Run fact processing, contradiction detection, and reading list extraction in parallel
  const [factsWithSummaries, contradictionClusters, extractedReadingList] = await Promise.all([
    Promise.all(data.facts.map(fact => limit(async () => {
      console.log(`[Auto-Grade] Processing fact ${fact.id}: "${fact.fact.substring(0, 50)}..."`);
      console.log(`[Auto-Grade] Fact ${fact.id} aiNotes: "${fact.aiNotes?.substring(0, 100) || 'NULL'}..."`);

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
            const evidence = await fetchEvidenceForFact(fact.fact, sourceUrl);
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
        console.error(`Verification failed for fact: ${fact.id}`, err);
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

  // Calculate dynamic summary stats
  const totalFacts = factsWithSummaries.length;
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
    totalFacts,
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
  const expertDiagnostics = originalContent ? diagnoseExpertFormat(originalContent) : null;

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
  } catch (err: any) {
    // Handle duplicate slug error with retry
    if (err.code === '23505' && err.constraint === 'brainlifts_slug_unique' && retryCount < MAX_RETRIES) {
      console.log(`[Auto-Grade] Duplicate slug detected, retrying with retry count: ${retryCount + 1}`);
      return saveBrainliftFromAI(data, originalContent, sourceType, userId, retryCount + 1);
    }
    throw err;
  }

  // Run expert extraction and redundancy analysis in parallel after save
  await Promise.all([
    // Expert extraction
    (async () => {
      try {
        const expertData = await extractAndRankExperts({
          brainliftId: brainlift.id,
          title: data.title,
          description: data.description,
          author: data.owner || null,
          facts: factsWithSummaries as any[],
          originalContent: originalContent,
          readingList: finalReadingList,
        });

        if (expertData.length > 0) {
          await storage.saveExperts(brainlift.id, expertData);
        }
      } catch (err) {
        console.error("Expert extraction failed during brainlift creation:", err);
      }
    })(),

    // Redundancy analysis
    (async () => {
      try {
        const { analyzeFactRedundancy } = await import('../ai/redundancyAnalyzer');
        const savedFacts = await storage.getFactsForBrainlift(brainlift.id);
        const redundancyResult = await analyzeFactRedundancy(savedFacts);

        if (redundancyResult.redundancyGroups.length > 0) {
          await storage.saveRedundancyGroups(brainlift.id, redundancyResult.redundancyGroups.map(g => ({
            groupName: g.groupName,
            factIds: g.factIds,
            primaryFactId: g.primaryFactId,
            similarityScore: g.similarityScore,
            reason: g.reason,
            status: 'pending' as const,
          })));
        }
      } catch (err) {
        console.error("Redundancy analysis failed during brainlift creation:", err);
      }
    })(),
  ]);

  return storage.getBrainliftBySlug(slug) as Promise<BrainliftData>;
}
