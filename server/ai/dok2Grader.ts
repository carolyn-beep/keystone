/**
 * DOK2 Grader Service
 *
 * Evaluates DOK2 summaries for quality of synthesis and reorganization.
 * Core question: "Did the reorganization happen?"
 *
 * Uses unified AI client with fallback chain:
 * - Primary: Gemini 2.0 Flash
 * - Fallback: Qwen 3 32B
 */

import { z } from 'zod';
import { type DOK2FailReason } from '@shared/schema';
import { fetchEvidenceForFact } from './evidenceFetcher';
import { DOK2_GRADING_SYSTEM_PROMPT, DOK2_GRADING_USER_PROMPT } from '../prompts/dok2-grading';
import { callModelWithFallback } from './client/index';

// Zod schema for validating LLM response
const dok2GradeSchema = z.object({
  displayTitle: z.string().nullable().optional(),
  score: z.number().min(1).max(5),
  diagnosis: z.string(),
  feedback: z.string(),
  failReason: z.enum(['copy_paste', 'no_purpose_relation', 'factual_misrepresentation', 'fact_manipulation']).nullable(),
});

export interface DOK2GradeResult {
  displayTitle: string | null;
  score: 1 | 2 | 3 | 4 | 5;
  diagnosis: string;
  feedback: string;
  failReason: DOK2FailReason | null;
  sourceVerified: boolean;
}

interface RelatedDOK1 {
  fact: string;
  source?: string | null;
}

/**
 * Parse the LLM response content into a grading result.
 * Handles JSON extraction, regex fallback, and zod validation.
 */
function parseGradingResponse(
  content: string
): { displayTitle: string | null; score: number; diagnosis: string; feedback: string; failReason: DOK2FailReason | null } {
  // Remove markdown code blocks if present
  let cleanContent = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Extract JSON from response
  const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not find JSON in response');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    // Try to extract fields manually if JSON parse fails
    const scoreMatch = cleanContent.match(/"score"\s*:\s*(\d)/);
    const diagnosisMatch = cleanContent.match(/"diagnosis"\s*:\s*"([^"]+)"/);
    const feedbackMatch = cleanContent.match(/"feedback"\s*:\s*"([^"]+)"/);
    const failReasonMatch = cleanContent.match(/"failReason"\s*:\s*(?:null|"([^"]+)")/);
    const displayTitleMatch = cleanContent.match(/"displayTitle"\s*:\s*"([^"]+)"/);

    if (scoreMatch) {
      parsed = {
        displayTitle: displayTitleMatch ? displayTitleMatch[1] : null,
        score: parseInt(scoreMatch[1]),
        diagnosis: diagnosisMatch ? diagnosisMatch[1] : 'Unable to parse diagnosis',
        feedback: feedbackMatch ? feedbackMatch[1] : 'Unable to parse feedback',
        failReason: failReasonMatch && failReasonMatch[1] ? failReasonMatch[1] : null,
      };
    } else {
      throw new Error('Could not parse JSON response');
    }
  }

  // Validate with zod
  const validated = dok2GradeSchema.parse(parsed);

  return {
    displayTitle: validated.displayTitle || null,
    score: validated.score,
    diagnosis: validated.diagnosis,
    feedback: validated.feedback,
    failReason: validated.failReason as DOK2FailReason | null,
  };
}

/**
 * Build the user prompt with all context
 */
function buildUserPrompt(
  summaryPoints: string[],
  relatedDOK1s: RelatedDOK1[],
  brainliftPurpose: string,
  sourceContent: string
): string {
  const dok1Facts = relatedDOK1s.length > 0
    ? relatedDOK1s.map((d, i) => `${i + 1}. ${d.fact}${d.source ? ` (Source: ${d.source})` : ''}`).join('\n')
    : 'No related DOK1 facts available for this summary.';

  const summaryText = summaryPoints.length > 0
    ? summaryPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No summary points provided.';

  return DOK2_GRADING_USER_PROMPT
    .replace('{purpose}', brainliftPurpose || 'No specific purpose defined for this BrainLift.')
    .replace('{dok1Facts}', dok1Facts)
    .replace('{sourceContent}', sourceContent || 'Source content not available.')
    .replace('{summaryPoints}', summaryText);
}

/**
 * Apply source-link penalty to the grade
 * - No source URL: cannot score 5, medium grades downgraded by 1
 * - Source unfetchable but searched: note in diagnosis, no penalty
 */
