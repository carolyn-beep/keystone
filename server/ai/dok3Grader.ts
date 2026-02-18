/**
 * DOK3 Grader Service
 *
 * 4-step evaluation pipeline for cross-source DOK3 insights:
 *   Step 1: Compute Foundation Integrity Index (pure math)
 *   Step 2: Source Traceability Check (parallel LLM calls, mid-tier)
 *   Step 3: Conceptual Coherence Evaluation (single quality-tier LLM call)
 *   Step 4: Final Score Computation (pure math — apply ceiling)
 */

import { z } from 'zod';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { DOK3_MODELS, type DOK3Model } from '@shared/schema';
import type { DOK3GradingProgress } from '@shared/import-progress';
import { storage } from '../storage';
import type { DOK3EvaluationContext } from '../storage/dok3';
import {
  DOK3_GRADING_SYSTEM_PROMPT,
  DOK3_TRACEABILITY_SYSTEM_PROMPT,
  buildDOK3UserPrompt,
  buildTraceabilityUserPrompt,
} from '../prompts/dok3-grading';

export type DOK3ProgressCallback = (event: DOK3GradingProgress) => void;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ─── Zod Validation ───────────────────────────────────────────────────────────

const criterionSchema = z.object({
  assessment: z.enum(['strong', 'partial', 'weak']),
  evidence: z.string(),
});

const dok3EvaluationSchema = z.object({
  framework_name: z.string(),
  framework_description: z.string(),
  criteria: z.object({
    V1: criterionSchema,
    V2: criterionSchema,
    V3: criterionSchema,
    C1: criterionSchema,
    C2: criterionSchema,
    P1: criterionSchema,
    P2: criterionSchema,
  }),
  score: z.number().min(1).max(5),
  rationale: z.string(),
  feedback: z.string(),
});

const traceabilitySchema = z.object({
  flagged: z.boolean(),
  reasoning: z.string(),
});

type DOK3EvaluationResult = z.infer<typeof dok3EvaluationSchema>;

export interface DOK3GradeResult {
  insightId: number;
  score: number;
  frameworkName: string;
  frameworkDescription: string;
  criteriaBreakdown: Record<string, { assessment: string; evidence: string }>;
  rationale: string;
  feedback: string;
  dok1FoundationScore: number;
  dok2SynthesisScore: number;
  foundationIntegrityIndex: number;
  ceiling: number;
  traceabilityFlagged: boolean;
  traceabilityFlaggedSource: string | null;
  evaluatorModel: string;
}

// ─── Shared Helper: OpenRouter API Call ───────────────────────────────────────

