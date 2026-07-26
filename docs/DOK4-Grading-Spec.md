# DOK4 Grading Specification — V1

## Section 1 — Pipeline Overview

DOK4 grading evaluates Spiky Points of View (SPOVs) — clear, defensible positions on topics where informed people disagree. A DOK4 is where the student stops observing patterns (DOK3) and starts committing to a stance they're willing to defend.

The pipeline has 6 sequential steps:

| Step | Type | What It Does |
|------|------|-------------|
| 1. POV Validation | LLM classifier (mid-tier) | Gate. Rejects structurally ungradable submissions before the pipeline spends tokens. Produces student-facing feedback explaining why. |
| 2. Foundation Integrity | Math (no LLM) | Computes a weighted index from linked DOK1/DOK2/DOK3 scores. Sets a ceiling on the maximum achievable DOK4 score. |
| 3. Source Traceability | LLM check (mid-tier) | Detects if the SPOV restates a single source's position. Borrowed spikiness is not the student's own. |
| 4. LLM Divergence Check | LLM call (mid-tier) | Converts the SPOV into a question, sends it to a vanilla LLM with no context, stores the response for the Quality Evaluator to compare against. |
| 5. Quality Evaluation | LLM evaluation (quality-tier) | The core grading step. Evaluates spikiness and cognitive ownership in a single call. Receives traceability + divergence results. Produces a 1-5 score. |
| 6. Antimemetic Assessment | LLM evaluation (quality-tier) | Gated behind Quality Score >= 3. Diagnoses why the SPOV resists spreading and provides an actionable strategy for transmission. No score — qualitative only. |

### Changelog from Original Spec (v6.0)

> **COE merged into Quality Evaluation.** The original spec runs a separate Cognitive Ownership Evaluation — 3 quality-tier models from different families, 19 binary criteria, 4 axes — all to produce a +/-1 adjustment to the Quality Score. Three expensive LLM calls to move a score by one point. Most of those 19 criteria already overlap with what the Quality Evaluation checks (grounding, traceability, evidence chain quality). Evaluating them separately forces two LLM calls to reason about the same evidence independently, producing disjointed assessments. V1 folds the essential ownership signals into the Quality Evaluation as a second dimension, so the model reasons about spikiness and ownership together in one pass — producing a more coherent score from a unified view of the artifact.
>
> **AI Detection (Pangram) removed.** Not in the DOK1-3 pipeline, not shipping in V1.
>
> **Adversary Defense removed.** Deferred feature. All hooks and integration points stripped from this spec.
>
> **Antimemetic Conversion replaced with Antimemetic Assessment.** The original asked the student to submit a "converted form" of their SPOV, but never specified when the student would be prompted, what the UX flow looked like, or how this fit into the existing Keystone Document workflow. V1 drops the student submission loop entirely. Instead, the system evaluates the SPOV's viral potential automatically and generates a concrete "want to make this spread? try this" suggestion the student can act on.

### Foundation Integrity Index

Weighted composite of the student's underlying knowledge quality:

- **DOK1 component (25%):** Mean of deduplicated DOK1 fact verification scores linked through DOK2 summaries.
- **DOK2 component (35%):** Mean of linked DOK2 summary grades.
- **DOK3 component (40%):** Score of the primary linked DOK3 insight (not the highest among all linked insights).

**Formula:** `Foundation Index = (DOK1 mean x 0.25) + (DOK2 mean x 0.35) + (primary DOK3 score x 0.40)`

### Score Ceiling

The Foundation Index caps the maximum achievable Quality Score:

| Foundation Index | Ceiling | Effect |
|-----------------|---------|--------|
| >= 4.0 | No ceiling | Full scoring range available |
| >= 3.0 and < 4.0 | Cap at 4 | Top score locked out |
| >= 2.0 and < 3.0 | Cap at 3 | Score capped at midpoint |
| < 2.0 | Cap at 2 | Weak foundation, heavily penalized |

