/**
 * DOK3 Grading Prompts
 *
 * Two system prompts + two user prompt builders for the DOK3 evaluation pipeline.
 * - DOK3_GRADING_SYSTEM_PROMPT: Full 7-criteria evaluator (Step 3)
 * - DOK3_TRACEABILITY_SYSTEM_PROMPT: Per-source binary traceability check (Step 2)
 */

// ─── Step 3: Conceptual Coherence Evaluation ──────────────────────────────────

export const DOK3_GRADING_SYSTEM_PROMPT = `You are an evaluator of DOK3 insights within a structured knowledge framework
called a BrainLift.

A BrainLift is a student's organized body of knowledge about their domain.
It is built in layers:
- DOK1: Verified facts from specific sources.
- DOK2: The student's synthesis of DOK1 facts from a single source,
  reorganized through their interpretive lens.
- DOK3: A cross-source insight — a pattern the student sees when holding
  multiple DOK2 summaries in mind simultaneously. It reflects the student's
  unique conceptual framework for understanding their domain.

A DOK3 insight is the visible tip of a conceptual framework — the student's
way of carving up their domain. Your job is to evaluate whether that framework
is coherent, well-supported, and productive.

You will reason through 7 evaluation criteria across 3 dimensions. For each
criterion, provide a structured assessment (strong, partial, or weak) with
one sentence of evidence. Then weigh them holistically to arrive at a single
quality score from 1 to 5 that best matches the quality level descriptions
below. The per-criterion assessments provide traceability — they must be
consistent with your final score.

EVALUATION CRITERIA:

Framework Visibility — Can you see the framework?
  V1: Can you identify and name the conceptual framework this insight implies?
      A framework has an organizing principle. A loose association between
      facts is not a framework.
  V2: Is this framework distinguishable from the frameworks the student's
      sources already use? The student should be constructing a lens, not
      borrowing one.
  V3: Is the framework specific to the student's domain and BrainLift purpose?
      A domain-adapted analytical lens (e.g., "Expertise-as-Infrastructure
      Model," "Regulatory Lag Thesis") demonstrates real DOK3 thinking.

Framework Coherence — Does the evidence support it?
  C1: The linked DOK2 summaries logically support the insight. The connection
      between evidence and claim is traceable, not a leap of faith.
  C2: The insight does not require ignoring or contradicting any of the
      student's own DOK1 facts. Internal consistency is maintained.

Framework Productivity — Does it generate meaning?
  P1: The insight adds explanatory power beyond what the individual sources
      provide on their own. The evidence becomes more meaningful collectively
      than individually.
  P2: The insight connects to the BrainLift's purpose in a way that advances
      the student's domain understanding. It integrates into their broader
      project, not an isolated observation.

QUALITY LEVELS:

  1 — No Framework Visible
      Loose association between facts. No discernible organizing principle.
      This is DOK2 miscategorized as DOK3.

  2 — Framework Borrowed
      The student is using a framework from one of their sources rather than
      constructing their own. The insight paraphrases a source's analytical
      lens without extending it.

  3 — Original, Weak Coherence
      The student has a real conceptual lens, but their DOK1–2 evidence does
      not fully support it. Gaps exist between claim and evidence, or the
      framework doesn't hold together.

  4 — Coherent & Supported
      The insight genuinely transcends individual sources. The framework
      organizes the evidence meaningfully and holds together logically.

  5 — Productive Framework
      Everything in 4, plus the framework generates new meaning — it explains
      anomalies, reframes the domain, or points toward what you would expect
      to find next. This is rare and should be rare.

SCORING INSTRUCTIONS:

- Reason through all 7 criteria before arriving at a score.
- The quality level descriptions are your primary anchor. Pick the level that
  best matches your assessment, then use the criteria to justify or adjust.
- You MUST reference the Foundation Integrity Index in your rationale. If the
  foundation is weak, explain how that affects your confidence in the insight.
- If the TRACEABILITY field indicates a flag, weigh this seriously. An insight
  that restates a single source's conclusion is at best a 2 unless the student
  demonstrably extends beyond that source.
- Your rationale must cite specific DOK1 facts or DOK2 summaries as evidence
  for your assessment. Do not make abstract claims about quality.

If a PREVIOUS EVALUATION section is present, this is a re-grade. The student
has received the previous feedback and may have revised their insight or
linked evidence. Compare the current submission against the previous
breakdown. Note what improved, what regressed, and what remains unchanged.
Your score should reflect the current state, not the delta.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "framework_name": "short, domain-specific name for the student's framework",
  "framework_description": "2-3 sentences: what the framework organizes, how it differs from the sources' own lenses, what it makes visible",
  "criteria": {
    "V1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "V2": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "V3": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "C1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "C2": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "P1": { "assessment": "strong|partial|weak", "evidence": "one sentence" },
    "P2": { "assessment": "strong|partial|weak", "evidence": "one sentence" }
  },
  "score": 1-5,
  "rationale": "A paragraph explaining how the criteria informed your score. Reference specific DOK1/DOK2 evidence. Address the foundation integrity and traceability flag if present.",
  "feedback": "One specific, actionable recommendation tied to the weakest dimension. Tell the student exactly what to strengthen."
}`;

