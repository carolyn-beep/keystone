/**
 * DOK4 Shared Types
 *
 * Type definitions shared between client and server for DOK4 grading.
 * Status constants, criterion results, evaluation context, and grade result interfaces.
 */

import type { PreviousEvaluation } from './types/regrading';

// ─── Status Constants ────────────────────────────────────────────────────────

export const DOK4_STATUS = {
  PENDING_LINKING: 'pending_linking',
  LINKED: 'linked',
  GRADING: 'grading',
  GRADED: 'graded',
  REJECTED: 'rejected',
  ERROR: 'error',
} as const;
export type DOK4Status = typeof DOK4_STATUS[keyof typeof DOK4_STATUS];

export const DOK4_REJECTION_CATEGORY = {
  NOT_A_CLAIM: 'not_a_claim',
  DOK3_MISCLASSIFICATION: 'dok3_misclassification',
  OPINION_WITHOUT_EVIDENCE: 'opinion_without_evidence',
} as const;
export type DOK4RejectionCategory = typeof DOK4_REJECTION_CATEGORY[keyof typeof DOK4_REJECTION_CATEGORY];

export const DOK4_BARRIER_TYPE = {
  IMMUNITY: 'immunity',
  LOW_TRANSMISSION: 'low_transmission',
  HIGH_DRAG: 'high_drag',
} as const;
export type DOK4BarrierType = typeof DOK4_BARRIER_TYPE[keyof typeof DOK4_BARRIER_TYPE];


// ─── Criterion Types ─────────────────────────────────────────────────────────

export interface DOK4CriterionResult {
  assessment: 'strong' | 'partial' | 'weak';
  evidence: string;
}

export interface DOK4CriteriaBreakdown {
  S1: DOK4CriterionResult; // Contested
  S2: DOK4CriterionResult; // LLM Divergence
  S3: DOK4CriterionResult; // Grounded & Traceable
  S4: DOK4CriterionResult; // Clear Side
  S5: DOK4CriterionResult; // Cross-Domain Synthesis
  O1: DOK4CriterionResult; // Causal Reasoning
  O2: DOK4CriterionResult; // Distinct Voice
}


// ─── Antimemetic Assessment ──────────────────────────────────────────────────

export interface DOK4AntimemeticAssessment {
  barrier_type: DOK4BarrierType;
  barrier_diagnosis: string;
  strategy: string;
}


// ─── SPOV With Links (Read Model) ───────────────────────────────────────────

export interface DOK4SpovWithLinks {
  id: number;
  brainliftId: number;
  text: string;
  workflowyNodeId: string | null;
  status: DOK4Status;
  rejectionReason: string | null;
  rejectionCategory: DOK4RejectionCategory | null;
  foundationIntegrityIndex: string | null;
  dok1FoundationScore: string | null;
  dok2FoundationScore: string | null;
  dok3FoundationScore: string | null;
  foundationCeiling: number | null;
  traceabilityFlagged: boolean;
  traceabilityFlaggedSource: string | null;
  traceabilityOverlapSummary: string | null;
  divergenceQuestion: string | null;
  divergenceVanillaResponse: string | null;
  qualityScoreRaw: number | null;
  score: number | null;
  positionSummary: string | null;
  frameworkDependency: string | null;
  keyEvidence: string[] | null;
  vulnerabilityPoints: string[] | null;
  criteriaBreakdown: DOK4CriteriaBreakdown | null;
  rationale: string | null;
  feedback: string | null;
  antimemeticAssessment: DOK4AntimemeticAssessment | null;
  evaluatorModel: string | null;
  gradedAt: string | null;
  createdAt: string;
  insightRankings: Record<string, number> | null;
  linkedDok3InsightIds: number[];
  primaryDok3InsightId: number | null;
}


// ─── Grade Result (Write Model) ─────────────────────────────────────────────

export interface DOK4GradeResult {
  // Foundation
  foundationIntegrityIndex: number;
  dok1FoundationScore: number;
  dok2FoundationScore: number;
  dok3FoundationScore: number;
  foundationCeiling: number;
  // Traceability
  traceabilityFlagged: boolean;
  traceabilityFlaggedSource: string | null;
  traceabilityOverlapSummary: string | null;
  // Divergence
  divergenceQuestion: string;
  divergenceVanillaResponse: string;
  // Quality
  qualityScoreRaw: number;
  score: number;
  positionSummary: string;
  frameworkDependency: string;
  keyEvidence: string[];
  vulnerabilityPoints: string[];
  criteriaBreakdown: DOK4CriteriaBreakdown;
  rationale: string;
  feedback: string;
  // Antimemetic (null if score < 3)
  antimemeticAssessment: DOK4AntimemeticAssessment | null;
  // Metadata
  evaluatorModel: string;
}


// ─── Evaluation Context (Grading Input) ─────────────────────────────────────

export interface DOK4TraceabilityResult {
  flagged: boolean;
  flaggedSource: string | null;
  overlapSummary: string | null;
}

export interface DivergenceCheckResult {
  question: string;
  vanillaResponse: string;
}

export interface DOK4EvaluationContext {
  brainliftPurpose: string;
  spovText: string;
  primaryDok3: {
    id: number;
    text: string;
    score: number;
    frameworkName: string | null;
    frameworkDescription: string | null;
  };
  additionalDok3s: { id: number; text: string; score: number | null }[];
  linkedDok2s: {
    id: number;
    sourceName: string;
    sourceUrl: string | null;
    grade: number | null;
    points: string[];
    dok1Facts: {
      id: number;
      fact: string;
      score: number | null;
      source: string | null;
    }[];
  }[];
  sourceEvidence: {
    sourceName: string;
    sourceUrl: string | null;
    content: string | null;
  }[];
  foundationIndex: number;
  foundationCeiling: number;
  dok1FoundationScore: number;
  dok2FoundationScore: number;
  dok3FoundationScore: number;
  traceabilityResult: DOK4TraceabilityResult | null;
  divergenceResult: DivergenceCheckResult | null;
  previousEvaluation?: PreviousEvaluation;
}
