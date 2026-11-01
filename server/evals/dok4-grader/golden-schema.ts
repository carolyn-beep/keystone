/**
 * Schema for the DOK4 grader golden set (golden.json).
 *
 * Each case is a complete, self-contained evaluation context (the same shape
 * storage.getSpovEvaluationContext builds from the database) plus the grade a
 * careful human reader expects. The eval runner grades every case with the
 * live pipeline and reports how many land inside their expected band.
 *
 * Expected bands are deliberately a range, not a point: the rubric has five
 * levels and the grader is allowed one level of judgement. A case fails when
 * the grader rejects what should be accepted (or vice versa) or lands outside
 * the band after the foundation ceiling is applied.
 */

import { z } from 'zod';

const criterionKey = z.enum(['S1', 'S4', 'P1', 'S2', 'S3', 'O2']);

export const goldenCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'id must be kebab-case'),
  /** What this case is probing in the rubric, in one line. */
  probe: z.string().min(1),
  brainliftPurpose: z.string().min(1),
  spovText: z.string().min(1),
  primaryDok3: z.object({
    text: z.string().min(1),
    score: z.number().int().min(1).max(5),
    frameworkName: z.string().nullable(),
    frameworkDescription: z.string().nullable(),
  }),
  additionalDok3s: z.array(z.object({
    text: z.string().min(1),
    score: z.number().int().min(1).max(5).nullable(),
  })).default([]),
  linkedDok2s: z.array(z.object({
    sourceName: z.string().min(1),
    sourceUrl: z.string().nullable().default(null),
    grade: z.number().int().min(1).max(5).nullable(),
    points: z.array(z.string().min(1)),
    dok1Facts: z.array(z.object({
      fact: z.string().min(1),
      score: z.number().int().min(1).max(5).nullable(),
    })),
    /** Cached source text shown to the grader for traceability. */
    content: z.string().nullable().default(null),
  })).min(1),
  expected: z.object({
    /** false = the POV gate should reject this submission outright. */
    accept: z.boolean(),
    /** Inclusive band for the final (ceiling-applied) score. Required when accept is true. */
    minScore: z.number().int().min(1).max(5).optional(),
    maxScore: z.number().int().min(1).max(5).optional(),
    /** Criteria a human would mark weak or partial. Reported, not scored. */
    weakCriteria: z.array(criterionKey).default([]),
    /** Why a human lands here, so a failing case can be argued with. */
    rationale: z.string().min(1),
  }).refine(
    (e) => !e.accept || (e.minScore !== undefined && e.maxScore !== undefined && e.minScore <= e.maxScore),
    { message: 'accepted cases need minScore <= maxScore' },
  ),
});

export const goldenSetSchema = z.object({
  version: z.number().int().min(1),
  /** Rubric revision the expectations were written against. */
  rubric: z.string().min(1),
  cases: z.array(goldenCaseSchema).min(1),
}).refine(
  (set) => new Set(set.cases.map((c) => c.id)).size === set.cases.length,
  { message: 'case ids must be unique' },
);

export type GoldenCase = z.infer<typeof goldenCaseSchema>;
export type GoldenSet = z.infer<typeof goldenSetSchema>;
export type CriterionKey = z.infer<typeof criterionKey>;
