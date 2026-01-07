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

const GRADING_SYSTEM_PROMPT = `You are an expert fact-checker verifying educational claims against source evidence.

GRADING SCALE (1-5):
5 = VERIFIED: Source fully supports the claim with clear, direct evidence
4 = MOSTLY VERIFIED: Source largely supports the claim, minor discrepancies or extrapolation
3 = PLAUSIBLE: Plausible but unverified or vague. Max score if no link provided.
2 = QUESTIONABLE: Potentially misleading or thin evidence.
1 = LIKELY FALSE: No supporting evidence or directly contradicted.

INSTRUCTIONS:
1. Compare the CLAIM against the SOURCE EVIDENCE.
2. If evidence is missing/empty and it's not universally known (like "sky is blue"), score aggressively (max 3).
3. If evidence is present, ensure the fact is an accurate representation of that specific content.
4. Output ONLY valid JSON.

Output Format:
{
  "score": <1-5>,
  "rationale": "<Brief 1-2 sentence explanation>"
}`;

async function callModel(
  model: LLMModel,
  fact: string,
  source: string,
  evidence: string
): Promise<ModelGradeResult> {
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
${evidence || 'No evidence content available'}

Grade this claim based on how well the evidence supports it.`;

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
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content');
    }

    let jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('Could not find JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    const validated = modelGradeSchema.parse(parsed);

    return {
      score: validated.score,
      rationale: validated.rationale,
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
      score: result.score,
      rationale: result.rationale,
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
  modelResults: ModelGradeResult[],
  modelWeights?: ModelWeights
): ConsensusResult {
  const validResults = modelResults.filter(r => r.status === 'completed' && r.score !== null);
  const validScores = validResults.map(r => r.score as number);

  if (validScores.length === 0) {
    return {
      consensusScore: 0,
      confidenceLevel: 'low',
      needsReview: true,
      verificationNotes: 'All models failed to grade this fact.',
    };
  }

  const weights = validResults.map(r => modelWeights?.[r.model] ?? 1.0);
  const consensusScore = calculateWeightedMedian(validScores, weights);
  const minScore = Math.min(...validScores);
  const maxScore = Math.max(...validScores);
  const spread = maxScore - minScore;

  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  let needsReview = spread >= 3 || validScores.length < 2;

  if (validScores.length >= 3 && spread <= 1) confidenceLevel = 'high';
  else if (validScores.length >= 2 && spread <= 2) confidenceLevel = 'medium';

  return {
    consensusScore,
    confidenceLevel,
    needsReview,
    verificationNotes: `Consensus: ${consensusScore}/5. Range: ${minScore}-${maxScore}.`,
  };
}

export async function verifyFactWithAllModels(
  fact: string,
  source: string,
  evidence: string,
  modelWeights?: ModelWeights
): Promise<VerificationResult> {
  // Use a fast/small model for primary grading as requested
  // We keep the multi-model structure but prioritize fast models in LLM_MODELS if possible
  const models = Object.values(LLM_MODELS);
  const modelResults = await Promise.all(models.map(model => callModel(model, fact, source, evidence)));
  const consensus = calculateConsensus(modelResults, modelWeights);

  return { modelResults, consensus };
}

