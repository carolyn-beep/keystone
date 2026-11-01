/**
 * Skill quality review — shared types and the chat-facing formatter.
 *
 * The lint in chat-skill-draft.ts checks shape. This review checks whether the
 * skill is likely to work:
 *
 *   1. Trigger test: would the skill router pick this skill for messages it
 *      should handle, and leave it alone for messages it should not? The test
 *      utterances are generated from the BODY (what the skill does), never from
 *      the description, so the description has to earn its selections.
 *   2. Tool check: every tool-like name the body mentions exists in the chat
 *      runtime. A procedure built on a tool that does not exist cannot run.
 *   3. Critique: a strong model scores five dimensions with quoted evidence,
 *      names the fixes, and gives a verdict.
 *
 * Reference sites:
 *   - server:   server/ai/skills/review-skill-draft.ts
 *   - REST:     POST /api/skills/review-draft (admin), server/routes/skills.ts
 *   - tool:     review_skill_draft, server/ai/chat/tools/load-skill.ts
 *   - card:     client/src/components/chat/SkillQualityReviewSection.tsx
 */

import { z } from 'zod';

export const SKILL_REVIEW_DIMENSIONS = [
  'Trigger clarity',
  'Procedure executability',
  'Output specificity',
  'Grounding and honesty',
  'Student ownership',
] as const;

export type SkillReviewDimension = (typeof SKILL_REVIEW_DIMENSIONS)[number];

export const skillReviewVerdictSchema = z.enum(['ready', 'needs-work', 'rethink']);
export type SkillReviewVerdict = z.infer<typeof skillReviewVerdictSchema>;

export const skillTriggerCaseSchema = z.object({
  utterance: z.string(),
  /** 'fire' = the skill should be selected; 'skip' = it should not. */
  expected: z.enum(['fire', 'skip']),
  /** Why a 'skip' case should not fire (another skill, or out of scope). Empty for 'fire'. */
  reason: z.string(),
  /** Skill the router picked, or null for "no skill". */
  selected: z.string().nullable(),
  pass: z.boolean(),
});
export type SkillTriggerCase = z.infer<typeof skillTriggerCaseSchema>;

export const skillCritiqueSchema = z.object({
  scores: z.array(z.object({
    dimension: z.enum(SKILL_REVIEW_DIMENSIONS),
    score: z.number().int().min(1).max(5),
    evidence: z.string(),
  })).length(SKILL_REVIEW_DIMENSIONS.length),
  topFixes: z.array(z.string()).max(3),
  verdict: skillReviewVerdictSchema,
  firstFix: z.string(),
});
export type SkillCritique = z.infer<typeof skillCritiqueSchema>;

export const skillQualityReviewSchema = z.object({
  triggerTest: z.object({
    cases: z.array(skillTriggerCaseSchema),
    positives: z.number().int(),
    fired: z.number().int(),
    negatives: z.number().int(),
    falseFires: z.number().int(),
  }),
  toolCheck: z.object({
    referenced: z.array(z.string()),
    unknown: z.array(z.string()),
  }),
  critique: skillCritiqueSchema,
  models: z.object({
    trigger: z.string(),
    critique: z.string(),
  }),
  costUsd: z.number().optional(),
  durationMs: z.number().int(),
});
export type SkillQualityReview = z.infer<typeof skillQualityReviewSchema>;

export const SKILL_REVIEW_VERDICT_LABEL: Record<SkillReviewVerdict, string> = {
  ready: 'Ready to publish',
  'needs-work': 'Needs work',
  rethink: 'Rethink the approach',
};

/**
 * Plain-text version of a review, sent back into the chat so the drafting
 * model revises against it. Also what the review_skill_draft tool returns.
 */
export function formatSkillQualityReviewForChat(review: SkillQualityReview): string {
  const lines: string[] = [];
  const { triggerTest, toolCheck, critique } = review;

  lines.push(`Quality review verdict: ${SKILL_REVIEW_VERDICT_LABEL[critique.verdict]}.`);
  lines.push('');
  lines.push(`Trigger test: fired on ${triggerTest.fired} of ${triggerTest.positives} messages it should handle; ${triggerTest.falseFires} of ${triggerTest.negatives} false fires.`);
  triggerTest.cases.filter((testCase) => !testCase.pass).forEach((testCase) => {
    const outcome = testCase.expected === 'fire'
      ? `did not fire (router chose ${testCase.selected ?? 'no skill'})`
      : `fired but should not have (${testCase.reason})`;
    lines.push(`- "${testCase.utterance}" → ${outcome}`);
  });
  lines.push('');
  if (toolCheck.unknown.length > 0) {
    lines.push(`Unknown tools referenced (not in the chat runtime): ${toolCheck.unknown.join(', ')}.`);
  } else {
    lines.push('Tool check: every referenced tool exists.');
  }
  lines.push('');
  lines.push('Scores (1-5):');
  critique.scores.forEach((score) => {
    lines.push(`- ${score.dimension}: ${score.score}. ${score.evidence}`);
  });
  if (critique.topFixes.length > 0) {
    lines.push('');
    lines.push('Fixes, in order:');
    critique.topFixes.forEach((fix, index) => lines.push(`${index + 1}. ${fix}`));
  }
  lines.push('');
  lines.push(`Fix first: ${critique.firstFix}`);
  return lines.join('\n');
}
