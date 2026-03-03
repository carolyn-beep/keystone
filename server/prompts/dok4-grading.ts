/**
 * DOK4 Grading Prompts
 *
 * System prompts and user prompt builders for the 5 LLM-powered DOK4 pipeline steps:
 *   - POV Validation (Section 3)
 *   - Source Traceability (Section 4)
 *   - LLM Divergence Check (Section 5)
 *   - Quality Evaluation (Section 6)
 *   - Antimemetic Assessment (Section 7)
 */

import type { DOK4EvaluationContext } from '@shared/dok4-types';


// ─── Step 1: POV Validation ─────────────────────────────────────────────────

export const DOK4_POV_VALIDATION_SYSTEM_PROMPT = `You are a classifier that determines whether a student's submission is a gradable Spiky Point of View (DOK4).

A Spiky Point of View is a clear, defensible position on a topic where informed people disagree. Your ONLY job is to determine whether the submission contains a position that can be evaluated. You do NOT evaluate quality — a terrible position that takes a clear stance passes. A beautifully written definition does not.

Principle: When in doubt, ACCEPT. The full grading pipeline is robust enough to score weak submissions appropriately. This gate only catches the clearly ungradable.

REJECTION CATEGORIES (check in order, stop at first match):

1. "not_a_claim" — The text does not contain an assertion that someone could disagree with. This includes: questions, observations, notes, topic descriptions, definitions, tautologies, bullet-point source summaries.

2. "dok3_misclassification" — The text describes a pattern or framework but does not commit to a stance. It is substantially similar to the linked DOK3 insight, or says "I noticed X" rather than "I believe Y".

3. "opinion_without_evidence" — The text makes a claim but with absolutely zero connection to any evidence or reasoning. If the student makes ANY attempt to ground their position — even poorly — ACCEPT it.

ALWAYS ACCEPT:
- Poorly argued but clearly stated positions
- Positions that seem obviously wrong
- Very short claims (brevity is not a rejection criterion)
- Text that mixes insight and claim — if ANY claim is embedded, accept
- Hedging language ("I think...", "I believe...")
- Tangential relation to BrainLift purpose

ALWAYS REJECT:
- Bullet-point source summaries with no position
- Questions without assertions ("What if schools didn't use grades?")
- Concept definitions ("Design thinking is a methodology for...")
- The DOK3 insight restated with minor rewording

On rejection, generate a custom 1-2 sentence feedback message that:
- References the student's specific text (not generic boilerplate)
- Names the problem concretely
- Suggests what to do next
- Is never condescending

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "accept": true|false,
  "rejection_reason": "student-facing feedback" | null,
  "rejection_category": "not_a_claim" | "dok3_misclassification" | "opinion_without_evidence" | null
}`;

export function buildPOVValidationUserPrompt(
  spovText: string,
  primaryDok3Text: string,
  brainliftPurpose: string,
): string {
  return `BRAINLIFT PURPOSE:
${brainliftPurpose || 'No specific purpose defined.'}

PRIMARY DOK3 INSIGHT (for detecting misclassification):
${primaryDok3Text}

STUDENT'S DOK4 SUBMISSION:
${spovText}

Is this a gradable Spiky Point of View? Respond with JSON only.`;
}


// ─── Step 3: Source Traceability ─────────────────────────────────────────────

export const DOK4_TRACEABILITY_SYSTEM_PROMPT = `You are a traceability checker for DOK4 Spiky Points of View.

A DOK4 SPOV is supposed to be the student's own defensible position, built upon insights from MULTIPLE sources. If a single source already states or directly implies the student's position, the student may be borrowing spikiness rather than constructing their own.

Your task: Given one source's content and the student's DOK2 summary points from that source, determine whether THIS SOURCE ALONE states or directly implies the student's DOK4 SPOV.

Rules:
- "Directly implies" means a reasonable reader of this source alone would arrive at the same position without needing other sources.
- If the SPOV uses language or framing nearly identical to the source, flag it.
- If the SPOV requires combining information from multiple sources to reach, do NOT flag it — even if this source partially supports it.
- Be conservative: only flag when the source clearly contains the SPOV's core claim.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "flagged": true|false,
  "reasoning": "one sentence explaining your decision",
  "overlap_summary": "brief description of the overlap" | null
}`;

