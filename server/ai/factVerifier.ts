import { z } from 'zod';
import { type VerificationStatus } from '@shared/schema';
import { callModelWithFallback } from './client/index';
import { type PreviousEvaluation, formatPreviousEvaluationSection, formatRegradingRules } from '@shared/types/regrading';
import type { EvidenceResult, WebEvidenceMode } from './evidenceFetcher';
import type { ReadableWebSource } from '../services/web-research';

const modelGradeSchema = z.object({
  score: z.number().min(1).max(5),
  rationale: z.string(),
});

export interface ModelGradeResult {
  model: string;
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

export interface VerificationEvidenceInput {
  content: string;
  mode: WebEvidenceMode;
  originalSourceUrl: string | null;
  evidenceError: string | null;
  fallbackSources?: ReadableWebSource[];
}

type VerificationEvidenceArg = string | VerificationEvidenceInput | EvidenceResult;

const GRADING_SYSTEM_PROMPT = `You are an expert fact-checker. You rigorously evaluate claims against supplied evidence only.

GRADING SCALE (1-5):
5 = VERIFIED: Claim is well-supported by the supplied evidence
4 = MOSTLY VERIFIED: Claim is largely supported by the supplied evidence with minor caveats
3 = PARTIALLY SUPPORTED: Supplied evidence is limited, mixed, or supports only part of the claim
2 = QUESTIONABLE: Claim is oversimplified, misleading, or poorly supported by the supplied evidence
1 = LIKELY FALSE: Claim contradicts the supplied evidence

INSTRUCTIONS:
1. Use only the supplied evidence in the user message.
2. Do not add outside facts, references, citations, or assumptions that are not present in the supplied evidence.
3. If no accessible evidence is supplied, set "isNonGradeable": true.
4. Your rationale should explain how the supplied evidence supports, weakens, contradicts, or fails to address the claim.

Output Format:
{
  "score": <1-5>,
  "rationale": "<Substantive explanation referencing supplied evidence>",
  "isNonGradeable": <boolean>
}`;

const FACT_VERIFICATION_SCHEMA = {
  type: 'json_schema' as const,
  jsonSchema: {
    name: 'fact_verification',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        score: { type: 'number', description: 'Score from 1-5' },
        rationale: { type: 'string', description: 'Substantive explanation referencing research/evidence' },
        isNonGradeable: { type: 'boolean', description: 'True only for highly obscure claims that cannot be evaluated' },
      },
      required: ['score', 'rationale', 'isNonGradeable'],
      additionalProperties: false,
    },
  },
};

/**
 * Parse the LLM response content into a verification result.
 * Handles JSON extraction, control char sanitization, and regex fallback.
 */
function parseVerificationResponse(content: string): {
  score: number;
  rationale: string;
  isNonGradeable: boolean;
} {
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
  } catch {
    // Raw parse failed — escape control chars only inside JSON string values
    // (preserving structural whitespace between properties)
    try {
      const sanitized = jsonMatch[0].replace(
        /"(?:[^"\\]|\\.)*"/g,
        (str: string) => str.replace(/[\x00-\x1F\x7F]/g, (ch: string) =>
          ch === '\n' ? '\\n' : ch === '\t' ? '\\t' : ch === '\r' ? '\\r' : ''
        )
      );
      parsed = JSON.parse(sanitized);
    } catch (parseErr) {
    // JSON.parse failed — fall back to regex extraction
    console.warn('[FactVerifier] JSON.parse failed, using regex fallback', {
      error: (parseErr as Error).message,
      rawSnippet: jsonMatch[0].slice(0, 200),
    });

    const scoreMatch = cleanContent.match(/"score"\s*:\s*(\d)/);
    const rationaleMatch = cleanContent.match(/"rationale"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const nonGradeableMatch = cleanContent.match(/"isNonGradeable"\s*:\s*(true|false)/i);

    if (scoreMatch) {
      if (!rationaleMatch) {
        console.warn('[FactVerifier] Could not extract rationale via regex');
      }
      parsed = {
        score: parseInt(scoreMatch[1]),
        rationale: rationaleMatch ? rationaleMatch[1] : 'Unable to parse full rationale',
        isNonGradeable: nonGradeableMatch ? nonGradeableMatch[1].toLowerCase() === 'true' : false
      };
    } else {
      throw new Error('Could not parse JSON response');
    }
  }}

  return {
    score: parsed.score,
    rationale: parsed.rationale,
    isNonGradeable: parsed.isNonGradeable === true || parsed.isNonGradeable === 'true'
  };
}

/**
 * Call a single model for fact verification using the unified AI client.
 */