The final Quality Score is: `min(raw_llm_score, ceiling)`.

### Prerequisites

See Section 2 for full linking requirements. Grading does not begin until all linked DOK1, DOK2, and DOK3 items have been graded. Follows the same gate-polling pattern as DOK3 grading (see `server/jobs/dok3GradeJob.ts`).

---

## Section 2 — Linking and Primary DOK3 Designation

A DOK4 SPOV must link to:
- **At least one DOK3 insight**, designated as primary — the cross-domain framework the POV is built within
- **At least two DOK2 summaries** from different sources
- **DOK1 facts** are inherited automatically through DOK2 links

### Primary DOK3

Exactly one linked DOK3 must be the **primary**. This is the framework the SPOV depends on — the cross-domain conceptual lens within which the student takes their position.

The agent designates the primary DOK3 automatically based on semantic analysis of the SPOV text and linked DOK3 insights. The student does not choose during submission.

**Why primary designation matters:**
- The primary DOK3's score feeds the Foundation Integrity Index at 40% weight — not the highest score among all linked DOK3s
- The Quality Evaluator identifies the primary DOK3 as the framework the POV depends on; additional linked DOK3s are provided as supporting context
- Without primary designation, students could attach a high-scoring but tangentially related DOK3 to inflate the Foundation Index

### Re-linking

After grading, the student can claim different DOK3 links or change the primary designation. Any link change triggers re-grading of that specific SPOV — Foundation Integrity is recomputed, ceiling recalculated, and Quality Evaluation re-runs with the updated evidence chain.

> **Changelog:** The original spec had a smart agent that proposes primary designation and collaborates with the student when linking is ambiguous. V1 simplifies: the agent picks automatically, the student can override post-grading, and overrides trigger re-grading. No interactive collaboration step during submission.

---

## Section 3 — POV Validation Classifier

A lightweight gate that runs before the pipeline spends tokens on grading. Its only job: determine whether the submission is a gradable SPOV. It does not evaluate quality — a terrible SPOV that takes a clear position passes. A beautifully written definition does not.

**Principle:** When in doubt, accept. The full pipeline is robust enough to score weak submissions appropriately. This gate only catches the clearly ungradable.

### Model

Mid-tier (Gemini Flash primary, Sonnet fallback). Target latency < 3 seconds. Temperature 0.0.

### Input

The classifier receives:
- **DOK4 text** — the student's submission (primary input)
- **Primary DOK3 text** — for detecting DOK3 misclassification
- **Keystone Document purpose** — for context

### Rejection Categories

Three categories. Checked in this order, stop at first match:

| Category | What It Catches | When to Reject |
|----------|----------------|----------------|
| `not_a_claim` | Questions, observations, notes, topic descriptions, definitions, tautologies — anything where there is no position to evaluate | The text does not contain an assertion that someone could disagree with |
| `dok3_misclassification` | Text that describes a pattern or framework but does not commit to a stance | The DOK4 text is substantially similar to the linked DOK3 insight, or says "I noticed X" rather than "I believe Y" |
| `opinion_without_evidence` | Bare assertion with zero connection to any evidence or reasoning | The text makes a claim but with absolutely no supporting argument. If the student makes ANY attempt to ground their position — even poorly — accept it |

> **Changelog:** Original spec had 6 categories: `tautology`, `definition`, `unfalsifiable`, `opinion_without_evidence`, `dok3_misclassification`, `not_a_claim`. Reduced to 3. `tautology` and `definition` are folded into `not_a_claim` — they're all the same root problem (no position to evaluate), and since feedback is LLM-generated per submission, the model can still explain *why* it's not a claim without needing a separate category code. `unfalsifiable` is dropped entirely — it's a philosophical judgment that mid-tier models will get wrong on edge cases, and the full pipeline handles weak claims fine. Three categories cover every structural failure that matters; the rest was taxonomy for taxonomy's sake.

