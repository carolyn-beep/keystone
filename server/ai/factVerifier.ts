import { z } from 'zod';
import { LLM_MODELS, LLM_MODEL_NAMES, type LLMModel, type VerificationStatus } from '@shared/schema';

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
3 = PARTIALLY VERIFIED: Source provides some support, but claim overreaches or overstates
2 = WEAKLY SUPPORTED: Thin or indirect evidence, claim makes unsupported leaps
1 = NOT VERIFIED: No supporting evidence, fabricated, or directly contradicted by source

INSTRUCTIONS:
1. Compare the CLAIM against the SOURCE EVIDENCE
2. Look for direct quotes, data, or statements that support or contradict the claim
3. Consider if the claim accurately represents the source or if it overreaches
4. Be strict but fair - partial matches get partial scores

Output ONLY valid JSON:
{
  "score": <1-5>,
  "rationale": "<Brief 1-2 sentence explanation of your grade>"
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
${evidence || 'No evidence content available - grade as if evidence is missing'}

Grade this claim based on how well the evidence supports it.`;

  try {
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
      const errorText = await response.text();
      console.error(`Model ${model} failed:`, errorText);
      return {
        model,
        score: null,
        rationale: null,
        status: 'failed',
        error: `API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return {
        model,
        score: null,
        rationale: null,
        status: 'failed',
        error: 'No response content',
      };
    }

    // Try multiple patterns to extract JSON from various model response formats
    let jsonMatch = content.match(/\{[\s\S]*?"score"[\s\S]*?"rationale"[\s\S]*?\}/);
    if (!jsonMatch) {
      jsonMatch = content.match(/\{[\s\S]*?"rationale"[\s\S]*?"score"[\s\S]*?\}/);
    }
    if (!jsonMatch) {
      jsonMatch = content.match(/\{[\s\S]*\}/);
    }
    if (!jsonMatch) {
      // Try to extract score and rationale from plain text response
      const scoreMatch = content.match(/score[:\s]*(\d)/i);
      const rationaleMatch = content.match(/rationale[:\s]*["']?([^"'\n]+)/i);
      if (scoreMatch) {
        return {
          model,
          score: parseInt(scoreMatch[1]),
          rationale: rationaleMatch?.[1] || 'Score extracted from plain text response',
          status: 'completed',
          error: null,
        };
      }
      return {
        model,
        score: null,
        rationale: null,
        status: 'failed',
        error: 'Could not parse JSON response',
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      // Try cleaning the JSON string
      const cleanedJson = jsonMatch[0]
        .replace(/[\u0000-\u001F]+/g, ' ')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');
      try {
        parsed = JSON.parse(cleanedJson);
      } catch {
        return {
          model,
          score: null,
          rationale: null,
          status: 'failed',
          error: 'Invalid JSON in response',
        };
      }
    }
    const validated = modelGradeSchema.safeParse(parsed);

    if (!validated.success) {
      return {
        model,
        score: null,
        rationale: null,
        status: 'failed',
        error: 'Invalid response schema',
      };
    }

    return {
      model,
      score: validated.data.score,
      rationale: validated.data.rationale,
      status: 'completed',
      error: null,
    };
  } catch (err: any) {
    console.error(`Model ${model} error:`, err);
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

// Calculate weighted median using model accuracy weights
function calculateWeightedMedian(scores: number[], weights: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  
  // Create weighted pairs and sort by score
  const pairs = scores.map((score, i) => ({ score, weight: weights[i] || 1 }));
  pairs.sort((a, b) => a.score - b.score);
  
  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  const halfWeight = totalWeight / 2;
  
  let cumulativeWeight = 0;
  for (let i = 0; i < pairs.length; i++) {
    cumulativeWeight += pairs[i].weight;
    if (cumulativeWeight >= halfWeight) {
      return pairs[i].score;
    }
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
      verificationNotes: 'All models failed to grade this fact. Manual review required.',
    };
  }

  // Get weights for valid models (default to 1.0 if no weights provided)
  const weights = validResults.map(r => modelWeights?.[r.model] ?? 1.0);
  
  // Use WEIGHTED MEDIAN for consensus (accounts for model accuracy)
  const consensusScore = calculateWeightedMedian(validScores, weights);

  // Calculate spread for confidence
  const minScore = Math.min(...validScores);
  const maxScore = Math.max(...validScores);
  const spread = maxScore - minScore;

  let confidenceLevel: 'high' | 'medium' | 'low';
  let needsReview = false;

  // Spread-based confidence thresholds (how far apart the models are)
  if (validScores.length >= 4 && spread <= 1) {
    confidenceLevel = 'high';
  } else if (validScores.length >= 3 && spread <= 2) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
    needsReview = true;
  }

  // Large disagreement always needs human review
  if (spread >= 3) {
    needsReview = true;
  }

  const failedModels = modelResults
    .filter(r => r.status === 'failed')
    .map(r => LLM_MODEL_NAMES[r.model]);

  const usingWeights = modelWeights !== undefined && Object.values(modelWeights).some(w => w !== 1);

  let verificationNotes = `Consensus: ${consensusScore}/5 (${confidenceLevel} confidence). `;
  verificationNotes += `${validScores.length}/5 models agreed. `;
  verificationNotes += `Score range: ${minScore}-${maxScore}. `;
  
  if (usingWeights) {
    verificationNotes += 'Using weighted consensus based on historical accuracy. ';
  }

  if (failedModels.length > 0) {
    verificationNotes += `Failed: ${failedModels.join(', ')}. `;
  }

  if (needsReview) {
    verificationNotes += 'Flagged for human review due to model disagreement.';
  }

  return {
    consensusScore,
    confidenceLevel,
    needsReview,
    verificationNotes,
  };
}

export async function verifyFactWithAllModels(
  fact: string,
  source: string,
  evidence: string,
  modelWeights?: ModelWeights
): Promise<VerificationResult> {
  const models = Object.values(LLM_MODELS);

  console.log(`Verifying fact with ${models.length} models...`);
  console.log(`Fact: "${fact.slice(0, 100)}..."`);

  const modelPromises = models.map(model => callModel(model, fact, source, evidence));
  const modelResults = await Promise.all(modelPromises);

  for (const result of modelResults) {
    const modelName = LLM_MODEL_NAMES[result.model];
    if (result.status === 'completed') {
      console.log(`  ${modelName}: ${result.score}/5 - ${result.rationale?.slice(0, 50)}...`);
    } else {
      console.log(`  ${modelName}: FAILED - ${result.error}`);
    }
  }

  const consensus = calculateConsensus(modelResults, modelWeights);
  console.log(`Consensus: ${consensus.consensusScore}/5 (${consensus.confidenceLevel})`);

  return {
    modelResults,
    consensus,
  };
}

export async function verifySingleModelGrade(
  model: LLMModel,
  fact: string,
  source: string,
  evidence: string
): Promise<ModelGradeResult> {
  return callModel(model, fact, source, evidence);
}
