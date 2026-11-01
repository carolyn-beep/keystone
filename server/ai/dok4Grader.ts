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
 *
 * All LLM calls use the unified AI client (callModelWithFallback).
 */

import { z } from 'zod';
import pLimit from 'p-limit';
import { callModelWithFallback } from './client';
import { formatRegradingRules } from '@shared/types/regrading';
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


// ─── Model Constants ─────────────────────────────────────────────────────────

const MID_TIER_MODELS = ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'] as const;
const DIVERGENCE_TIER_MODELS = ['qwen/qwen-plus', 'google/gemini-2.5-flash-lite'] as const;
const QUALITY_TIER_MODELS = ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.5'] as const;


// ─── JSON Schemas (for structured output enforcement) ────────────────────────

const POV_VALIDATION_JSON_SCHEMA = {
  name: 'pov_validation',
  schema: {
    type: 'object',
    properties: {
      accept: { type: 'boolean' },
      rejection_reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      rejection_category: { anyOf: [{ type: 'string', enum: ['not_a_claim', 'dok3_misclassification', 'opinion_without_evidence'] }, { type: 'null' }] },
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
      criteria: {
        type: 'object',
        properties: {
          S1: CRITERION_SCHEMA, S4: CRITERION_SCHEMA, P1: CRITERION_SCHEMA,
          S2: CRITERION_SCHEMA, S3: CRITERION_SCHEMA, O2: CRITERION_SCHEMA,
        },
        required: ['S1', 'S4', 'P1', 'S2', 'S3', 'O2'],
        additionalProperties: false,
      },
      score: { type: 'number' },
      rationale: { type: 'string' },
      feedback: { type: 'string' },
    },
    required: ['position_summary', 'framework_dependency', 'key_evidence', 'criteria', 'score', 'rationale', 'feedback'],
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
  criteria: z.object({
    S1: criterionSchema,
    S4: criterionSchema,
    P1: criterionSchema,
    S2: criterionSchema,
    S3: criterionSchema,
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

  const t0 = performance.now();
  const result = await callModelWithFallback({
    models: [...MID_TIER_MODELS],
    system: DOK4_POV_VALIDATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0,
    timeout: 60_000,
    retries: 2,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: POV_VALIDATION_JSON_SCHEMA.name, strict: true, schema: POV_VALIDATION_JSON_SCHEMA.schema },
    },
    caller: 'dok4Grader.povValidation',
    userFacing: true,
    validate: (content) => { povValidationSchema.parse(extractJSON(content)); },
  });
  console.log(`[DOK4-Grade] POV Validation: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

  const parsed = povValidationSchema.parse(extractJSON(result.content));

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

        const t0 = performance.now();
        const result = await callModelWithFallback({
          models: [...MID_TIER_MODELS],
          system: DOK4_TRACEABILITY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.1,
          timeout: 60_000,
          retries: 2,
          responseFormat: {
            type: 'json_schema',
            jsonSchema: { name: TRACEABILITY_JSON_SCHEMA.name, strict: true, schema: TRACEABILITY_JSON_SCHEMA.schema },
          },
          caller: 'dok4Grader.traceability',
          validate: (content) => { traceabilityPerSourceSchema.parse(extractJSON(content)); },
        });
        console.log(`[DOK4-Grade] Source Traceability: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

        const parsed = traceabilityPerSourceSchema.parse(extractJSON(result.content));
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

  const t0q = performance.now();
  const questionResult = await callModelWithFallback({
    models: [...DIVERGENCE_TIER_MODELS],
    system: DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: questionPrompt }],
    temperature: 0.1,
    timeout: 30_000,
    retries: 2,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: DIVERGENCE_QUESTION_JSON_SCHEMA.name, strict: true, schema: DIVERGENCE_QUESTION_JSON_SCHEMA.schema },
    },
    caller: 'dok4Grader.divergenceQuestion',
    validate: (content) => { divergenceQuestionSchema.parse(extractJSON(content)); },
  });
  console.log(`[DOK4-Grade] Divergence Question: ${(performance.now() - t0q).toFixed(0)}ms (model: ${questionResult.model})`);

  const { question } = divergenceQuestionSchema.parse(extractJSON(questionResult.content));

  // Call 2: Get vanilla LLM response to the question
  const vanillaPrompt = buildDivergenceVanillaPrompt(question);

  const t0v = performance.now();
  const vanillaResult = await callModelWithFallback({
    models: [...DIVERGENCE_TIER_MODELS],
    system: DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: vanillaPrompt }],
    temperature: 0.3,
    timeout: 30_000,
    retries: 2,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: DIVERGENCE_VANILLA_JSON_SCHEMA.name, strict: true, schema: DIVERGENCE_VANILLA_JSON_SCHEMA.schema },
    },
    caller: 'dok4Grader.divergenceVanilla',
    validate: (content) => { divergenceVanillaSchema.parse(extractJSON(content)); },
  });
  console.log(`[DOK4-Grade] Divergence Vanilla: ${(performance.now() - t0v).toFixed(0)}ms (model: ${vanillaResult.model})`);

  const { response: vanillaResponse } = divergenceVanillaSchema.parse(extractJSON(vanillaResult.content));

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

  let systemPrompt = DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT;
  if (context.previousEvaluation) {
    systemPrompt += formatRegradingRules();
  }

  const t0 = performance.now();
  const result = await callModelWithFallback({
    models: [...QUALITY_TIER_MODELS],
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.1,
    timeout: 70_000,
    retries: 2,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: QUALITY_EVALUATION_JSON_SCHEMA.name, strict: true, schema: QUALITY_EVALUATION_JSON_SCHEMA.schema },
    },
    caller: 'dok4Grader.qualityEvaluation.v2',
    userFacing: true,
    validate: (content) => { qualityEvaluationSchema.parse(extractJSON(content)); },
  });
  console.log(`[DOK4-Grade] Quality Evaluation: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

  const parsed = qualityEvaluationSchema.parse(extractJSON(result.content));

  return {
    positionSummary: parsed.position_summary,
    frameworkDependency: parsed.framework_dependency,
    keyEvidence: parsed.key_evidence,
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

  const t0 = performance.now();
  const result = await callModelWithFallback({
    models: [...QUALITY_TIER_MODELS],
    system: DOK4_ANTIMEMETIC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.3,
    timeout: 70_000,
    retries: 2,
    responseFormat: {
      type: 'json_schema',
      jsonSchema: { name: ANTIMEMETIC_JSON_SCHEMA.name, strict: true, schema: ANTIMEMETIC_JSON_SCHEMA.schema },
    },
    caller: 'dok4Grader.antimemetic',
    userFacing: true,
    validate: (content) => { antimemeticSchema.parse(extractJSON(content)); },
  });
  console.log(`[DOK4-Grade] Antimemetic Assessment: ${(performance.now() - t0).toFixed(0)}ms (model: ${result.model})`);

  const parsed = antimemeticSchema.parse(extractJSON(result.content));

  return {
    barrier_type: parsed.barrier_type as DOK4AntimemeticAssessment['barrier_type'],
    barrier_diagnosis: parsed.barrier_diagnosis,
    strategy: parsed.strategy,
  };
}