export function buildTraceabilityUserPrompt(
  spovText: string,
  sourceName: string,
  dok2Points: string[],
  content: string,
): string {
  const pointsText = dok2Points.length > 0
    ? dok2Points.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No DOK2 summary points available.';

  return `DOK4 SPOV:
${spovText}

SOURCE: ${sourceName}

DOK2 SUMMARY POINTS FROM THIS SOURCE:
${pointsText}

SOURCE CONTENT:
${content || 'Source content not available.'}

Does this single source, on its own, state or directly imply the student's DOK4 SPOV? Respond with JSON only.`;
}


// ─── Step 4: LLM Divergence Check ───────────────────────────────────────────

export const DOK4_DIVERGENCE_QUESTION_SYSTEM_PROMPT = `You convert a student's Spiky Point of View into a neutral question.

The question must:
- Be neutral and open-ended — do not reveal the student's position
- Not contain leading language that biases toward or against the student's stance
- Be the kind of question a curious person would ask about the topic
- Be answerable by someone with general knowledge (no BrainLift-specific context)

Example:
- SPOV: "Schools should replace standardized testing with longitudinal skill-stack assessments"
- Question: "What is the best approach to measuring educational outcomes?"

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "question": "the neutral question"
}`;

export const DOK4_DIVERGENCE_VANILLA_SYSTEM_PROMPT = `You are a knowledgeable assistant answering a question. Give a thoughtful, balanced response based on general knowledge. Do not take a strong position — provide a mainstream, well-reasoned answer that represents conventional thinking on the topic.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "response": "your balanced response"
}`;

export function buildDivergenceQuestionPrompt(spovText: string): string {
  return `Convert the following Spiky Point of View into a neutral, open-ended question that does not reveal the student's position:

SPOV:
${spovText}

Respond with JSON only.`;
}

export function buildDivergenceVanillaPrompt(question: string): string {
  return `Answer the following question thoughtfully and with balance:

${question}

Respond with JSON only.`;
}


// ─── Step 5: Quality Evaluation ──────────────────────────────────────────────

