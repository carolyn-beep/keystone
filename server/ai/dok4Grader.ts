/**
 * DOK4 Grader Service
 *
 * 5 LLM-powered evaluation steps for DOK4 Spiky Points of View:
 *   Step 1: POV Validation (mid-tier) — gate classifier
 *   Step 3: Source Traceability (mid-tier) — parallel per-source checks
 *   Step 4: LLM Divergence Check (mid-tier) — neutral question + vanilla response
 *   Step 5: Quality Evaluation (quality-tier) — 8 criteria, 3 dimensions, score 1-5
 *   Step 6: Antimemetic Assessment (quality-tier) — barrier diagnosis + strategy
 *
 * Step 2 (Foundation Integrity) is pure math in shared/dok4-foundation.ts.
 * Orchestration (job sequencing, status management) is in Spec 04.
 */

import { z } from 'zod';
import pRetry from 'p-retry';
import pLimit from 'p-limit';
import { DOK4_MODELS, type DOK4Model } from '@shared/schema';
import type {
  DOK4RejectionCategory,
  DOK4TraceabilityResult,
  DivergenceCheckResult,
  DOK4CriteriaBreakdown,
  DOK4AntimemeticAssessment,
  DOK4EvaluationContext,
} from '@shared/dok4-types';
import {
  DOK4_POV_VALIDATION_SYSTEM_PROMPT,
  buildPOVValidationUserPrompt,
  DOK4_TRACEABILITY_SYSTEM_PROMPT,
  buildTraceabilityUserPrompt,
  DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT,
  DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT,
  buildDivergenceQuestionPrompt,
  buildDivergenceVanillaPrompt,
  DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT,
  buildQualityEvaluationUserPrompt,
  DOK4_ANTIMEMETIC_SYSTEM_PROMPT,
  buildAntimemeticUserPrompt,
} from '../prompts/dok4-grading';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const criterionSchema = z.object({
  assessment: z.enum(['strong', 'partial', 'weak']),
  evidence: z.string(),
});

const povValidationSchema = z.object({
  accept: z.boolean(),
  rejection_reason: z.string().nullable(),
  rejection_category: z.enum(['not_a_claim', 'dok3_misclassification', 'opinion_without_evidence']).nullable(),
});

const traceabilityPerSourceSchema = z.object({
  flagged: z.boolean(),
  reasoning: z.string(),
  overlap_summary: z.string().nullable(),
});

const divergenceQuestionSchema = z.object({
  question: z.string(),
});

const divergenceVanillaSchema = z.object({
  response: z.string(),
});

const qualityEvaluationSchema = z.object({
  position_summary: z.string(),
  framework_dependency: z.string(),
  key_evidence: z.array(z.string()),
  vulnerability_points: z.array(z.string()),
  criteria: z.object({
    S1: criterionSchema,
    S2: criterionSchema,
    S3: criterionSchema,
    S4: criterionSchema,
    S5: criterionSchema,
    D1: criterionSchema,
    O1: criterionSchema,
    O2: criterionSchema,
  }),
  score: z.number().min(1).max(5),
  rationale: z.string(),
  feedback: z.string(),
});

const antimemeticSchema = z.object({
  barrier_type: z.enum(['immunity', 'low_transmission', 'high_drag']),
  barrier_diagnosis: z.string(),
  strategy: z.string(),
});


// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Extract JSON from an LLM response, stripping markdown fences.
 */
export function extractJSON(raw: string): unknown {
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

/**
 * Call OpenRouter API with configurable temperature.
 * Same pattern as DOK3's callOpenRouterModel but with temperature parameter.
 */
export async function callDOK4Model(
  model: DOK4Model | string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
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
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`[DOK4-Grade] 429 rate limit from ${model}`);
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
      console.log(`[DOK4-Grade] Model ${model} attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`);
    },
  });
}


// ─── Result Types (local to grader) ─────────────────────────────────────────

export interface POVValidationResult {
  accept: boolean;
  rejectionReason: string | null;
  rejectionCategory: DOK4RejectionCategory | null;
}

export interface DOK4QualityResult {
  positionSummary: string;
  frameworkDependency: string;
  keyEvidence: string[];
  vulnerabilityPoints: string[];
  criteria: DOK4CriteriaBreakdown;
  score: number;
  rationale: string;
  feedback: string;
}


// ─── Step 1: POV Validation ─────────────────────────────────────────────────