### Feedback Generation

On rejection, the classifier generates a custom 1-2 sentence feedback message as part of the same LLM call. The message must:
- Reference the student's specific text (not generic boilerplate)
- Name the problem concretely
- Suggest what to do next
- Never be condescending

Examples of the tone:
- *"Your text describes how educational metrics undervalue compound skills — that's a pattern you've noticed (DOK3). To make it a Spiky POV, commit to a position: what should change because of this pattern, and why?"*
- *"This reads as a definition of design thinking. What do you believe about design thinking that practitioners in your field would push back on?"*

### Output

```
{
  accept: true | false,
  rejection_reason: string | null,    // LLM-generated, student-facing
  rejection_category: "not_a_claim" | "dok3_misclassification" | "opinion_without_evidence" | null
}
```

On accept, `rejection_reason` and `rejection_category` are null.

### Boundary Rules

**Always accept:**
- Poorly argued but clearly stated positions
- Positions that seem obviously wrong
- Very short claims (brevity is not a rejection criterion)
- Text that mixes insight and claim — if ANY claim is embedded, accept
- Hedging language ("I think...", "I believe...")
- Tangential relation to Keystone Document purpose (the full pipeline evaluates purpose alignment)

**Always reject:**
- Bullet-point source summaries with no position
- Questions without assertions ("What if schools didn't use grades?")
- Concept definitions ("Design thinking is a methodology for...")
- The DOK3 insight restated with minor rewording

---

## Section 4 — Source Traceability

Same pattern as DOK3 (see `server/ai/dok3Grader.ts`, `checkSourceTraceability`). Per-source parallel LLM calls on a mid-tier model asking: "Does this single source, on its own, already state or directly imply the student's SPOV?"

If any source is flagged, the traceability result is passed to the Quality Evaluation (Section 6). The grader sees the flag and weighs it into its score — borrowed spikiness cannot score well. No separate score cap or auto-fail mechanism; the Quality Evaluator handles it holistically, as it has been proved to work with DOK3 very well.

---

## Section 5 — LLM Divergence Check

A mid-tier LLM call that produces a baseline for the S2 (LLM Divergence) criterion. Runs before Quality Evaluation so the grader has concrete data to compare against.

**Process:**
1. Convert the student's SPOV into a neutral question (e.g., "Schools should replace standardized testing with longitudinal skill-stack assessments" → "What is the best approach to measuring educational outcomes?")
2. Send that question to a vanilla mid-tier LLM with zero Keystone Document context — just the question, no student evidence, no DOK chain. The LLM is instructed to commit to a clear position in 2-3 sentences, mirroring the format of a SPOV. This makes the comparison fair: two concise stances side by side, not a student's one-liner against a long balanced essay.
3. Store the generated question and the vanilla response.

**Output passed to Quality Evaluation:**
- The generated question
- The vanilla LLM's position (2-3 sentences)

The Quality Evaluator receives both and judges divergence itself in context of the full artifact. No pre-classification (agree/disagree) — the grader makes that call holistically.

**Model:** Mid-tier (Gemini Flash primary, Sonnet fallback). Temperature 0.3 (slightly creative to produce a natural baseline response).

---

## Section 6 — Quality Evaluation

The core grading step. A single quality-tier LLM call that evaluates the SPOV across 2 dimensions and 7 criteria, producing a 1-5 score.

### Input Context

The evaluator receives everything:
- Keystone Document purpose
- DOK4 SPOV text
- Primary DOK3 insight (text, score, framework name/description)
- Additional linked DOK3 insights (as supporting context)
- Linked DOK2 summaries with their DOK1 facts
- Foundation Integrity Index with component scores and ceiling
- Source Traceability result (clear/flagged, with overlap summary if flagged)
- S2 Divergence Check output (generated question + vanilla LLM response)

### Evaluation Criteria

**Dimension 1 — Spikiness** (Is this a real SPOV?)

