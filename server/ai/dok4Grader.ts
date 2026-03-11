/**
 * DOK4 Grader Service
 *
 * 5 LLM-powered evaluation steps for DOK4 Spiky Points of View:
 *   Step 1: POV Validation (mid-tier) — gate classifier
 *   Step 3: Source Traceability (mid-tier) — parallel per-source checks
 *   Step 4: LLM Divergence Check (mid-tier) — neutral question + vanilla response
 *   Step 5: Quality Evaluation (quality-tier) — 7 criteria, 2 dimensions, score 1-5
 *   Step 6: Antimemetic Assessment (quality-tier) — barrier diagnosis + strategy
 *
 * Step 2 (Foundation Integrity) is pure math in shared/dok4-foundation.ts.
 * Orchestration (job sequencing, status management) is in Spec 04.
 */

import { z } from 'zod';
import pRetry, { AbortError } from 'p-retry';
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


// ─── JSON Schemas (for structured output enforcement) ────────────────────────

const POV_VALIDATION_JSON_SCHEMA = {
  name: 'pov_validation',
  schema: {
    type: 'object',
    properties: {
      accept: { type: 'boolean' },
      rejection_reason: { type: ['string', 'null'] },
      rejection_category: { type: ['string', 'null'], enum: ['not_a_claim', 'dok3_misclassification', 'opinion_without_evidence', null] },
    },
    required: ['accept', 'rejection_reason', 'rejection_category'],
    additionalProperties: false,
  },
};

const TRACEABILITY_JSON_SCHEMA = {
  name: 'traceability_check',
  schema: {
    type: 'object',
    properties: {
      flagged: { type: 'boolean' },
      reasoning: { type: 'string' },
      overlap_summary: { type: ['string', 'null'] },
    },
    required: ['flagged', 'reasoning', 'overlap_summary'],
    additionalProperties: false,
  },
};

const DIVERGENCE_QUESTION_JSON_SCHEMA = {
  name: 'divergence_question',
  schema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
    },
    required: ['question'],
    additionalProperties: false,
  },
};

const DIVERGENCE_VANILLA_JSON_SCHEMA = {
  name: 'divergence_vanilla',
  schema: {
    type: 'object',
    properties: {
      response: { type: 'string' },
    },
    required: ['response'],
    additionalProperties: false,
  },
};

const CRITERION_SCHEMA = {
  type: 'object',
  properties: {
    assessment: { type: 'string', enum: ['strong', 'partial', 'weak'] },
    evidence: { type: 'string' },
  },
  required: ['assessment', 'evidence'],
  additionalProperties: false,
};

const QUALITY_EVALUATION_JSON_SCHEMA = {
  name: 'quality_evaluation',
  schema: {
    type: 'object',
    properties: {
      position_summary: { type: 'string' },
      framework_dependency: { type: 'string' },
      key_evidence: { type: 'array', items: { type: 'string' } },
      vulnerability_points: { type: 'array', items: { type: 'string' } },
      criteria: {
        type: 'object',
        properties: {
          S1: CRITERION_SCHEMA, S2: CRITERION_SCHEMA, S3: CRITERION_SCHEMA,
          S4: CRITERION_SCHEMA, S5: CRITERION_SCHEMA,
          O1: CRITERION_SCHEMA, O2: CRITERION_SCHEMA,
        },
        required: ['S1', 'S2', 'S3', 'S4', 'S5', 'O1', 'O2'],
        additionalProperties: false,
      },
      score: { type: 'number' },
      rationale: { type: 'string' },
      feedback: { type: 'string' },
    },
    required: ['position_summary', 'framework_dependency', 'key_evidence', 'vulnerability_points', 'criteria', 'score', 'rationale', 'feedback'],
    additionalProperties: false,
  },
};