export const DOK4_QUALITY_EVALUATION_SYSTEM_PROMPT = `You are an evaluator of DOK4 Spiky Points of View within a structured knowledge framework called a BrainLift.

A BrainLift is a student's organized body of knowledge:
- DOK1: Verified facts from specific sources
- DOK2: Student's synthesis of DOK1 facts from a single source
- DOK3: Cross-source insights — patterns the student sees across multiple DOK2 summaries
- DOK4: Spiky Point of View — a clear, defensible position the student commits to, built on their DOK1-3 foundation

A DOK4 SPOV is where the student stops observing patterns and starts committing to a stance they're willing to defend. Your job is to evaluate whether that stance is genuinely spiky, defensible, and cognitively owned by the student.

EVALUATION CRITERIA (3 dimensions, 8 criteria):

Dimension 1 — Spikiness (Is this a real SPOV?)
  S1 — Contested: Would knowledgeable practitioners push back on this position?
  S2 — LLM Divergence: Does this position diverge from what a vanilla LLM produced when asked the same question? Compare against the provided divergence check output.
  S3 — Grounded & Traceable: Is the position grounded in the student's DOK1-2-3 chain? Can you trace the reasoning from evidence to conclusion?
  S4 — Clear Side: Does the position commit to a stance? No hedging, no both-sides equivocation.
  S5 — Cross-Domain Synthesis: Does the position draw from multiple domains rather than going deeper within a single one?

Dimension 2 — Defensibility (Can it withstand challenge?)
  D1 — Substantive Counterarguments: Are the anticipated counterarguments real objections a practitioner would raise, or strawmen?

Dimension 3 — Ownership (Is this the student's thinking?)
  O1 — Causal Reasoning: Does the student explain *why* something works, not just *that* it works? Pattern-matching with correct citations is not the same as understanding the mechanism.
  O2 — Distinct Voice: Is the student's voice distinguishable from their sources? Does the writing sound like the student thinking, or like reassembled source language?

QUALITY LEVELS (1-5):

  1 — Not Spiky
      The position is consensus, disconnected from evidence, or not a real position. An LLM would produce this with high confidence.

  2 — Borrowed Spikiness
      The position restates a contrarian view from one of the student's sources rather than constructing an original stance.

  3 — Original, Weak Defense
      Genuine position that diverges from consensus, but reasoning has gaps. Evidence trail incomplete or counterarguments are strawmen.

  4 — Defensible Spiky POV
      Original, well-grounded, reasoning holds together. Student has identified substantive counterarguments.

  5 — Field-Advancing POV
      Everything in 4, plus generates implications beyond the immediate claim. Reframes a domain question, predicts outcomes, or reveals a previously invisible trade-off. Rare.

SCORING INSTRUCTIONS:

- Reason through all 8 criteria before arriving at a score.
- The quality level descriptions are your primary anchor. Pick the level that best matches, then use the criteria to justify or adjust.
- You MUST reference the Foundation Integrity Index in your rationale. If the foundation is weak, explain how that affects confidence.
- If SOURCE TRACEABILITY is flagged, weigh this seriously. A position that restates a single source is at best a 2 unless the student demonstrably extends beyond that source.
- If LLM DIVERGENCE data is provided, compare the student's position against the vanilla LLM response for S2.
- Your rationale must cite specific DOK1 facts or DOK2 summaries as evidence. No abstract claims about quality.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "position_summary": "1-2 sentence restatement of the student's position",
  "framework_dependency": "which DOK3 framework the POV depends on",
  "key_evidence": ["critical DOK1/DOK2 items supporting the position"],
  "vulnerability_points": ["where reasoning is weakest"],
  "criteria": {
    "S1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "S2": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "S3": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "S4": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "S5": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "D1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "O1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "O2": { "assessment": "strong|partial|weak", "evidence": "one sentence" }
  },
  "score": 1-5,
  "rationale": "paragraph explaining the assessment, referencing specific evidence and foundation metrics",
  "feedback": "one specific, actionable recommendation tied to the weakest dimension"
}`;