async function callOpenRouterModel(
  model: DOK3Model | string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string> {
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
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`[DOK3-Grade] 429 rate limit from ${model}`);
        throw new Error(`RATE_LIMIT: ${model}`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content');
    }

    return content as string;
  };

  return pRetry(run, {
    retries: 2,
    onFailedAttempt: error => {
      console.log(`[DOK3-Grade] Model ${model} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
    },
  });
}

/**
 * Extract JSON from an LLM response, stripping markdown fences.
 */
function extractJSON(raw: string): unknown {
  let clean = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not find JSON in response');
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── Step 1: Foundation Integrity Index ───────────────────────────────────────

interface FoundationMetrics {
  dok1Score: number;
  dok2Score: number;
  index: number;
  ceiling: number;
}

/**
 * Weighted median helper. Weights must be positive.
 * Returns the value at which cumulative weight reaches 50%.
 */
function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // Create pairs and sort by value
  const pairs = values.map((v, i) => ({ value: v, weight: weights[i] }));
  pairs.sort((a, b) => a.value - b.value);

  const totalWeight = pairs.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;

  const halfWeight = totalWeight / 2;
  let cumulative = 0;

  for (let i = 0; i < pairs.length; i++) {
    cumulative += pairs[i].weight;
    if (cumulative >= halfWeight) {
      return pairs[i].value;
    }
  }

  return pairs[pairs.length - 1].value;
}

export function computeFoundationIndex(context: DOK3EvaluationContext): FoundationMetrics {
  // DOK1 Foundation Score: weighted median of DOK1 fact scores (`facts.score`)
  // Each fact contributes its score with equal weight
  const dok1Values: number[] = [];
  const dok1Weights: number[] = [];

  console.log(`[DOK3-Foundation] Computing for ${context.linkedDok2s.length} linked DOK2s`);

  for (const dok2 of context.linkedDok2s) {
    console.log(`[DOK3-Foundation]   DOK2#${dok2.id} "${dok2.sourceName}": grade=${dok2.grade}, ${dok2.dok1Facts.length} DOK1 facts`);
    for (const fact of dok2.dok1Facts) {
      // DOK1 score = facts.score (the extraction quality score, 1-5)
      console.log(`[DOK3-Foundation]     Fact#${fact.id}: score=${fact.score}, gradeable=${fact.isGradeable}`);
      dok1Values.push(fact.score);
      dok1Weights.push(1); // Equal weight — score IS the value
    }
  }

  console.log(`[DOK3-Foundation] DOK1 values: [${dok1Values.join(', ')}], weights: [${dok1Weights.join(', ')}]`);
  const dok1Score = dok1Values.length > 0 ? weightedMedian(dok1Values, dok1Weights) : 0;

  // DOK2 Synthesis Score: arithmetic mean of DOK2 grades
  const dok2Grades = context.linkedDok2s
    .map(d => d.grade)
    .filter((g): g is number => g !== null);
  const dok2Score = dok2Grades.length > 0
    ? dok2Grades.reduce((sum, g) => sum + g, 0) / dok2Grades.length
    : 0;

  // Foundation Integrity Index: 0.4 × DOK1 + 0.6 × DOK2
  const index = 0.4 * dok1Score + 0.6 * dok2Score;

  // Ceiling
  let ceiling: number;
  if (index >= 4.0) {
    ceiling = 5;
  } else if (index >= 3.0) {
    ceiling = 4;
  } else {
    ceiling = 3;
  }

  console.log(`[DOK3-Grade] Foundation: DOK1=${dok1Score.toFixed(2)}, DOK2=${dok2Score.toFixed(2)}, Index=${index.toFixed(2)}, Ceiling=${ceiling}`);

  return { dok1Score, dok2Score, index, ceiling };
}

// ─── Step 2: Source Traceability Check ────────────────────────────────────────

interface TraceabilityResult {
  flagged: boolean;
  flaggedSource: string | null;
}

export async function checkSourceTraceability(
  insightText: string,
  context: DOK3EvaluationContext
): Promise<TraceabilityResult> {
  // Group DOK2s by normalized source URL, collecting points and evidence per source
  const sourceMap = new Map<string, {
    sourceName: string;
    dok2Points: string[];
    content: string;
  }>();

  for (const dok2 of context.linkedDok2s) {
    const key = dok2.sourceUrl
      ? dok2.sourceUrl.toLowerCase().replace(/\/+$/, '')
      : dok2.sourceName.toLowerCase().trim();

    console.log(`[DOK3-Trace] DOK2#${dok2.id}: sourceName="${dok2.sourceName}", sourceUrl="${dok2.sourceUrl}", key="${key}", ${dok2.points.length} points`);

    const existing = sourceMap.get(key);
    if (existing) {
      existing.dok2Points.push(...dok2.points);
    } else {
      // Get evidence content for this source
      const content = dok2.sourceUrl
        ? (context.sourceEvidence.get(dok2.sourceUrl.toLowerCase().replace(/\/+$/, '')) ?? '')
        : '';

      sourceMap.set(key, {
        sourceName: dok2.sourceName,
        dok2Points: [...dok2.points],
        content,
      });
    }
  }

  const limit = pLimit(10);
  const sources = Array.from(sourceMap.values());

  console.log(`[DOK3-Grade] Traceability: checking ${sources.length} unique sources`);

  const results = await Promise.all(
    sources.map(source =>
      limit(async () => {
        const userPrompt = buildTraceabilityUserPrompt(
          insightText,
          source.sourceName,
          source.dok2Points,
          source.content
        );

        let raw: string;
        try {
          raw = await callOpenRouterModel(
            DOK3_MODELS.GEMINI_FLASH,
            DOK3_TRACEABILITY_SYSTEM_PROMPT,
            userPrompt,
            500
          );
        } catch (primaryErr: any) {
          console.log(`[DOK3-Grade] Traceability Gemini failed for ${source.sourceName}: ${primaryErr.message}, trying Sonnet fallback`);
          raw = await callOpenRouterModel(
            DOK3_MODELS.SONNET_TRACEABILITY_FALLBACK,
            DOK3_TRACEABILITY_SYSTEM_PROMPT,
            userPrompt,
            500
          );
        }

        const parsed = traceabilitySchema.parse(extractJSON(raw));
        return { sourceName: source.sourceName, ...parsed };
      })
    )
  );

  const flaggedResult = results.find(r => r.flagged);
  if (flaggedResult) {
    console.log(`[DOK3-Grade] Traceability FLAGGED: "${flaggedResult.sourceName}" — ${flaggedResult.reasoning}`);
    return { flagged: true, flaggedSource: flaggedResult.sourceName };
  }

  console.log('[DOK3-Grade] Traceability: clear');
  return { flagged: false, flaggedSource: null };
}

// ─── Step 3: Conceptual Coherence Evaluation ──────────────────────────────────

async function evaluateConceptualCoherence(
  context: DOK3EvaluationContext,
  foundationMetrics: FoundationMetrics,
  traceability: TraceabilityResult
): Promise<{ result: DOK3EvaluationResult; model: string }> {
  // Build traceability status string
  const traceabilityStatus = traceability.flagged
    ? `flagged: "${traceability.flaggedSource}" — this source appears to fully contain the insight`
    : 'clear';

  // Build source evidence map with source names for the prompt
  const sourceEvidenceForPrompt = new Map<string, { sourceName: string; content: string }>();
  for (const dok2 of context.linkedDok2s) {
    if (dok2.sourceUrl) {
      const key = dok2.sourceUrl.toLowerCase().replace(/\/+$/, '');
      const content = context.sourceEvidence.get(key);
      if (content && !sourceEvidenceForPrompt.has(key)) {
        sourceEvidenceForPrompt.set(key, { sourceName: dok2.sourceName, content });
      }
    }
  }

  const userPrompt = buildDOK3UserPrompt(
    context.brainliftPurpose,
    context.insight.text,
    {
      linkedDok2s: context.linkedDok2s.map(d => ({
        sourceName: d.sourceName,
        grade: d.grade,
        points: d.points,
        dok1Facts: d.dok1Facts.map(f => ({
          fact: f.fact,
          score: f.score,
        })),
      })),
      sourceEvidence: sourceEvidenceForPrompt,
      foundationMetrics: {
        dok1Score: foundationMetrics.dok1Score,
        dok2Score: foundationMetrics.dok2Score,
        index: foundationMetrics.index,
      },
      traceabilityStatus,
      previousEvaluation: null,
    }
  );

  // Try Opus primary, Sonnet fallback
  let raw: string;
  let usedModel: string;

  try {
    console.log('[DOK3-Grade] Calling Opus for conceptual coherence evaluation...');
    raw = await callOpenRouterModel(
      DOK3_MODELS.OPUS,
      DOK3_GRADING_SYSTEM_PROMPT,
      userPrompt,
      3000
    );
    usedModel = DOK3_MODELS.OPUS;
  } catch (opusErr: any) {
    console.log(`[DOK3-Grade] Opus failed (${opusErr.message}), trying Sonnet fallback...`);
    try {
      raw = await callOpenRouterModel(
        DOK3_MODELS.SONNET_FALLBACK,
        DOK3_GRADING_SYSTEM_PROMPT,
        userPrompt,
        3000
      );
      usedModel = DOK3_MODELS.SONNET_FALLBACK;
    } catch (sonnetErr: any) {
      console.error(`[DOK3-Grade] Both models failed. Opus: ${opusErr.message}, Sonnet: ${sonnetErr.message}`);
      throw new Error('Both grading models failed');
    }
  }

  // Parse and validate
  let parsed: unknown;
  try {
    parsed = extractJSON(raw);
  } catch (jsonErr: any) {
    // Fallback: try regex extraction for key fields
    console.warn(`[DOK3-Grade] JSON extraction failed, attempting regex fallback: ${jsonErr.message}`);
    const scoreMatch = raw.match(/"score"\s*:\s*(\d)/);
    if (!scoreMatch) {
      throw new Error('Could not parse evaluation response');
    }
    // Minimal fallback — can't reconstruct full criteria from regex
    throw new Error('JSON parse failed and regex cannot reconstruct full DOK3 evaluation');
  }

  const result = dok3EvaluationSchema.parse(parsed);
  console.log(`[DOK3-Grade] Evaluation result: score=${result.score}, framework="${result.framework_name}", model=${usedModel}`);

  return { result, model: usedModel };
}

// ─── Step 4: Final Score Computation ──────────────────────────────────────────

export function computeFinalScore(rawScore: number, ceiling: number): number {
  // Apply foundation ceiling
  const capped = Math.min(rawScore, ceiling);
  // Clamp 1-5
  return Math.max(1, Math.min(5, capped));
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Grade a single DOK3 insight through the full 4-step pipeline.
 */
export async function gradeDOK3Insight(
  insightId: number,
  brainliftId: number,
  onProgress?: DOK3ProgressCallback
): Promise<DOK3GradeResult> {
  console.log(`[DOK3-Grade] === Starting DOK3 grading for insight ${insightId} ===`);

  // Set status → grading
  await storage.updateDOK3InsightStatus(insightId, brainliftId, 'grading');

  try {
    // Gate check: foundation must be graded
    const gateStatus = await storage.checkFoundationGraded(insightId);
    if (!gateStatus.ready) {
      throw new Error(
        `Foundation not ready: ${gateStatus.pendingDok2Count} ungraded DOK2s, ${gateStatus.pendingDok1Count} ungraded DOK1 facts`
      );
    }

    // Fetch evaluation context
    const context = await storage.getInsightEvaluationContext(insightId);
    if (!context) {
      throw new Error(`Insight ${insightId} not found`);
    }

    if (context.linkedDok2s.length === 0) {
      throw new Error(`Insight ${insightId} has no linked DOK2 summaries`);
    }

    // Step 1: Foundation Index
    onProgress?.({ stage: 'dok3:foundation', message: 'Computing foundation metrics...', insightId });
    const foundation = computeFoundationIndex(context);

    // Step 2: Source Traceability
    onProgress?.({ stage: 'dok3:traceability', message: 'Checking source traceability...', insightId });
    const traceability = await checkSourceTraceability(context.insight.text, context);

    // Step 3: Conceptual Coherence Evaluation
    onProgress?.({ stage: 'dok3:evaluation', message: 'Evaluating conceptual coherence...', insightId });
    const { result: evaluation, model: evaluatorModel } = await evaluateConceptualCoherence(
      context,
      foundation,
      traceability
    );

    // Step 4: Final Score
    const finalScore = computeFinalScore(evaluation.score, foundation.ceiling);

    onProgress?.({ stage: 'dok3:complete', message: `Insight scored ${finalScore}/5`, insightId, score: finalScore });
    console.log(`[DOK3-Grade] Final score: ${finalScore} (raw=${evaluation.score}, ceiling=${foundation.ceiling})`);

    // Save results
    const gradeData = {
      score: finalScore,
      frameworkName: evaluation.framework_name,
      frameworkDescription: evaluation.framework_description,
      criteriaBreakdown: evaluation.criteria,
      rationale: evaluation.rationale,
      feedback: evaluation.feedback,
      foundationIntegrityIndex: foundation.index,
      dok1FoundationScore: foundation.dok1Score,
      dok2SynthesisScore: foundation.dok2Score,
      traceabilityFlagged: traceability.flagged,
      traceabilityFlaggedSource: traceability.flaggedSource,
      evaluatorModel,
    };

    await storage.saveDOK3GradeResult(insightId, gradeData);

    console.log(`[DOK3-Grade] === Insight ${insightId} graded successfully ===`);

    return {
      insightId,
      ...gradeData,
      ceiling: foundation.ceiling,
    };
  } catch (error: any) {
    console.error(`[DOK3-Grade] Error grading insight ${insightId}: ${error.message}`);
    onProgress?.({ stage: 'dok3:error', message: `Insight ${insightId} failed`, insightId, error: error.message });
    await storage.updateDOK3InsightStatus(insightId, brainliftId, 'error');
    throw error;
  }
}

// ─── Batch Helper ─────────────────────────────────────────────────────────────

/**
 * Grade all `linked` insights for a brainlift, sequentially.
 * Continues on individual failures.
 */
export async function gradeDOK3Insights(
  brainliftId: number,
  onProgress?: DOK3ProgressCallback
): Promise<{ graded: DOK3GradeResult[]; errors: Array<{ insightId: number; error: string }> }> {
  const allInsights = await storage.getDOK3Insights(brainliftId);
  const linkedInsights = allInsights.filter(i => i.status === 'linked');

  console.log(`[DOK3-Grade] Batch grading ${linkedInsights.length} linked insights for brainlift ${brainliftId}`);

  const graded: DOK3GradeResult[] = [];
  const errors: Array<{ insightId: number; error: string }> = [];

  for (let i = 0; i < linkedInsights.length; i++) {
    const insight = linkedInsights[i];
    onProgress?.({
      stage: 'dok3:start',
      message: `Grading insight ${i + 1} of ${linkedInsights.length}`,
      insightIndex: i + 1,
      insightTotal: linkedInsights.length,
      insightId: insight.id,
    });

    try {
      const result = await gradeDOK3Insight(insight.id, brainliftId, onProgress);
      graded.push(result);
    } catch (err: any) {
      errors.push({ insightId: insight.id, error: err.message });
    }
  }

  console.log(`[DOK3-Grade] Batch complete: ${graded.length} graded, ${errors.length} errors`);
  return { graded, errors };
}
