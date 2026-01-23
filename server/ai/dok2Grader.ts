/**
 * DOK2 Grader Service
 *
 * Evaluates DOK2 summaries for quality of synthesis and reorganization.
 * Core question: "Did the reorganization happen?"
 *
 * Uses the same model pattern as factVerifier.ts:
 * - Primary: Gemini 2.0 Flash
 * - Fallback: Qwen 3 32B
 */

import { z } from 'zod';
import { LLM_MODELS, type LLMModel, type DOK2FailReason, DOK2_FAIL_REASON } from '@shared/schema';
import { fetchEvidenceForFact } from './evidenceFetcher';
import { DOK2_GRADING_SYSTEM_PROMPT, DOK2_GRADING_USER_PROMPT } from '../prompts/dok2-grading';
import pRetry from 'p-retry';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Zod schema for validating LLM response
const dok2GradeSchema = z.object({
  score: z.number().min(1).max(5),
  diagnosis: z.string(),
  feedback: z.string(),
  failReason: z.enum(['copy_paste', 'no_purpose_relation', 'factual_misrepresentation', 'fact_manipulation']).nullable(),
});

export interface DOK2GradeResult {
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
 * Call the grading model and parse the response
 */
async function callGradingModel(
  model: LLMModel,
  systemPrompt: string,
  userPrompt: string
): Promise<{ score: number; diagnosis: string; feedback: string; failReason: DOK2FailReason | null }> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const run = async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://replit.com',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`[DOK2-Grade] 429 rate limit from ${model}`);
        throw new Error(`RATE_LIMIT: ${model}`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content');
    }

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

      if (scoreMatch) {
        parsed = {
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
      score: validated.score,
      diagnosis: validated.diagnosis,
      feedback: validated.feedback,
      failReason: validated.failReason as DOK2FailReason | null,
    };
  };

  // Retry with exponential backoff
  return pRetry(run, {
    retries: 2,
    onFailedAttempt: error => {
      console.log(`[DOK2-Grade] Model ${model} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
    }
  });
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
  result: { score: number; diagnosis: string; feedback: string; failReason: DOK2FailReason | null },
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
  failedUrlCache?: Map<string, string>
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
      const evidence = await fetchEvidenceForFact(combinedSummary, sourceUrl, failedUrlCache);

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

  // Step 3: Call the grading model (Gemini primary, Qwen fallback)
  let gradeResult;
  try {
    console.log('[DOK2-Grade] Calling Gemini Flash for grading...');
    gradeResult = await callGradingModel(LLM_MODELS.GEMINI_FLASH, DOK2_GRADING_SYSTEM_PROMPT, userPrompt);
    console.log(`[DOK2-Grade] Gemini result: score=${gradeResult.score}`);
  } catch (geminiError: any) {
    console.log(`[DOK2-Grade] Gemini failed (${geminiError.message}), trying Qwen fallback...`);
    try {
      gradeResult = await callGradingModel(LLM_MODELS.QWEN_32B, DOK2_GRADING_SYSTEM_PROMPT, userPrompt);
      console.log(`[DOK2-Grade] Qwen result: score=${gradeResult.score}`);
    } catch (qwenError: any) {
      console.error(`[DOK2-Grade] Both models failed. Gemini: ${geminiError.message}, Qwen: ${qwenError.message}`);
      // Return a default grade if both models fail
      return {
        score: 3,
        diagnosis: 'Unable to grade this summary due to a system error. Both grading models failed.',
        feedback: 'Please try re-importing this BrainLift or contact support if the issue persists.',
        failReason: null,
        sourceVerified,
      };
    }
  }

  // Step 4: Apply source-link penalty
  const finalResult = applySourceLinkPenalty(gradeResult, !!sourceUrl, sourceVerified);

  console.log(`[DOK2-Grade] Final score: ${finalResult.score}, failReason: ${finalResult.failReason || 'none'}`);
  return finalResult;
}