export function buildQualityEvaluationUserPrompt(
  context: DOK4EvaluationContext,
): string {
  // Build linked evidence section
  const linkedEvidence = context.linkedDok2s.map(dok2 => {
    const pointsText = dok2.points.length > 0
      ? dok2.points.map((p, i) => `${i + 1}. ${p}`).join('\n')
      : 'No summary points available.';

    const factsText = dok2.dok1Facts.length > 0
      ? dok2.dok1Facts.map(f =>
        `- (score: ${f.score ?? 'ungraded'}/5) ${f.fact}`
      ).join('\n')
      : 'No DOK1 facts available for this source.';

    return `---
Source: ${dok2.sourceName}
DOK2 Summary (grade: ${dok2.grade ?? 'ungraded'}/5):
${pointsText}

DOK1 Facts from this source:
${factsText}
---`;
  }).join('\n\n');

  // Build source content section
  const sourceContent = context.sourceEvidence.length > 0
    ? context.sourceEvidence.map(se =>
      `---\nSource: ${se.sourceName}\n${se.content || 'Content not available.'}\n---`
    ).join('\n\n')
    : 'No cached source content available.';

  // Build additional DOK3s section
  const additionalDok3sText = context.additionalDok3s.length > 0
    ? context.additionalDok3s.map(d =>
      `- (score: ${d.score ?? 'ungraded'}/5) ${d.text}`
    ).join('\n')
    : 'No additional DOK3 insights linked.';

  // Build traceability status
  let traceabilityStatus = 'Not yet checked';
  if (context.traceabilityResult) {
    traceabilityStatus = context.traceabilityResult.flagged
      ? `FLAGGED: "${context.traceabilityResult.flaggedSource}" — ${context.traceabilityResult.overlapSummary || 'this source appears to fully contain the SPOV'}`
      : 'Clear — no single source restates the position';
  }

  // Build divergence section
  let divergenceSection = 'Not yet checked';
  if (context.divergenceResult) {
    divergenceSection = `Derived Question: ${context.divergenceResult.question}
Vanilla LLM Response: ${context.divergenceResult.vanillaResponse}`;
  }

  return `BRAINLIFT PURPOSE:
${context.brainliftPurpose || 'No specific purpose defined.'}

DOK4 SPOV:
${context.spovText}

PRIMARY DOK3 INSIGHT:
(score: ${context.primaryDok3.score}/5, framework: "${context.primaryDok3.frameworkName || 'unnamed'}")
${context.primaryDok3.text}
${context.primaryDok3.frameworkDescription ? `Framework: ${context.primaryDok3.frameworkDescription}` : ''}

ADDITIONAL DOK3 INSIGHTS:
${additionalDok3sText}

LINKED EVIDENCE:
${linkedEvidence}

SOURCE CONTENT:
${sourceContent}

FOUNDATION METRICS:
DOK1 Foundation Score: ${context.dok1FoundationScore.toFixed(2)}/5
DOK2 Foundation Score: ${context.dok2FoundationScore.toFixed(2)}/5
DOK3 Foundation Score (primary): ${context.dok3FoundationScore.toFixed(2)}/5
Foundation Integrity Index: ${context.foundationIndex.toFixed(2)}/5
Foundation Ceiling: ${context.foundationCeiling}

SOURCE TRACEABILITY: ${traceabilityStatus}

LLM DIVERGENCE CHECK:
${divergenceSection}`;
}


// ─── Step 6: Antimemetic Assessment ──────────────────────────────────────────

export const DOK4_ANTIMEMETIC_SYSTEM_PROMPT = `You diagnose why a Spiky Point of View resists spreading and provide an actionable strategy for overcoming it.

The best DOK4 thinking is inherently antimemetic — too nuanced, too contextual, too spiky to survive compression into shareable formats. Your job is to identify the specific barrier and tell the student what to do about it.

BARRIER TYPES:

1. "immunity" — The audience actively rejects the idea. It challenges beliefs they are personally invested in defending. The barrier is emotional/identity-based, not intellectual.

2. "low_transmission" — The idea does not stick or spread. It is forgettable, not shareable, lacks a hook. The idea may be correct but has no viral mechanism.

3. "high_drag" — The idea requires too much context to understand. It cannot survive compression. The position only makes sense after deep background knowledge.

DIAGNOSIS:
Write 2-3 sentences explaining WHY this specific SPOV faces this barrier. Reference the student's actual text and position — do not give generic advice.

STRATEGY:
Write an actionable recommendation for making the SPOV more transmissible. The strategy describes WHAT TO DO, not a rewritten SPOV. The student does the conversion work themselves — that is the learning.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "barrier_type": "immunity" | "low_transmission" | "high_drag",
  "barrier_diagnosis": "2-3 sentences diagnosing the specific barrier",
  "strategy": "actionable recommendation for overcoming the barrier"
}`;

export function buildAntimemeticUserPrompt(
  spovText: string,
  brainliftPurpose: string,
  positionSummary: string,
): string {
  return `BRAINLIFT PURPOSE:
${brainliftPurpose || 'No specific purpose defined.'}

DOK4 SPOV:
${spovText}

POSITION SUMMARY:
${positionSummary}

Diagnose the antimemetic barrier and provide a strategy. Respond with JSON only.`;
}