async function callVerificationModel(
  fact: string,
  source: string,
  evidence: VerificationEvidenceInput,
  previousEvaluation?: PreviousEvaluation
): Promise<ModelGradeResult & { isNonGradeable?: boolean }> {
  const provenanceInstructions = (() => {
    if (evidence.mode === 'fallback_search') {
      const fallbackSourceList = (evidence.fallbackSources ?? [])
        .map((fallbackSource, index) => `${index + 1}. ${fallbackSource.title ?? 'Untitled source'} - ${fallbackSource.url}`)
        .join('\n');

      return `EVIDENCE PROVENANCE:
The original source could not be retrieved${evidence.evidenceError ? ` (${evidence.evidenceError})` : ''}.
The evidence below comes from alternate accessible web sources found during fallback search.
In the rationale, state that the original source could not be retrieved and that the assessment is based on alternate accessible web sources.
${fallbackSourceList ? `\nFallback sources:\n${fallbackSourceList}` : ''}`;
    }

    if (evidence.mode === 'none') {
      return `EVIDENCE PROVENANCE:
No accessible evidence was available${evidence.evidenceError ? ` (${evidence.evidenceError})` : ''}.
Set "isNonGradeable": true. Do not assign a plausibility score.`;
    }

    if (evidence.mode === 'cached_transcript') {
      return `EVIDENCE PROVENANCE:
Use only the supplied transcript evidence from the submitted source.`;
    }

    return `EVIDENCE PROVENANCE:
Use only the supplied submitted source evidence.`;
  })();

  let userPrompt = `CLAIM TO VERIFY:
"${fact}"

CITED SOURCE:
${source || 'No source citation provided'}

${provenanceInstructions}

ORIGINAL SOURCE URL:
${evidence.originalSourceUrl ?? 'Not provided'}

SUPPLIED EVIDENCE:
${evidence.content || 'No accessible evidence supplied.'}

Grade this claim using only the supplied evidence. Provide a substantive rationale explaining your assessment.`;

  let systemPrompt = GRADING_SYSTEM_PROMPT;

  if (previousEvaluation) {
    systemPrompt += formatRegradingRules();
    userPrompt += '\n\n' + formatPreviousEvaluationSection(previousEvaluation);
  }

  const mode = evidence.mode;
  const sourcePreview = source.length > 100 ? `${source.slice(0, 100)}...` : source;
  const factPreview = fact.length > 100 ? `${fact.slice(0, 100)}...` : fact;

  try {
    const result = await callModelWithFallback({
      models: ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'],
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
      maxTokens: 800,
      responseFormat: FACT_VERIFICATION_SCHEMA,
      timeout: 45_000,
      retries: 2,
      caller: 'factVerifier',
      userFacing: true,
      validate: (content) => { parseVerificationResponse(content); },
    });

    const parsed = parseVerificationResponse(result.content);

    const scoreStr = parsed.isNonGradeable ? 'NG' : String(parsed.score);
    console.log(`[FactVerifier] mode=${mode} score=${scoreStr} model=${result.model} evidenceChars=${evidence.content.length} source="${sourcePreview}" fact="${factPreview}"`);

    return {
      model: result.model,
      score: parsed.isNonGradeable ? 0 : parsed.score,
      rationale: parsed.rationale,
      isNonGradeable: parsed.isNonGradeable,
      status: 'completed',
      error: null,
    };
  } catch (err: any) {
    console.error(`Fact verification failed:`, err);
    const errorPreview = (err.message || 'Unknown error').slice(0, 200).replace(/\s+/g, ' ');
    console.log(`[FactVerifier] mode=${mode} status=failed error="${errorPreview}" source="${sourcePreview}" fact="${factPreview}"`);
    return {
      model: 'unknown',
      score: null,
      rationale: null,
      status: 'failed',
      error: err.message || 'Unknown error',
    };
  }
}

type ModelWeights = Record<string, number>;

function normalizeEvidenceInput(
  evidence: VerificationEvidenceArg,
  linkFailed: boolean
): VerificationEvidenceInput {
  if (typeof evidence === 'string') {
    const content = evidence || '';
    return {
      content,
      mode: content && !linkFailed ? 'direct_source' : 'none',
      originalSourceUrl: null,
      evidenceError: linkFailed ? 'Source evidence unavailable' : null,
    };
  }

  const fallbackSources = (evidence as VerificationEvidenceInput).fallbackSources
    ?? (evidence as EvidenceResult).fallbackSearch?.sources;

  const normalized: VerificationEvidenceInput = {
    content: evidence.content ?? '',
    mode: evidence.mode ?? ((evidence.content && !linkFailed) ? 'direct_source' : 'none'),
    originalSourceUrl: evidence.originalSourceUrl ?? null,
    evidenceError: 'evidenceError' in evidence ? evidence.evidenceError : (evidence.error ?? null),
    fallbackSources,
  };

  if (normalized.mode === 'fallback_search' && (!normalized.fallbackSources || normalized.fallbackSources.length === 0)) {
    return {
      ...normalized,
      content: '',
      mode: 'none',
      evidenceError: normalized.evidenceError ?? 'Fallback search evidence missing readable sources',
    };
  }

  return normalized;
}

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
  evidence: VerificationEvidenceArg,
  linkFailed: boolean = false,
  previousEvaluation?: PreviousEvaluation,
  modelWeights?: ModelWeights
): Promise<VerificationResult & { consensus: ConsensusResult & { isNonGradeable?: boolean } }> {
  const evidenceInput = normalizeEvidenceInput(evidence, linkFailed);
  const result = await callVerificationModel(fact, source, evidenceInput, previousEvaluation);

  const modelResults = [result];
  const consensus = calculateConsensus(modelResults, modelWeights);

  if (evidenceInput.mode === 'fallback_search') {
    const fallbackSourceCount = evidenceInput.fallbackSources?.length ?? 0;
    console.log(
      `[FactVerifier] FALLBACK_SEARCH_SCORE score=${consensus.isNonGradeable ? 'NG' : consensus.consensusScore} confidence=${consensus.confidenceLevel} needsReview=${consensus.needsReview} fallbackSources=${fallbackSourceCount}`
    );
  }

  return { modelResults, consensus };
}