/**
 * Validate whether an SPOV is a gradable claim.
 * Gate step -- rejects structurally ungradable submissions.
 */
export async function validatePOV(
  spovText: string,
  primaryDok3Text: string,
  brainliftPurpose: string,
): Promise<POVValidationResult> {
  const userPrompt = buildPOVValidationUserPrompt(spovText, primaryDok3Text, brainliftPurpose);

  let raw: string;
  try {
    raw = await callDOK4Model(
      DOK4_MODELS.GEMINI_FLASH,
      DOK4_POV_VALIDATION_SYSTEM_PROMPT,
      userPrompt,
      500,
      0.0,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] POV Validation Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    raw = await callDOK4Model(
      DOK4_MODELS.SONNET_FALLBACK,
      DOK4_POV_VALIDATION_SYSTEM_PROMPT,
      userPrompt,
      500,
      0.0,
    );
  }

  const parsed = povValidationSchema.parse(extractJSON(raw));

  return {
    accept: parsed.accept,
    rejectionReason: parsed.rejection_reason,
    rejectionCategory: parsed.rejection_category as DOK4RejectionCategory | null,
  };
}


// ─── Step 3: Source Traceability ─────────────────────────────────────────────

/**
 * Check each source in parallel for single-source restatement.
 * Same pattern as DOK3 traceability.
 */
export async function checkDOK4SourceTraceability(
  spovText: string,
  sources: Array<{ sourceName: string; dok2Points: string[]; content: string }>,
): Promise<DOK4TraceabilityResult> {
  if (sources.length === 0) {
    return { flagged: false, flaggedSource: null, overlapSummary: null };
  }

  const limit = pLimit(10);

  console.log(`[DOK4-Grade] Traceability: checking ${sources.length} sources`);

  const results = await Promise.all(
    sources.map(source =>
      limit(async () => {
        const userPrompt = buildTraceabilityUserPrompt(
          spovText,
          source.sourceName,
          source.dok2Points,
          source.content,
        );

        let raw: string;
        try {
          raw = await callDOK4Model(
            DOK4_MODELS.GEMINI_FLASH,
            DOK4_TRACEABILITY_SYSTEM_PROMPT,
            userPrompt,
            500,
            0.1,
          );
        } catch (primaryErr: any) {
          console.log(`[DOK4-Grade] Traceability Gemini failed for ${source.sourceName}: ${primaryErr.message}, trying Sonnet fallback`);
          raw = await callDOK4Model(
            DOK4_MODELS.SONNET_TRACEABILITY_FALLBACK,
            DOK4_TRACEABILITY_SYSTEM_PROMPT,
            userPrompt,
            500,
            0.1,
          );
        }

        const parsed = traceabilityPerSourceSchema.parse(extractJSON(raw));
        return { sourceName: source.sourceName, ...parsed };
      })
    )
  );

  const flaggedResult = results.find(r => r.flagged);
  if (flaggedResult) {
    console.log(`[DOK4-Grade] Traceability FLAGGED: "${flaggedResult.sourceName}" — ${flaggedResult.reasoning}`);
    return {
      flagged: true,
      flaggedSource: flaggedResult.sourceName,
      overlapSummary: flaggedResult.overlap_summary,
    };
  }

  console.log('[DOK4-Grade] Traceability: clear');
  return { flagged: false, flaggedSource: null, overlapSummary: null };
}


// ─── Step 4: LLM Divergence Check ───────────────────────────────────────────

/**
 * Convert SPOV to neutral question and get vanilla LLM response.
 * Two sequential calls: question extraction, then vanilla response.
 */
export async function checkLLMDivergence(
  spovText: string,
): Promise<DivergenceCheckResult> {
  // Call 1: Extract neutral question from SPOV
  const questionPrompt = buildDivergenceQuestionPrompt(spovText);

  let questionRaw: string;
  try {
    questionRaw = await callDOK4Model(
      DOK4_MODELS.GEMINI_FLASH,
      DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT,
      questionPrompt,
      300,
      0.1,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] Divergence question Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    questionRaw = await callDOK4Model(
      DOK4_MODELS.SONNET_FALLBACK,
      DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT,
      questionPrompt,
      300,
      0.1,
    );
  }

  const { question } = divergenceQuestionSchema.parse(extractJSON(questionRaw));

  // Call 2: Get vanilla LLM response to the question
  const vanillaPrompt = buildDivergenceVanillaPrompt(question);

  let vanillaRaw: string;
  try {
    vanillaRaw = await callDOK4Model(
      DOK4_MODELS.GEMINI_FLASH,
      DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT,
      vanillaPrompt,
      1000,
      0.3,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] Divergence vanilla Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    vanillaRaw = await callDOK4Model(
      DOK4_MODELS.SONNET_FALLBACK,
      DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT,
      vanillaPrompt,
      1000,
      0.3,
    );
  }

  const { response: vanillaResponse } = divergenceVanillaSchema.parse(extractJSON(vanillaRaw));

  console.log(`[DOK4-Grade] Divergence check complete. Question: "${question.substring(0, 60)}..."`);

  return { question, vanillaResponse };
}