| Criterion | What It Checks |
|-----------|---------------|
| S1 — Contested | Would knowledgeable practitioners push back on this position? |
| S2 — LLM Divergence | Does this position diverge from what the vanilla LLM produced when asked the same question? (Evaluator compares against the S2 check output) |
| S3 — Grounded & Traceable | Is the position grounded in the student's DOK1-2-3 chain? Can you trace the reasoning from evidence to conclusion? |
| S4 — Clear Side | Does the position commit to a stance? No hedging, no both-sides equivocation. |
| S5 — Cross-Domain Synthesis | Does the position draw from multiple domains rather than going deeper within a single one? |

**Dimension 2 — Ownership** (Is this the student's thinking?)

| Criterion | What It Checks |
|-----------|---------------|
| O1 — Causal Reasoning | Does the student explain *why* something works, not just *that* it works? Pattern-matching with correct citations is not the same as understanding the mechanism. |
| O2 — Distinct Voice | Is the student's voice distinguishable from their sources? Does the writing sound like the student thinking, or like reassembled source language? |

> **Changelog:** The original spec evaluates ownership via a separate Cognitive Ownership Evaluation — a 3-model jury (19 criteria, 4 axes) that runs after the Quality Score and produces a +/-1 adjustment. V1 reduces this to 2 criteria (O1, O2) folded directly into the Quality Evaluation. Ownership is now *more* influential than before — it's a first-class dimension that shapes the score from the start, not an afterthought adjustment of +/-1 applied post-hoc. The model reasons about ownership alongside spikiness, so ownership gaps directly pull the score down rather than being a separate pass that nudges it by one point. Of the original 17 COE criteria not carried forward: 10 were redundant with S1-S5, 5 belonged to the dropped epistemic honesty axis, and 2 were edge cases absorbed by O1. No auto-fail conditions — the original had 3 (AI detection, borrowed+not-divergent, no evidence). All removed; the grader scores holistically and will naturally score a 1 when warranted.
>
> **Defensibility (D1) deferred to Competitive Stack.** The original spec included a Defensibility dimension (D1 — Substantive Counterarguments) asking whether the student anticipated real objections. This is the wrong place to evaluate it. Counterargument development happens during the BrainMaxxing curation process — the Socratic interrogation loop where students stress-test their SPOVs against AI challenges. The grading pipeline evaluates the SPOV as submitted; the Competitive Stack evaluates how well the student defends it under pressure. Folding both into one score conflates the artifact with the process.

### Quality Levels (1-5)

| Score | Label | Description |
|-------|-------|-------------|
| 1 | Not Spiky | The position is consensus, disconnected from evidence, or not a real position. An LLM would produce this with high confidence. |
| 2 | Borrowed Spikiness | The position restates a contrarian view from one of the student's sources rather than constructing an original stance. |
| 3 | Original, Shallow Reasoning | Genuine position that diverges from consensus, but reasoning has gaps. Evidence trail is incomplete or the student asserts without explaining the causal mechanism. |
| 4 | Well-Grounded Spiky POV | Original, well-grounded, evidence trail is complete and traceable. Student demonstrates causal reasoning — explains *why*, not just *what* — and writes in a distinct voice. |
| 5 | Field-Advancing POV | Everything in 4, plus generates implications beyond the immediate claim. Reframes a domain question, predicts outcomes, or reveals a previously invisible trade-off. Rare. |

### Output

Each criterion is assessed as `strong`, `partial`, or `weak` with one sentence of evidence (same pattern as DOK3 coherence evaluation in `server/prompts/dok3-grading.ts`).

```
{
  position_summary: string,           // 1-2 sentence restatement
  framework_dependency: string,       // which DOK3 framework the POV depends on
  key_evidence: string[],             // critical DOK1/DOK2 items
  vulnerability_points: string[],     // where reasoning is weakest
  criteria: {
    S1-S5, O1, O2: { assessment: "strong" | "partial" | "weak", evidence: string }
  },
  score: 1-5,
  rationale: string,                  // paragraph explaining the assessment
  feedback: string                    // one specific, actionable recommendation
}
```

### Final Score

`final_score = min(raw_llm_score, foundation_ceiling)`

**Model:** Quality-tier (Opus 4.6 primary, Sonnet 4.5 fallback). Temperature 0.1.

---

## Section 7 — Antimemetic Assessment

The best DOK4 thinking is inherently antimemetic — too nuanced, too contextual, too spiky to survive compression into shareable formats. This step diagnoses *why* a SPOV resists spreading and tells the student what to do about it.

### Gate

Only runs when the DOK4's final Quality Score is >= 3. Below that, the student needs to strengthen the position itself before worrying about transmission. Same reasoning as the original spec: a weak position made viral is disinformation.

### What It Does

A single quality-tier LLM call that:
1. Diagnoses the specific transmission barrier
2. Provides an actionable strategy for overcoming it

No score is produced. This is qualitative — an assessment and a recommendation.

### Barrier Types

The assessment classifies the SPOV's antimemetic resistance into one of three types:

| Barrier | What It Means | Example |
|---------|--------------|---------|
| Immunity | The audience actively rejects the idea — it challenges beliefs they're invested in | "Schools should eliminate grades entirely" triggers defensive rejection from parents and administrators |
| Low Transmission | The idea doesn't stick or spread — it's forgettable, not shareable, lacks a hook | A technically correct but dry position that no one would repeat to a colleague |
| High Drag | The idea requires too much context to understand — it can't survive compression | A position that only makes sense after reading 5 sources on compound skill measurement theory |

### Output

```
{
  barrier_type: "immunity" | "low_transmission" | "high_drag",
  barrier_diagnosis: string,        // 2-3 sentences: why this specific SPOV resists spreading
  strategy: string                  // actionable recommendation for making it more transmissible
}
```

The strategy describes *what to do*, not a rewritten SPOV. The student does the conversion work themselves — that's the learning.

> **Changelog:** The original spec defines an Antimemetic Conversion as a student-driven submission flow: the student diagnoses barriers, writes a converted form, and the system scores the conversion attempt (1-5). The UX for this was never specified — no user flow for when the student would be prompted, how they'd submit, or where it lived in the Keystone Document interface. V1 replaces this with an automated assessment that runs post-grading. No student submission, no conversion score, no separate evaluation pipeline. The system diagnoses the barrier and provides a strategy. If the student acts on it, they rewrite their SPOV — which triggers re-grading through the existing pipeline. This is simpler, fits the current architecture, and can be extended into a full conversion flow later if needed.

**Model:** Quality-tier (Opus 4.6 primary, Sonnet 4.5 fallback). Temperature 0.3 (slightly higher for more creative strategy suggestions).

---

## Section 8 — UI Notes

DOK4 UI follows the same patterns as DOK3 (see `client/src/components/` DOK3 components). Three pieces need special treatment:

### Rejected SPOVs

SPOVs that fail the POV Validation Classifier get a distinct card type — visually different from graded DOK4s so it's immediately clear this was rejected, not scored. The card surfaces the rejection reason and feedback prominently. The student should understand what went wrong and what to do next without having to dig.

### LLM Divergence Comparison

The S2 criterion needs a dedicated UI element that makes the divergence check transparent to the student. It should show:
- The question that was derived from their SPOV
- What the vanilla LLM answered
- How the Quality Evaluator assessed the divergence

This is not a hidden internal signal — it's one of the most interesting pieces of feedback for the student and should be presented clearly.

### Re-linking DOK3s

A UI for students to dispute or change DOK3 links post-grading, triggering re-grading of the affected SPOV.

**Deferred.** Build this only if we see complaints about incorrect auto-linking. The agent-designated links may be good enough that this never gets used. No point building a re-linking interface preemptively.