function applySourceLinkPenalty(
  result: { displayTitle: string | null; score: number; diagnosis: string; feedback: string; failReason: DOK2FailReason | null },
  hasSourceUrl: boolean,
  sourceVerified: boolean
): DOK2GradeResult {
  let finalScore = result.score as 1 | 2 | 3 | 4 | 5;
  let diagnosis = result.diagnosis;

  if (!hasSourceUrl) {
    // No source URL provided
    if (finalScore === 5) {
      finalScore = 4;
      diagnosis += '\n\n[Source Link Penalty: Score capped at 4 because no source URL was provided.]';
    } else if (finalScore >= 3) {
      finalScore = (finalScore - 1) as 1 | 2 | 3 | 4 | 5;
      diagnosis += `\n\n[Source Link Penalty: Score reduced by 1 (from ${result.score} to ${finalScore}) because no source URL was provided.]`;
    }
  }

  return {
    displayTitle: result.displayTitle,
    score: finalScore,
    diagnosis,
    feedback: result.feedback,
    failReason: result.failReason,
    sourceVerified,
  };
}

/**
 * Grade a DOK2 summary group
 *
 * @param summaryPoints - Array of summary point texts
 * @param relatedDOK1s - Related DOK1 facts with their sources
 * @param brainliftPurpose - The BrainLift's purpose (interpretive lens)
 * @param sourceUrl - Optional URL to the source material
 * @param failedUrlCache - Cache of URLs that failed to fetch (shared across grading)
 */
export async function gradeDOK2Summary(
  summaryPoints: string[],
  relatedDOK1s: RelatedDOK1[],
  brainliftPurpose: string,
  sourceUrl?: string | null,
  failedUrlCache?: Map<string, string>,
  cachedTranscript?: string | null,
): Promise<DOK2GradeResult> {
  console.log(`[DOK2-Grade] === Starting DOK2 grading ===`);
  console.log(`[DOK2-Grade] Summary points: ${summaryPoints.length}, Related DOK1s: ${relatedDOK1s.length}`);
  console.log(`[DOK2-Grade] Source URL: ${sourceUrl || 'none'}`);

  // Step 1: Fetch source content if URL is available
  let sourceContent = '';
  let sourceVerified = false;

  if (sourceUrl) {
    try {
      // Combine the summary points as a "fact" to search for
      const combinedSummary = summaryPoints.slice(0, 3).join(' ').substring(0, 200);
      const evidence = await fetchEvidenceForFact(combinedSummary, sourceUrl, failedUrlCache, cachedTranscript);

      if (evidence.content && evidence.content.length > 100) {
        sourceContent = evidence.content;
        sourceVerified = !evidence.error; // Verified if no fetch error
        console.log(`[DOK2-Grade] Source content fetched: ${sourceContent.length} chars, verified: ${sourceVerified}`);
      } else if (evidence.content) {
        // AI search found something but URL wasn't fetchable
        sourceContent = evidence.content;
        sourceVerified = false;
        console.log(`[DOK2-Grade] Source from AI search: ${sourceContent.length} chars`);
      }
    } catch (err: any) {
      console.error(`[DOK2-Grade] Failed to fetch source content: ${err.message}`);
    }
  }

  // Step 2: Build the prompt with all context
  const userPrompt = buildUserPrompt(summaryPoints, relatedDOK1s, brainliftPurpose, sourceContent);

  // Step 3: Call the grading model via unified client (Gemini primary, Qwen fallback)
  try {
    console.log('[DOK2-Grade] Calling unified client for grading...');
    const t0 = performance.now();
    const result = await callModelWithFallback({
      models: ['google/gemini-2.0-flash-001', 'anthropic/claude-sonnet-4.6'],
      system: DOK2_GRADING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
      maxTokens: 1500,
      timeout: 60_000,
      retries: 2,
      caller: 'dok2Grader.summaryGrading',
      validate: (content) => { parseGradingResponse(content); },
    });
    console.log(`[DOK2-Grade] Summary grading: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

    console.log(`[DOK2-Grade] Model result from ${result.model}: parsing response...`);
    const gradeResult = parseGradingResponse(result.content);
    console.log(`[DOK2-Grade] Parsed score=${gradeResult.score}`);

    // Step 4: Apply source-link penalty
    const finalResult = applySourceLinkPenalty(gradeResult, !!sourceUrl, sourceVerified);
    console.log(`[DOK2-Grade] Final score: ${finalResult.score}, failReason: ${finalResult.failReason || 'none'}`);
    return finalResult;
  } catch (error: any) {
    console.error(`[DOK2-Grade] All models failed: ${error.message}`);
    // Return a default grade if all models fail
    return {
      displayTitle: null,
      score: 3,
      diagnosis: 'Unable to grade this summary due to a system error. Both grading models failed.',
      feedback: 'Please try re-importing this BrainLift or contact support if the issue persists.',
      failReason: null,
      sourceVerified,
    };
  }
}
