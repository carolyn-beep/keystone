import { z } from 'zod';
import { LLM_MODELS, LLM_MODEL_NAMES, type LLMModel, type VerificationStatus } from '@shared/schema';
import pRetry from 'p-retry';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const modelGradeSchema = z.object({
  score: z.number().min(1).max(5),
  rationale: z.string(),
});

export interface ModelGradeResult {
  model: LLMModel;
  score: number | null;
  rationale: string | null;
  status: VerificationStatus;
  error: string | null;
}

export interface ConsensusResult {
  consensusScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  needsReview: boolean;
  verificationNotes: string;
}

export interface VerificationResult {
  modelResults: ModelGradeResult[];
  consensus: ConsensusResult;
}

const GRADING_SYSTEM_PROMPT = `You are an expert fact-checker verifying educational claims. You have deep knowledge of educational research, cognitive science, and pedagogy.

GRADING SCALE (1-5):
5 = VERIFIED: Claim is well-supported by evidence or established research
4 = MOSTLY VERIFIED: Claim is largely supported with minor caveats
3 = PLAUSIBLE: Reasonable claim but evidence is limited or mixed
2 = QUESTIONABLE: Claim is oversimplified, misleading, or poorly supported
1 = LIKELY FALSE: Claim contradicts established evidence

INSTRUCTIONS:
1. If SOURCE EVIDENCE is provided, use it to verify the claim.
2. If SOURCE_LINK_FAILED is true OR no evidence available:
   - Use your knowledge of educational research and cognitive science to evaluate the claim
   - Reference relevant studies, authors, or established findings you know about
   - Be specific: cite researchers (e.g., "Willingham's research on...", "Rosenshine's principles...")
   - Grade based on how well the claim aligns with established research literature
3. Your rationale should be substantive and educational - explain WHY the claim is or isn't supported.
4. Only set "isNonGradeable": true for highly obscure claims about specific unpublished data that cannot be evaluated.

Output Format:
{
  "score": <1-5>,
  "rationale": "<Substantive explanation referencing research/evidence>",
  "isNonGradeable": <boolean - rarely true>
}`;

async function callModel(
  model: LLMModel,
  fact: string,
  source: string,
  evidence: string,
  linkFailed: boolean = false
): Promise<ModelGradeResult & { isNonGradeable?: boolean }> {
  if (!OPENROUTER_API_KEY) {
    return {
      model,
      score: null,
      rationale: null,
      status: 'failed',
      error: 'OpenRouter API key not configured',
    };
  }

  const userPrompt = `CLAIM TO VERIFY:
"${fact}"

CITED SOURCE:
${source || 'No source citation provided'}

SOURCE EVIDENCE:
${evidence || 'No direct evidence available - use your knowledge of educational research to evaluate this claim'}

SOURCE_LINK_FAILED: ${linkFailed}

Grade this claim based on available evidence OR your knowledge of educational research literature. Provide a substantive rationale explaining your assessment.`;

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
          { role: 'system', content: GRADING_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`[RATE-LIMIT] 429 from ${model} - too many requests`);
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

    // Use greedy match to get the full JSON object
    let jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not find JSON in response');

    // Try to parse, if it fails try to fix common issues
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // Try to extract just the fields we need with a more targeted approach
      const scoreMatch = cleanContent.match(/"score"\s*:\s*(\d)/);
      const rationaleMatch = cleanContent.match(/"rationale"\s*:\s*"([^"]+)"/);
      const nonGradeableMatch = cleanContent.match(/"isNonGradeable"\s*:\s*(true|false)/i);

      if (scoreMatch) {
        parsed = {
          score: parseInt(scoreMatch[1]),
          rationale: rationaleMatch ? rationaleMatch[1] : 'Unable to parse full rationale',
          isNonGradeable: nonGradeableMatch ? nonGradeableMatch[1].toLowerCase() === 'true' : false
        };
      } else {
        throw new Error('Could not parse JSON response');
      }
    }
    
    return {
      score: parsed.score,
      rationale: parsed.rationale,
      isNonGradeable: parsed.isNonGradeable === true || parsed.isNonGradeable === 'true'
    };
  };

  try {
    const result = await pRetry(run, {
      retries: 2,
      onFailedAttempt: error => {
        console.log(`Model ${model} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
      }
    });

    return {
      model,
      score: result.isNonGradeable ? 0 : result.score,
      rationale: result.rationale,
      isNonGradeable: result.isNonGradeable,
      status: 'completed',
      error: null,
    };
  } catch (err: any) {
    console.error(`Model ${model} final failure:`, err);
    return {
      model,
      score: null,
      rationale: null,
      status: 'failed',
      error: err.message || 'Unknown error',
    };
  }
}

export type ModelWeights = Record<LLMModel, number>;

function calculateWeightedMedian(scores: number[], weights: number[]): number {
  if (scores.length === 0) return 0;
  const pairs = scores.map((score, i) => ({ score, weight: weights[i] || 1 }));
  pairs.sort((a, b) => a.score - b.score);
  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  const halfWeight = totalWeight / 2;
  let cumulativeWeight = 0;
  for (let i = 0; i < pairs.length; i++) {
    cumulativeWeight += pairs[i].weight;
    if (cumulativeWeight >= halfWeight) return pairs[i].score;
  }
  return pairs[pairs.length - 1].score;
}

export function calculateConsensus(
  modelResults: (ModelGradeResult & { isNonGradeable?: boolean })[],
  modelWeights?: ModelWeights
): ConsensusResult & { isNonGradeable?: boolean } {
  const validResults = modelResults.filter(r => r.status === 'completed');
  
  if (validResults.length === 0) {
    return {
      consensusScore: 3,
      confidenceLevel: 'low',
      needsReview: true,
      verificationNotes: 'Model failed to provide a specific rationale. Defaulting to plausible (3/5).',
    };
  }

  const isNonGradeable = validResults.some(r => r.isNonGradeable);
  const validScores = validResults.map(r => r.score as number).filter(s => s !== null);

  const weights = validResults.map(r => modelWeights?.[r.model] ?? 1.0);
  const consensusScore = calculateWeightedMedian(validScores, weights);
  const minScore = validScores.length > 0 ? Math.min(...validScores) : 0;
  const maxScore = validScores.length > 0 ? Math.max(...validScores) : 0;
  const spread = maxScore - minScore;

  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  let needsReview = spread >= 3 || validScores.length < 1;

  if (validScores.length >= 1 && spread <= 1) confidenceLevel = 'high';

  return {
    consensusScore: isNonGradeable ? 0 : consensusScore,
    confidenceLevel,
    needsReview,
    verificationNotes: validResults[0]?.rationale || 'No specific rationale provided.',
    isNonGradeable: Boolean(isNonGradeable)
  };
}

export async function verifyFactWithAllModels(
  fact: string,
  source: string,
  evidence: string,
  linkFailed: boolean = false,
  modelWeights?: ModelWeights
): Promise<VerificationResult & { consensus: ConsensusResult & { isNonGradeable?: boolean } }> {
  // Primary: Gemini Flash
  let result = await callModel(LLM_MODELS.GEMINI_FLASH, fact, source, evidence, linkFailed);

  // Fallback: Qwen if Gemini fails
  if (result.status === 'failed') {
    console.log('Gemini verification failed, trying Qwen fallback...');
    result = await callModel(LLM_MODELS.QWEN_32B, fact, source, evidence, linkFailed);
  }

  const modelResults = [result];
  const consensus = calculateConsensus(modelResults, modelWeights);

  return { modelResults, consensus };
}