// ─── Step 5: Quality Evaluation ──────────────────────────────────────────────

/**
 * Evaluate SPOV quality across 8 criteria, 3 dimensions. Score 1-5.
 */
export async function evaluateDOK4Quality(
  context: DOK4EvaluationContext,
): Promise<DOK4QualityResult> {
  const userPrompt = buildQualityEvaluationUserPrompt(context);

  let raw: string;
  let usedModel: string;

  try {
    console.log('[DOK4-Grade] Calling Opus for quality evaluation...');
    raw = await callDOK4Model(
      DOK4_MODELS.OPUS,
      DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT,
      userPrompt,
      4000,
      0.1,
    );
    usedModel = DOK4_MODELS.OPUS;
  } catch (opusErr: any) {
    console.log(`[DOK4-Grade] Opus failed (${opusErr.message}), trying Sonnet fallback...`);
    try {
      raw = await callDOK4Model(
        DOK4_MODELS.SONNET_FALLBACK,
        DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT,
        userPrompt,
        4000,
        0.1,
      );
      usedModel = DOK4_MODELS.SONNET_FALLBACK;
    } catch (sonnetErr: any) {
      console.error(`[DOK4-Grade] Both models failed. Opus: ${opusErr.message}, Sonnet: ${sonnetErr.message}`);
      throw new Error('Both grading models failed');
    }
  }

  const parsed = qualityEvaluationSchema.parse(extractJSON(raw));

  console.log(`[DOK4-Grade] Quality evaluation: score=${parsed.score}, model=${usedModel}`);

  return {
    positionSummary: parsed.position_summary,
    frameworkDependency: parsed.framework_dependency,
    keyEvidence: parsed.key_evidence,
    vulnerabilityPoints: parsed.vulnerability_points,
    criteria: parsed.criteria as DOK4CriteriaBreakdown,
    score: parsed.score,
    rationale: parsed.rationale,
    feedback: parsed.feedback,
  };
}


// ─── Step 6: Antimemetic Assessment ──────────────────────────────────────────

/**
 * Diagnose antimemetic barriers and provide strategy.
 * Only called when quality score >= 3.
 */
export async function assessAntimemetic(
  spovText: string,
  brainliftPurpose: string,
  qualityScore: number,
  positionSummary: string,
): Promise<DOK4AntimemeticAssessment> {
  const userPrompt = buildAntimemeticUserPrompt(spovText, brainliftPurpose, positionSummary);

  let raw: string;

  try {
    console.log('[DOK4-Grade] Calling Opus for antimemetic assessment...');
    raw = await callDOK4Model(
      DOK4_MODELS.OPUS,
      DOK4_ANTIMEMETIC_SYSTEM_PROMPT,
      userPrompt,
      2000,
      0.3,
    );
  } catch (opusErr: any) {
    console.log(`[DOK4-Grade] Opus failed (${opusErr.message}), trying Sonnet fallback...`);
    try {
      raw = await callDOK4Model(
        DOK4_MODELS.SONNET_FALLBACK,
        DOK4_ANTIMEMETIC_SYSTEM_PROMPT,
        userPrompt,
        2000,
        0.3,
      );
    } catch (sonnetErr: any) {
      console.error(`[DOK4-Grade] Both models failed. Opus: ${opusErr.message}, Sonnet: ${sonnetErr.message}`);
      throw new Error('Both antimemetic assessment models failed');
    }
  }

  const parsed = antimemeticSchema.parse(extractJSON(raw));

  console.log(`[DOK4-Grade] Antimemetic assessment: barrier=${parsed.barrier_type}`);

  return {
    barrier_type: parsed.barrier_type as DOK4AntimemeticAssessment['barrier_type'],
    barrier_diagnosis: parsed.barrier_diagnosis,
    strategy: parsed.strategy,
  };
}