const ANTIMEMETIC_JSON_SCHEMA = {
  name: 'antimemetic_assessment',
  schema: {
    type: 'object',
    properties: {
      barrier_type: { type: 'string', enum: ['immunity', 'low_transmission', 'high_drag'] },
      barrier_diagnosis: { type: 'string' },
      strategy: { type: 'string' },
    },
    required: ['barrier_type', 'barrier_diagnosis', 'strategy'],
    additionalProperties: false,
  },
};


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
    console.error('[DOK4-Grade] Failed to extract JSON from LLM response:', raw.substring(0, 500));
    throw new Error('Could not find JSON in response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Call OpenRouter API with configurable temperature and optional JSON schema enforcement.
 *
 * When a jsonSchema is provided, the API uses structured output (`json_schema` response format)
 * which guarantees valid JSON conforming to the schema — no truncation or malformed responses.
 * Without a schema, falls back to `json_object` mode.
 *
 * Retries on API errors (429, 5xx) and on JSON parse failures.
 */
export async function callDOK4Model(
  model: DOK4Model | string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
  jsonSchema?: { name: string; schema: Record<string, unknown> },
): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const responseFormat = jsonSchema
    ? {
        type: 'json_schema' as const,
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      }
    : { type: 'json_object' as const };

  const run = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          response_format: responseFormat,
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`Timeout: ${model} took >60s`);
      }
      throw err;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`[DOK4-Grade] 429 rate limit from ${model}`);
        throw new AbortError(`RATE_LIMIT: ${model}`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response content');
    }

    // Validate that the response is parseable JSON (catches truncation)
    extractJSON(content);

    return content as string;
  };

  return pRetry(run, {
    retries: 2,
    minTimeout: 500,
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
      0.0,
      POV_VALIDATION_JSON_SCHEMA,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] POV Validation Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    raw = await callDOK4Model(
      DOK4_MODELS.SONNET_MID_FALLBACK,
      DOK4_POV_VALIDATION_SYSTEM_PROMPT,
      userPrompt,
      0.0,
      POV_VALIDATION_JSON_SCHEMA,
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
            0.1,
            TRACEABILITY_JSON_SCHEMA,
          );
        } catch (primaryErr: any) {
          console.log(`[DOK4-Grade] Traceability Gemini failed for ${source.sourceName}: ${primaryErr.message}, trying Sonnet fallback`);
          raw = await callDOK4Model(
            DOK4_MODELS.SONNET_MID_FALLBACK,
            DOK4_TRACEABILITY_SYSTEM_PROMPT,
            userPrompt,
            0.1,
            TRACEABILITY_JSON_SCHEMA,
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
      0.1,
      DIVERGENCE_QUESTION_JSON_SCHEMA,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] Divergence question Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    questionRaw = await callDOK4Model(
      DOK4_MODELS.SONNET_MID_FALLBACK,
      DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT,
      questionPrompt,
      0.1,
      DIVERGENCE_QUESTION_JSON_SCHEMA,
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
      0.3,
      DIVERGENCE_VANILLA_JSON_SCHEMA,
    );
  } catch (primaryErr: any) {
    console.log(`[DOK4-Grade] Divergence vanilla Gemini failed: ${primaryErr.message}, trying Sonnet fallback`);
    vanillaRaw = await callDOK4Model(
      DOK4_MODELS.SONNET_MID_FALLBACK,
      DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT,
      vanillaPrompt,
      0.3,
      DIVERGENCE_VANILLA_JSON_SCHEMA,
    );
  }

  const { response: vanillaResponse } = divergenceVanillaSchema.parse(extractJSON(vanillaRaw));

  console.log(`[DOK4-Grade] Divergence check complete. Question: "${question.substring(0, 60)}..."`);

  return { question, vanillaResponse };
}


// ─── Step 5: Quality Evaluation ──────────────────────────────────────────────

/**
 * Evaluate SPOV quality across 7 criteria, 2 dimensions. Score 1-5.
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
      0.1,
      QUALITY_EVALUATION_JSON_SCHEMA,
    );
    usedModel = DOK4_MODELS.OPUS;
  } catch (opusErr: any) {
    console.log(`[DOK4-Grade] Opus failed (${opusErr.message}), trying Sonnet fallback...`);
    try {
      raw = await callDOK4Model(
        DOK4_MODELS.SONNET_FALLBACK,
        DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT,
        userPrompt,
        0.1,
        QUALITY_EVALUATION_JSON_SCHEMA,
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
      0.3,
      ANTIMEMETIC_JSON_SCHEMA,
    );
  } catch (opusErr: any) {
    console.log(`[DOK4-Grade] Opus failed (${opusErr.message}), trying Sonnet fallback...`);
    try {
      raw = await callDOK4Model(
        DOK4_MODELS.SONNET_FALLBACK,
        DOK4_ANTIMEMETIC_SYSTEM_PROMPT,
        userPrompt,
        0.3,
        ANTIMEMETIC_JSON_SCHEMA,
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