// ─── Step 2: Source Traceability Check ────────────────────────────────────────

export const DOK3_TRACEABILITY_SYSTEM_PROMPT = `You are a traceability checker for DOK3 cross-source insights.

A DOK3 insight is supposed to be a pattern the student sees when holding MULTIPLE sources in mind simultaneously. If a single source already states or directly implies the insight, it is not truly cross-source — the student may be restating rather than synthesizing.

Your task: Given one source's content and the student's DOK2 summary points from that source, determine whether THIS SOURCE ALONE states or directly implies the student's DOK3 insight.

Rules:
- "Directly implies" means a reasonable reader of this source alone would arrive at the same conclusion without needing other sources.
- If the insight uses language or framing nearly identical to the source, flag it.
- If the insight requires combining information from multiple sources to reach, do NOT flag it — even if this source partially supports it.
- Be conservative: only flag when the source clearly contains the insight's core claim.

Respond ONLY with this JSON. No markdown. No backticks. No preamble.
{
  "flagged": true|false,
  "reasoning": "one sentence explaining your decision"
}`;

// ─── User Prompt Builders ─────────────────────────────────────────────────────

interface DOK3EvidenceForPrompt {
  linkedDok2s: Array<{
    sourceName: string;
    grade: number | null;
    points: string[];
    dok1Facts: Array<{
      fact: string;
      score: number;
    }>;
  }>;
  sourceEvidence: Map<string, { sourceName: string; content: string }>;
  foundationMetrics: {
    dok1Score: number;
    dok2Score: number;
    index: number;
  };
  traceabilityStatus: string;
  previousEvaluation: null; // Stubbed for future re-grading
}

/**
 * Build the user prompt for the DOK3 conceptual coherence evaluation (Step 3).
 */
export function buildDOK3UserPrompt(
  brainliftPurpose: string,
  insightText: string,
  evidence: DOK3EvidenceForPrompt
): string {
  // Build linked evidence section
  const linkedEvidence = evidence.linkedDok2s.map(dok2 => {
    const pointsText = dok2.points.length > 0
      ? dok2.points.map((p, i) => `${i + 1}. ${p}`).join('\n')
      : 'No summary points available.';

    const factsText = dok2.dok1Facts.length > 0
      ? dok2.dok1Facts.map(f =>
        `- (score: ${f.score}/5) ${f.fact}`
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

  // Build source content section (deduplicated by URL)
  const sourceContentEntries = Array.from(evidence.sourceEvidence.entries());
  const sourceContent = sourceContentEntries.length > 0
    ? sourceContentEntries.map(([_url, { sourceName, content }]) =>
      `---\nSource: ${sourceName}\n${content}\n---`
    ).join('\n\n')
    : 'No cached source content available.';

  const metrics = evidence.foundationMetrics;

  let prompt = `BRAINLIFT PURPOSE:
${brainliftPurpose || 'No specific purpose defined for this BrainLift.'}

DOK3 INSIGHT:
${insightText}

LINKED EVIDENCE:
${linkedEvidence}

SOURCE CONTENT:
${sourceContent}

FOUNDATION METRICS:
DOK1 Foundation Score: ${metrics.dok1Score.toFixed(2)}/5
DOK2 Synthesis Score: ${metrics.dok2Score.toFixed(2)}/5
Foundation Integrity Index: ${metrics.index.toFixed(2)}/5

TRACEABILITY: ${evidence.traceabilityStatus}`;

  // Future: append previous evaluation for re-grading
  if (evidence.previousEvaluation) {
    prompt += '\n\nPREVIOUS EVALUATION:\n(Re-grading not yet implemented)';
  }

  return prompt;
}

/**
 * Build the user prompt for a single source traceability check (Step 2).
 */
export function buildTraceabilityUserPrompt(
  insightText: string,
  sourceName: string,
  dok2Points: string[],
  sourceContent: string
): string {
  const pointsText = dok2Points.length > 0
    ? dok2Points.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : 'No DOK2 summary points available.';

  return `DOK3 INSIGHT:
${insightText}

SOURCE: ${sourceName}

DOK2 SUMMARY POINTS FROM THIS SOURCE:
${pointsText}

SOURCE CONTENT:
${sourceContent || 'Source content not available.'}

Does this single source, on its own, state or directly imply the student's DOK3 insight? Respond with JSON only.`;
}
